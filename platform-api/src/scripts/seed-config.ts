/**
 * Seed channel + Shopify credentials into DB (NOT from .env).
 *
 * Copy seed.creds.example.json → seed.creds.json, fill values, then:
 *   npm run seed:config
 *   npm run seed:config -- --file ./path/to/creds.json
 *
 * Only non-empty fields are written. Restarting the API will not overwrite these from .env.
 */
import "../config/load-env.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../config/db.js";
import {
  ensureWorkspace,
  upsertChannelConfigSeed,
  upsertShopifyConfigSeed,
} from "../services/WorkspaceService.js";

type SeedFile = {
  whatsapp?: Record<string, string>;
  instagram?: Record<string, string>;
  facebook?: Record<string, string>;
  email?: Record<string, string>;
  shopify?: {
    shop?: string;
    clientId?: string;
    clientSecret?: string;
  };
};

function argFile(): string | undefined {
  const idx = process.argv.indexOf("--file");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function pickNonEmpty(obj: Record<string, string> | undefined): Record<string, string> {
  if (!obj) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || t.startsWith("your_")) continue;
    out[k] = t;
  }
  return out;
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot = path.resolve(here, "../..");
  const filePath = path.resolve(apiRoot, argFile() || "seed.creds.json");

  if (!existsSync(filePath)) {
    console.error(
      `[seed:config] Missing ${filePath}\n` +
        `Copy seed.creds.example.json → seed.creds.json and fill in credentials.`,
    );
    process.exit(1);
  }

  let data: SeedFile;
  try {
    data = JSON.parse(readFileSync(filePath, "utf8")) as SeedFile;
  } catch (err) {
    console.error("[seed:config] Invalid JSON:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  await ensureWorkspace();

  const wa = pickNonEmpty(data.whatsapp);
  if (Object.keys(wa).length) {
    await upsertChannelConfigSeed("whatsapp", wa, true);
    console.log(`[seed:config] whatsapp updated (${Object.keys(wa).join(", ")})`);
  }

  const igRaw = pickNonEmpty(data.instagram);
  if (Object.keys(igRaw).length) {
    const ig = { ...igRaw };
    if (!ig.instagramAppSecret && ig.appSecret) {
      ig.instagramAppSecret = ig.appSecret;
    }
    delete ig.appSecret;
    delete ig.pageId;
    await upsertChannelConfigSeed("instagram", ig, true);
    console.log(`[seed:config] instagram updated (${Object.keys(ig).join(", ")})`);
  }

  const fb = pickNonEmpty(data.facebook);
  if (Object.keys(fb).length) {
    await upsertChannelConfigSeed("facebook", fb, true);
    console.log(`[seed:config] facebook updated (${Object.keys(fb).join(", ")})`);
  }

  const em = pickNonEmpty(data.email);
  if (Object.keys(em).length) {
    await upsertChannelConfigSeed("email", em, true);
    console.log(`[seed:config] email updated (${Object.keys(em).join(", ")})`);
  }

  if (data.shopify) {
    const shop = pickNonEmpty({
      shop: data.shopify.shop ?? "",
      clientId: data.shopify.clientId ?? "",
      clientSecret: data.shopify.clientSecret ?? "",
    });
    if (Object.keys(shop).length) {
      await upsertShopifyConfigSeed(shop);
      console.log(`[seed:config] shopify updated (${Object.keys(shop).join(", ")})`);
    }
  }

  console.log("[seed:config] done — values are in DB; API restart will not read channel secrets from .env");
}

main()
  .catch((err) => {
    console.error("[seed:config] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
