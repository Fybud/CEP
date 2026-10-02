/**
 * Database bootstrap without `prisma migrate deploy` (hangs on Supabase pooler).
 *
 * Never DROPs tables. Fresh DB → apply all migration folders.
 * Existing DB → apply pending only.
 * To wipe data: `docker compose down -v` (removes the Postgres volume).
 */
import "../config/load-env.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/client/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(here, "../../prisma/migrations"),
    path.resolve(here, "../../../prisma/migrations"),
    path.resolve(process.cwd(), "prisma/migrations"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

const migrationsDir = resolveMigrationsDir();
const apiRoot = path.resolve(migrationsDir, "../..");

export function encodePasswordAtSigns(url: string): string {
  const schemeIdx = url.indexOf("://");
  if (schemeIdx < 0) return url;
  const rest = url.slice(schemeIdx + 3);
  const slashIdx = rest.search(/[/?]/);
  const authority = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
  const after = slashIdx >= 0 ? rest.slice(slashIdx) : "";
  const at = authority.lastIndexOf("@");
  if (at < 0) return url;
  const userinfo = authority.slice(0, at);
  const host = authority.slice(at + 1);
  const colon = userinfo.indexOf(":");
  if (colon < 0) return url;
  const user = userinfo.slice(0, colon);
  const password = userinfo.slice(colon + 1);
  if (!password.includes("@")) return url;
  return `${url.slice(0, schemeIdx + 3)}${user}:${password.replace(/@/g, "%40")}@${host}${after}`;
}

function resolveDatabaseUrl(): string {
  const raw =
    process.env.PLATFORM_MIGRATE_DATABASE_URL ||
    process.env.PLATFORM_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "";
  if (!raw) throw new Error("Missing PLATFORM_DATABASE_URL / PLATFORM_MIGRATE_DATABASE_URL");
  return encodePasswordAtSigns(raw.replace(/^["']|["']$/g, ""));
}

async function flag(
  prisma: PrismaClient,
  sql: string,
  ...params: unknown[]
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(sql, ...params);
  return Boolean(rows[0]?.exists);
}

async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  return flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`,
    table,
  );
}

function listMigrationFolders(): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function migrationSqlPath(folder: string): string {
  return path.join(migrationsDir, folder, "migration.sql");
}

async function ensureMigrationsTable(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function markApplied(prisma: PrismaClient, name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
    name,
  );
  if (rows.length) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
    randomUUID(),
    "bootstrap",
    name,
  );
}

function splitSql(sql: string): string[] {
  const chunks: string[] = [];
  let buf = "";
  let inDo = false;
  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!inDo && trimmed.startsWith("--")) continue;
    if (!inDo && /^DO\s+\$\$/i.test(trimmed)) inDo = true;
    buf += `${line}\n`;
    if (inDo && /\$\$\s*;\s*$/.test(trimmed)) {
      inDo = false;
      chunks.push(buf.trim());
      buf = "";
      continue;
    }
    if (!inDo && trimmed.endsWith(";") && !trimmed.startsWith("--")) {
      chunks.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}

async function applySqlFile(prisma: PrismaClient, filePath: string) {
  if (!existsSync(filePath)) throw new Error(`Missing SQL file: ${filePath}`);
  console.log(`[migrate] applying ${path.relative(apiRoot, filePath)}`);
  for (const chunk of splitSql(readFileSync(filePath, "utf8"))) {
    await prisma.$executeRawUnsafe(chunk);
  }
}

async function appliedMigrationNames(prisma: PrismaClient): Promise<Set<string>> {
  await ensureMigrationsTable(prisma);
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations"`,
  );
  return new Set(rows.map((r) => r.migration_name));
}

async function applyPendingMigrations(prisma: PrismaClient, folders: string[]) {
  const applied = await appliedMigrationNames(prisma);
  let appliedCount = 0;
  for (const folder of folders) {
    if (applied.has(folder)) continue;
    await applySqlFile(prisma, migrationSqlPath(folder));
    await markApplied(prisma, folder);
    appliedCount += 1;
    console.log(`[migrate] applied pending ${folder}`);
  }
  if (appliedCount === 0) {
    console.log("[migrate] No pending migrations — schema up to date");
  } else {
    console.log(`[migrate] Applied ${appliedCount} pending migration(s)`);
  }
}

/**
 * Idempotent safety nets for columns/tables that break the app if missing.
 * Covers deploys where a migration folder was delayed or partially applied.
 */
async function ensureCriticalSchema(prisma: PrismaClient) {
  // Enum value must exist before any query uses channelType: "web_chat"
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'web_chat'`,
    );
  } catch (err) {
    console.warn(
      "[migrate] safety net skipped (ChannelType.web_chat):",
      err instanceof Error ? err.message : err,
    );
  }

  const patches: Array<{ name: string; sql: string }> = [
    {
      name: "messages.pinned",
      sql: `ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "customers.custom_fields",
      sql: `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB`,
    },
    {
      name: "whatsapp_channel.intent",
      sql: `ALTER TABLE "whatsapp_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT`,
    },
    {
      name: "whatsapp_channel.intent_confidence",
      sql: `ALTER TABLE "whatsapp_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION`,
    },
    {
      name: "whatsapp_channel.intent_updated_at",
      sql: `ALTER TABLE "whatsapp_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3)`,
    },
    {
      name: "instagram_channel.intent",
      sql: `ALTER TABLE "instagram_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT`,
    },
    {
      name: "instagram_channel.intent_confidence",
      sql: `ALTER TABLE "instagram_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION`,
    },
    {
      name: "instagram_channel.intent_updated_at",
      sql: `ALTER TABLE "instagram_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3)`,
    },
    {
      name: "facebook_channel.intent",
      sql: `ALTER TABLE "facebook_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT`,
    },
    {
      name: "facebook_channel.intent_confidence",
      sql: `ALTER TABLE "facebook_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION`,
    },
    {
      name: "facebook_channel.intent_updated_at",
      sql: `ALTER TABLE "facebook_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3)`,
    },
    {
      name: "email_channel.intent",
      sql: `ALTER TABLE "email_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT`,
    },
    {
      name: "email_channel.intent_confidence",
      sql: `ALTER TABLE "email_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION`,
    },
    {
      name: "email_channel.intent_updated_at",
      sql: `ALTER TABLE "email_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3)`,
    },
    {
      name: "web_chat_channel.intent",
      sql: `ALTER TABLE "web_chat_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT`,
    },
    {
      name: "web_chat_channel.intent_confidence",
      sql: `ALTER TABLE "web_chat_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION`,
    },
    {
      name: "web_chat_channel.intent_updated_at",
      sql: `ALTER TABLE "web_chat_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3)`,
    },
    {
      name: "whatsapp_channel.intent_group",
      sql: `ALTER TABLE "whatsapp_channel" ADD COLUMN IF NOT EXISTS "intent_group" TEXT`,
    },
    {
      name: "instagram_channel.intent_group",
      sql: `ALTER TABLE "instagram_channel" ADD COLUMN IF NOT EXISTS "intent_group" TEXT`,
    },
    {
      name: "facebook_channel.intent_group",
      sql: `ALTER TABLE "facebook_channel" ADD COLUMN IF NOT EXISTS "intent_group" TEXT`,
    },
    {
      name: "email_channel.intent_group",
      sql: `ALTER TABLE "email_channel" ADD COLUMN IF NOT EXISTS "intent_group" TEXT`,
    },
    {
      name: "web_chat_channel.intent_group",
      sql: `ALTER TABLE "web_chat_channel" ADD COLUMN IF NOT EXISTS "intent_group" TEXT`,
    },
  ];

  for (const patch of patches) {
    try {
      await prisma.$executeRawUnsafe(patch.sql);
    } catch (err) {
      // Table may not exist yet on a brand-new DB before base migrations — ignore.
      console.warn(
        `[migrate] safety net skipped (${patch.name}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // conversation_pins / handover_notes — create if missing (same as latest migration)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "conversation_pins" (
        "id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "conversation_id" TEXT NOT NULL,
        "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "conversation_pins_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "conversation_pins_user_id_conversation_id_key"
        ON "conversation_pins"("user_id", "conversation_id")
    `);
  } catch (err) {
    console.warn(
      "[migrate] safety net skipped (conversation_pins):",
      err instanceof Error ? err.message : err,
    );
  }

  console.log("[migrate] Critical schema checks complete");
}

function redactDbHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export async function runDatabaseMigrations(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  process.env.PLATFORM_DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;

  console.log("[migrate] Auto-migrate on API startup");
  console.log(`[migrate] migrations dir: ${migrationsDir}`);
  console.log(`[migrate] connecting → ${redactDbHost(databaseUrl)}`);

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await prisma.$queryRawUnsafe(`SELECT 1`);
    const folders = listMigrationFolders();
    if (!folders.length) {
      throw new Error(`No prisma/migrations folders found under ${migrationsDir}`);
    }
    console.log(`[migrate] found ${folders.length} migration folder(s)`);

    const empty =
      !(await tableExists(prisma, "users")) && !(await tableExists(prisma, "customers"));
    console.log(
      empty
        ? "[migrate] Empty database — applying migrations"
        : "[migrate] Existing database — applying pending migrations only (never wipes)",
    );

    await applyPendingMigrations(prisma, folders);
    await ensureCriticalSchema(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/migrate.ts") ||
    path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/migrate.js")
  : false;

if (invokedDirectly) {
  runDatabaseMigrations()
    .then(() => {
      console.log("[migrate] OK");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate] FAILED", err);
      process.exit(1);
    });
}
