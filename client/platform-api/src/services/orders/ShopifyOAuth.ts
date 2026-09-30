import { createHmac, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { prisma } from "../../config/db.js";
import { settingsReturnUrl } from "../OAuthService.js";
import { clearShopifyTokenCache } from "./shopify.client.js";
import type { Prisma } from "../../generated/client/index.js";

const SHOPIFY_SCOPES = "read_customers,read_orders";
const PENDING_TTL_MS = 20 * 60 * 1000;

type PendingShopify = {
  shop: string;
  clientId: string;
  clientSecret: string;
  expiresAt: number;
};

type ShopifyState = {
  purpose: "oauth";
  provider: "shopify";
  shop: string;
  nonce: string;
};

const pending = new Map<string, PendingShopify>();

export function shopifyRedirectUri(): string {
  return `${env.apiBaseUrl.replace(/\/$/, "")}/oauth/shopify/callback`;
}

export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase().replace(/\.myshopify\.com$/i, "");
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v === "***") return null;
  return v;
}

function asMeta(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

async function exchangeClientCredentials(input: {
  shop: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const res = await fetch(`https://${input.shop}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "client_credentials",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(
      body.error_description || body.error || `Shopify token failed HTTP ${res.status}`,
    );
  }
  return body.access_token;
}

function needsMerchantInstall(message: string): boolean {
  return /client credentials cannot be performed/i.test(message);
}

export async function startShopifyOAuth(creds: {
  shop?: string;
  clientId?: string;
  clientSecret?: string;
}): Promise<{ url?: string; redirectUri: string; connected?: boolean }> {
  const shop = normalizeShopDomain(nonEmpty(creds.shop) ?? "");
  const clientId = nonEmpty(creds.clientId);
  const clientSecret = nonEmpty(creds.clientSecret);
  if (!shop || !clientId || !clientSecret) {
    throw new Error("Enter shop subdomain, Client ID, and Client Secret, then click Connect.");
  }

  try {
    const accessToken = await exchangeClientCredentials({ shop, clientId, clientSecret });
    await persistShopify({
      shop,
      clientId,
      clientSecret,
      accessToken,
      authMode: "client_credentials",
    });
    return { connected: true, redirectUri: shopifyRedirectUri() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!needsMerchantInstall(message)) throw err;
  }

  const nonce = randomUUID();
  pending.set(nonce, { shop, clientId, clientSecret, expiresAt: Date.now() + PENDING_TTL_MS });
  const state = jwt.sign(
    { purpose: "oauth", provider: "shopify", shop, nonce } satisfies ShopifyState,
    env.jwtSecret,
    { expiresIn: "20m" },
  );
  const redirectUri = shopifyRedirectUri();
  const url = new URL(`https://${shop}.myshopify.com/admin/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SHOPIFY_SCOPES);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return { url: url.toString(), redirectUri };
}

function verifyHmac(query: Record<string, string>, clientSecret: string): boolean {
  const hmac = query.hmac;
  if (!hmac) return false;
  const message = Object.keys(query)
    .filter((k) => k !== "hmac")
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&");
  const digest = createHmac("sha256", clientSecret).update(message).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  } catch {
    return false;
  }
}

function queryStrings(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") out[key] = value[0];
  }
  return out;
}

async function persistShopify(input: {
  shop: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  authMode: "oauth" | "client_credentials";
}) {
  const existing = await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } });
  const metadata = asMeta(existing?.metadata);
  metadata.accessToken = input.accessToken;
  metadata.authMode = input.authMode;
  metadata.scope = SHOPIFY_SCOPES;
  delete metadata.error;
  await prisma.shopifyConfig.upsert({
    where: { id: "shopify_default" },
    create: {
      id: "shopify_default",
      shop: input.shop,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      metadata: metadata as Prisma.InputJsonValue,
    },
    update: {
      shop: input.shop,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
  clearShopifyTokenCache();
}

export async function completeShopifyOAuth(queryRaw: Record<string, unknown>): Promise<{
  returnUrl: string;
}> {
  const q = queryStrings(queryRaw);
  if (q.error) {
    throw new Error(q.error_description || q.error);
  }
  if (!q.code || !q.state || !q.shop) {
    throw new Error("Missing Shopify OAuth code or shop");
  }

  const decoded = jwt.verify(q.state, env.jwtSecret) as ShopifyState;
  if (decoded.purpose !== "oauth" || decoded.provider !== "shopify" || !decoded.nonce) {
    throw new Error("invalid oauth state");
  }
  const entry = pending.get(decoded.nonce);
  pending.delete(decoded.nonce);
  if (!entry || Date.now() > entry.expiresAt) {
    throw new Error("Shopify connection expired. Click Connect again.");
  }

  const shop = normalizeShopDomain(q.shop);
  if (shop !== entry.shop) {
    throw new Error("Shopify store does not match Connect");
  }
  if (!verifyHmac(q, entry.clientSecret)) {
    throw new Error("Shopify callback signature was invalid");
  }

  const res = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: entry.clientId,
      client_secret: entry.clientSecret,
      code: q.code,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || `Shopify OAuth HTTP ${res.status}`);
  }

  await persistShopify({
    shop,
    clientId: entry.clientId,
    clientSecret: entry.clientSecret,
    accessToken: body.access_token,
    authMode: "oauth",
  });

  return {
    returnUrl: settingsReturnUrl({ oauth: "shopify", status: "success" }),
  };
}
