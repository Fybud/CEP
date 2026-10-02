import type { ChannelType, Prisma } from "../generated/client/index.js";

export type ChannelHealthLevel = "ok" | "warn" | "error" | "unknown";

export type ChannelHealth = {
  level: ChannelHealthLevel;
  summary: string;
  details: string[];
  watchExpiresAt?: string | null;
};

function asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function hasText(cfg: Record<string, unknown>, key: string): boolean {
  const v = cfg[key];
  return typeof v === "string" && v.trim().length > 0 && v !== "***";
}

export function computeChannelHealth(
  channelType: ChannelType,
  channelConfig: Prisma.JsonValue,
  enabled: boolean,
): ChannelHealth {
  if (!enabled) {
    return { level: "unknown", summary: "Disabled", details: ["Channel is disabled"] };
  }

  const cfg = asRecord(channelConfig);

  if (channelType === "whatsapp") {
    const details: string[] = [];
    if (!hasText(cfg, "accessToken")) details.push("Access token missing");
    if (!hasText(cfg, "phoneNumberId")) details.push("Phone Number ID missing");
    if (!hasText(cfg, "verifyToken")) details.push("Verify token missing");
    if (details.length) {
      return { level: "error", summary: "Not configured", details };
    }
    return { level: "ok", summary: "Credentials present", details: [] };
  }

  if (channelType === "instagram") {
    const details: string[] = [];
    if (!hasText(cfg, "accessToken")) details.push("Access token missing — use Connect");
    if (!hasText(cfg, "instagramAppId") && !hasText(cfg, "appId")) {
      details.push("Instagram App ID missing");
    }
    if (!hasText(cfg, "instagramAppSecret") && !hasText(cfg, "appSecret")) {
      details.push("Instagram App Secret missing");
    }
    if (!hasText(cfg, "verifyToken")) details.push("Verify token missing");
    if (details.length) {
      return { level: "error", summary: "Not configured", details };
    }
    return { level: "ok", summary: "Connected", details: [] };
  }

  if (channelType === "facebook") {
    const details: string[] = [];
    if (!hasText(cfg, "pageId")) details.push("Facebook Page ID missing");
    if (!hasText(cfg, "accessToken")) details.push("Page access token missing");
    if (!hasText(cfg, "verifyToken")) details.push("Verify token missing");
    if (details.length) {
      return { level: "error", summary: "Not configured", details };
    }
    return { level: "ok", summary: "Connected", details: [] };
  }

  // email / gmail
  const details: string[] = [];
  const hasOAuth = hasText(cfg, "refreshToken") || hasText(cfg, "accessToken");
  const hasClient = hasText(cfg, "clientId") && hasText(cfg, "clientSecret");
  const hasTopic = hasText(cfg, "pubsubTopic");
  const expRaw = cfg.watchExpiration;
  const exp =
    typeof expRaw === "number"
      ? expRaw
      : typeof expRaw === "string" && expRaw.trim()
        ? Number(expRaw)
        : 0;
  const watchExpiresAt = exp > 0 ? new Date(exp).toISOString() : null;
  const now = Date.now();
  const watchExpired = exp > 0 && exp < now;
  const watchSoon = exp > 0 && !watchExpired && exp < now + 2 * 24 * 60 * 60 * 1000;

  if (!hasClient) details.push("Gmail OAuth clientId/clientSecret missing");
  if (!hasOAuth) details.push("Reconnect Gmail — OAuth tokens missing");
  if (!hasTopic) details.push("Pub/Sub topic missing");
  if (watchExpired) details.push("Gmail watch expired");
  else if (!exp && hasOAuth) details.push("Watch not started");
  else if (watchSoon && watchExpiresAt) {
    details.push(`Watch expires soon (${new Date(exp).toLocaleString()})`);
  }

  if (!hasOAuth || !hasClient) {
    return { level: "error", summary: "Not connected", details, watchExpiresAt };
  }
  if (watchExpired || !hasTopic || !exp) {
    return {
      level: "warn",
      summary: watchExpired ? "Watch expired" : "Watch needs attention",
      details,
      watchExpiresAt,
    };
  }
  if (watchSoon) {
    return {
      level: "warn",
      summary: "Watch expiring soon",
      details,
      watchExpiresAt,
    };
  }
  return {
    level: "ok",
    summary: watchExpiresAt
      ? `Watch OK · expires ${new Date(exp).toLocaleString()}`
      : "Connected",
    details: [],
    watchExpiresAt,
  };
}
