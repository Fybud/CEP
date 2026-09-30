import "./load-env.js";

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

/** Encode bare @ in DB password (user:p@ss@host → user:p%40ss@host). */
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

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return stripQuotes(value);
}

function optional(name: string): string {
  return stripQuotes(process.env[name] ?? "").trim();
}

const rawDatabaseUrl = required(
  "PLATFORM_DATABASE_URL",
  "postgresql://cep:cep@localhost:5434/cep_platform",
);

/**
 * Runtime .env is only for infrastructure (DB, JWT, public URLs).
 * Channel / Shopify / login secrets live in the database (Settings UI or seed scripts).
 */
export const env = {
  port: Number(process.env.PLATFORM_PORT ?? process.env.PORT ?? 4100),
  databaseUrl: encodePasswordAtSigns(rawDatabaseUrl),
  migrateDatabaseUrl: encodePasswordAtSigns(
    stripQuotes(
      process.env.PLATFORM_MIGRATE_DATABASE_URL ||
        process.env.PLATFORM_DATABASE_URL ||
        rawDatabaseUrl,
    ),
  ),
  jwtSecret: required("JWT_SECRET", process.env.JWT_SECRET ?? "dev-jwt-secret-do-not-use-in-prod"),
  apiBaseUrl: stripQuotes(
    process.env.PLATFORM_API_BASE_URL ??
      `http://localhost:${process.env.PLATFORM_PORT ?? 4100}`,
  ),
  webBaseUrl: stripQuotes(
    process.env.PLATFORM_WEB_BASE_URL ??
      process.env.WEB_PUBLIC_BASE_URL ??
      "http://localhost:5173",
  ),
  gmailClientId: optional("GMAIL_CLIENT_ID"),
  gmailClientSecret: optional("GMAIL_CLIENT_SECRET"),
  gmailPubsubTopic: optional("GMAIL_PUBSUB_TOPIC"),
  /** Classic ML intent classifier service (not an LLM). Empty = disabled. */
  intentClassifierUrl: optional("INTENT_CLASSIFIER_URL") || "http://127.0.0.1:8091",
  MOCK: optional("mock")?.toLowerCase() === "true" || optional("MOCK")?.toLowerCase() === "true",
};

process.env.PLATFORM_DATABASE_URL = env.databaseUrl;
process.env.DATABASE_URL = env.databaseUrl;
if (!process.env.PLATFORM_MIGRATE_DATABASE_URL) {
  process.env.PLATFORM_MIGRATE_DATABASE_URL = env.migrateDatabaseUrl;
}
