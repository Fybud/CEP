import type { ChannelAdapter, ChannelConfig, ChannelType } from "./types.js";
import { emailAdapter } from "../email/index.js";
import { instagramAdapter } from "../instagram/index.js";
import { facebookAdapter } from "../facebook/index.js";
import { whatsappAdapter } from "../whatsapp/index.js";
import { whatsappConfig } from "../whatsapp/config.js";
import { instagramConfig } from "../instagram/config.js";
import { facebookConfig } from "../facebook/config.js";
import { emailConfig } from "../email/config.js";
import { webChatAdapter } from "../webchat/index.js";

const adapters: Record<ChannelType, ChannelAdapter> = {
  whatsapp: whatsappAdapter as ChannelAdapter,
  instagram: instagramAdapter as ChannelAdapter,
  facebook: facebookAdapter as ChannelAdapter,
  email: emailAdapter as ChannelAdapter,
  web_chat: webChatAdapter as ChannelAdapter,
};

export function getChannelAdapter(channelType: ChannelType): ChannelAdapter {
  const adapter = adapters[channelType];
  if (!adapter) {
    throw new Error(`Unsupported channel: ${channelType}`);
  }
  return adapter;
}

/** Email channel uses Gmail — same as getChannelAdapter("email"). */
export function getEmailAdapter(_channelConfig?: unknown): ChannelAdapter {
  return emailAdapter as ChannelAdapter;
}

export function assertChannelConfig(
  _channelType: ChannelType,
  config: unknown,
): ChannelConfig {
  if (!config || typeof config !== "object") {
    throw new Error("channelConfig must be an object");
  }
  return config as ChannelConfig;
}

/** Trim secrets; strip accidental "Bearer " prefix; drop placeholders. */
export function normalizeSecret(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let v = value.trim();
  if (!v || v === "***" || v.startsWith("your_")) return undefined;
  if (/^bearer\s+/i.test(v)) v = v.replace(/^bearer\s+/i, "").trim();
  return v || undefined;
}

function mergeConfig<T extends Record<string, unknown>>(
  defaults: T,
  override: Record<string, unknown>,
): T {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(override)) {
    if (key === "mock") continue;
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const normalized =
        key.toLowerCase().includes("token") || key.toLowerCase().includes("secret")
          ? normalizeSecret(value)
          : value.trim();
      if (!normalized) continue;
      merged[key] = normalized;
      continue;
    }
    if (key === "provider" || key.startsWith("smtp") || key.startsWith("imap")) continue;
    merged[key] = value;
  }
  delete merged.mock;
  delete merged.provider;
  return merged as T;
}

/**
 * Resolve effective channel config from DB/Settings only.
 * Never overlays .env — vendors configure via UI or `npm run seed:config`.
 */
export function resolveChannelConfig(
  channelType: ChannelType,
  accountConfig: unknown,
): ChannelConfig {
  const raw =
    accountConfig && typeof accountConfig === "object" && !Array.isArray(accountConfig)
      ? (accountConfig as Record<string, unknown>)
      : {};

  if (channelType === "whatsapp") {
    return mergeConfig({ ...whatsappConfig } as Record<string, unknown>, raw) as unknown as ChannelConfig;
  }
  if (channelType === "instagram") {
    // Migrate legacy key appSecret → instagramAppSecret (read path)
    const migrated: Record<string, unknown> = { ...raw };
    if (!normalizeSecret(migrated.instagramAppSecret) && normalizeSecret(migrated.appSecret)) {
      migrated.instagramAppSecret = migrated.appSecret;
    }
    delete migrated.appSecret;
    delete migrated.pageId;
    return mergeConfig(
      { ...instagramConfig } as Record<string, unknown>,
      migrated,
    ) as unknown as ChannelConfig;
  }
  if (channelType === "facebook") {
    return mergeConfig({ ...facebookConfig } as Record<string, unknown>, raw) as unknown as ChannelConfig;
  }
  if (channelType === "web_chat") {
    return raw as unknown as ChannelConfig;
  }
  return mergeConfig({ ...emailConfig } as Record<string, unknown>, raw) as unknown as ChannelConfig;
}

/** Normalize Instagram JSON in DB: rename legacy keys, drop unused pageId. */
export function normalizeInstagramChannelConfigStored(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...existing };
  if (
    (typeof next.instagramAppSecret !== "string" || !next.instagramAppSecret.trim()) &&
    typeof next.appSecret === "string" &&
    next.appSecret.trim()
  ) {
    next.instagramAppSecret = next.appSecret;
  }
  delete next.appSecret;
  delete next.pageId;
  return next;
}

export * from "./types.js";
export { whatsappAdapter } from "../whatsapp/index.js";
export { instagramAdapter } from "../instagram/index.js";
export { facebookAdapter } from "../facebook/index.js";
export {
  emailAdapter,
  getEmailClient,
  getGmailClient,
  extractEmailAddress,
  extractEmailThreading,
  buildReplyReferences,
  looksLikeRfcMessageId,
  gmailAdapter,
} from "../email/index.js";
