import { PrismaClient } from "../generated/client/index.js";
import { env } from "./env.js";

/**
 * Tune Prisma's client-side pool for a single long-lived API process.
 * Supabase transaction pooler is shared — keep this modest and avoid stampeding it
 * with parallel Gmail ingest (see EmailService lock).
 */
function withPoolParams(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    if (!u.searchParams.has("connection_limit")) {
      // Default Prisma pool is too large for small Supabase pools; error showed limit 3.
      u.searchParams.set("connection_limit", "5");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "30");
    }
    return u.toString();
  } catch {
    return databaseUrl;
  }
}

export const prisma = new PrismaClient({
  datasources: { db: { url: withPoolParams(env.databaseUrl) } },
});
