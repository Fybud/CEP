import { prisma } from "../../config/db.js";
import { normalizeWhatsAppDigits, parseWhatsAppParts } from "../../utils/phone.js";

type ShopifyCreds = {
  shop: string;
  clientId: string;
  clientSecret: string;
};

const SHOPIFY_API_VERSION = "2024-10";

type TokenCache = {
  key: string;
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

function normalizeShop(shop: string): string {
  return shop.trim().replace(/\.myshopify\.com$/i, "");
}

export function normalizePhoneDigits(value?: string | null): string | null {
  return normalizeWhatsAppDigits(value);
}

/** Prefer E.164 for Shopify search (`+916303481401`). */
export function toE164Phone(value?: string | null): string | null {
  const digits = normalizeWhatsAppDigits(value);
  if (!digits) return null;
  const { dial, national } = parseWhatsAppParts(digits);
  return national ? `+${dial}${national}` : `+${digits}`;
}

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function storedAccessToken(metadata: unknown): string {
  const token = asMeta(metadata).accessToken;
  return typeof token === "string" ? token.trim() : "";
}

/** DB / Settings only — never falls back to .env. */
export async function resolveShopifyCredentials(): Promise<ShopifyCreds | null> {
  try {
    const row = await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } });
    if (!row) return null;
    const shop = normalizeShop(row.shop?.trim() || "");
    const clientId = row.clientId?.trim() || "";
    const clientSecret = row.clientSecret?.trim() || "";
    if (!shop || !clientId || !clientSecret) return null;
    return { shop, clientId, clientSecret };
  } catch {
    return null;
  }
}

export async function isShopifyConfigured(): Promise<boolean> {
  try {
    const row = await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } });
    if (!row) return false;
    const shop = normalizeShop(row.shop?.trim() || "");
    const clientId = row.clientId?.trim() || "";
    const clientSecret = row.clientSecret?.trim() || "";
    if (!shop || !clientId || !clientSecret) return false;
    return Boolean(storedAccessToken(row.metadata));
  } catch {
    return false;
  }
}

export function clearShopifyTokenCache() {
  tokenCache = null;
}

/** @deprecated Prefer isShopifyConfigured() — sync helper no longer reads .env. */
export function isShopifyConfiguredSync(): boolean {
  return false;
}

export function shopifyShopDomain(shop: string): string {
  const s = normalizeShop(shop);
  if (!s) throw new Error("Shopify shop missing in shopify_config");
  return `${s}.myshopify.com`;
}

async function fetchAccessToken(creds: ShopifyCreds): Promise<string> {
  const now = Date.now();
  const key = `${creds.shop}:${creds.clientId}`;
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const row = await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } });
  const installed = storedAccessToken(row?.metadata);
  if (installed) {
    tokenCache = { key, accessToken: installed, expiresAt: now + 24 * 60 * 60 * 1000 };
    return installed;
  }

  const res = await fetch(`https://${shopifyShopDomain(creds.shop)}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    throw new Error(
      body.error_description || body.error || `Shopify token failed HTTP ${res.status}`,
    );
  }

  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 86399;
  tokenCache = {
    key,
    accessToken: body.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  return body.access_token;
}

export async function shopifyAdminFetch<T = unknown>(
  path: string,
  init?: RequestInit & { absoluteUrl?: string },
): Promise<T> {
  const creds = await resolveShopifyCredentials();
  if (!creds) throw new Error("Shopify is not configured (Settings → Shopify or seed:config)");

  const token = await fetchAccessToken(creds);
  const url = init?.absoluteUrl
    ? init.absoluteUrl
    : `https://${shopifyShopDomain(creds.shop)}/admin/api/${SHOPIFY_API_VERSION}${path.startsWith("/") ? path : `/${path}`}`;

  const { absoluteUrl: _a, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...(rest.headers ?? {}),
    },
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const err = json as { errors?: unknown; error?: string };
    throw new Error(
      typeof err.errors === "string"
        ? err.errors
        : err.error || `Shopify API HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  return json as T;
}
