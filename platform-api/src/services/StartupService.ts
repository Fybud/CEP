import { prisma } from "../config/db.js";
import {
  normalizeInstagramChannelConfigStored,
  resolveChannelConfig,
  type EmailChannelConfig,
  type InstagramChannelConfig,
  type FacebookChannelConfig,
  type WhatsAppChannelConfig,
} from "../adapters/shared/index.js";
import { ensureWorkspace } from "./WorkspaceService.js";
import { catchUpRecentEmailMessages, renewEmailWatch } from "./EmailService.js";
import { renewInstagramTokens, subscribeInstagramMessaging } from "./OAuthService.js";
import { isShopifyConfigured } from "./orders/shopify.client.js";
import type { Prisma } from "../generated/client/index.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasString(config: Record<string, unknown>, key: string): boolean {
  const v = config[key];
  return typeof v === "string" && v.trim().length > 0 && v !== "***";
}

/**
 * Boot: ensure empty config rows exist, then probe channels from DB only.
 * Never overlays .env onto Settings.
 */
export async function bootstrapRuntime(): Promise<void> {
  try {
    await ensureWorkspace();
  } catch (err) {
    console.error(
      "[boot] ensureWorkspace failed:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  if (await isShopifyConfigured()) {
    console.log("[boot:shopify] configured (shopify_config table)");
  } else {
    console.warn("[boot:shopify] not configured — Settings → Shopify or npm run seed:config");
  }

  await migrateInstagramConfigKeys();
  await Promise.all([prepareWhatsApp(), prepareInstagram(), prepareFacebook(), prepareEmail()]);
}

/** Persist Instagram key rename: appSecret → instagramAppSecret; drop pageId. */
async function migrateInstagramConfigKeys() {
  try {
    const rows = await prisma.channelConfig.findMany({ where: { channelType: "instagram" } });
    for (const row of rows) {
      if (!row.channelConfig || typeof row.channelConfig !== "object" || Array.isArray(row.channelConfig)) {
        continue;
      }
      const prev = row.channelConfig as Record<string, unknown>;
      const next = normalizeInstagramChannelConfigStored(prev);
      const changed =
        JSON.stringify(prev) !== JSON.stringify(next);
      if (!changed) continue;
      await prisma.channelConfig.update({
        where: { id: row.id },
        data: { channelConfig: next as Prisma.InputJsonValue },
      });
      console.log("[boot:instagram] migrated channelConfig keys (instagramAppSecret)");
    }
  } catch (err) {
    console.warn("[boot:instagram] key migrate:", err instanceof Error ? err.message : err);
  }
}

async function prepareWhatsApp() {
  try {
    const inbox = await prisma.channelConfig.findFirst({
      where: { channelType: "whatsapp" },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    if (!inbox) {
      console.warn("[boot:whatsapp] no channel config");
      return;
    }
    const cfg = resolveChannelConfig("whatsapp", inbox.channelConfig) as WhatsAppChannelConfig;
    const phoneNumberId = String(cfg.phoneNumberId ?? "").trim();
    let accessToken = String(cfg.accessToken ?? "").trim();
    if (/^bearer\s+/i.test(accessToken)) {
      accessToken = accessToken.replace(/^bearer\s+/i, "").trim();
    }
    if (!phoneNumberId || !accessToken) {
      console.warn(
        "[boot:whatsapp] incomplete — Settings → Channels or npm run seed:config",
      );
      return;
    }

    const probe = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = (await probe.json().catch(() => ({}))) as {
      id?: string;
      display_phone_number?: string;
      error?: { message?: string; code?: number };
    };
    if (!probe.ok || body.error) {
      console.error(
        `[boot:whatsapp] AUTH FAIL: ${body.error?.message ?? `HTTP ${probe.status}`}. ` +
          `Update the access token in Settings → Channels.`,
      );
      return;
    }

    if (!inbox.enabled) {
      await prisma.channelConfig.update({ where: { id: inbox.id }, data: { enabled: true } });
    }

    console.log(
      `[boot:whatsapp] auth ok phone=${body.display_phone_number ?? body.id ?? phoneNumberId}`,
    );
  } catch (err) {
    console.warn("[boot:whatsapp]", err instanceof Error ? err.message : err);
  }
}

async function prepareInstagram() {
  try {
    const inbox = await prisma.channelConfig.findFirst({
      where: { channelType: "instagram" },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    if (!inbox) {
      console.warn("[boot:instagram] no channel config");
      return;
    }
    const cfg = resolveChannelConfig("instagram", inbox.channelConfig) as InstagramChannelConfig;
    if (!cfg.accessToken) {
      console.warn(
        "[boot:instagram] incomplete — Settings → Channels or Connect / seed:config",
      );
      return;
    }

    if (cfg.verifyToken && !inbox.enabled) {
      await prisma.channelConfig.update({ where: { id: inbox.id }, data: { enabled: true } });
    }

    await renewInstagramTokens();
    const latest = await prisma.channelConfig.findUnique({ where: { id: inbox.id } });
    const token =
      latest && latest.channelConfig && typeof latest.channelConfig === "object" && !Array.isArray(latest.channelConfig)
        ? String((latest.channelConfig as Record<string, unknown>).accessToken ?? cfg.accessToken)
        : cfg.accessToken;

    const sub = await subscribeInstagramMessaging(token);
    console.log(
      sub.ok
        ? "[boot:instagram] subscribed messaging"
        : `[boot:instagram] subscribe soft-failed: ${sub.error ?? "unknown"}`,
    );
  } catch (err) {
    console.warn("[boot:instagram]", err instanceof Error ? err.message : err);
  }
}

async function prepareFacebook() {
  try {
    const inbox = await prisma.channelConfig.findFirst({
      where: { channelType: "facebook" },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    if (!inbox) {
      console.warn("[boot:facebook] no channel config");
      return;
    }
    const cfg = resolveChannelConfig("facebook", inbox.channelConfig) as FacebookChannelConfig;
    if (!cfg.accessToken || !cfg.pageId) {
      console.warn(
        "[boot:facebook] incomplete — Settings → Channels or seed:config",
      );
      return;
    }

    if (cfg.verifyToken && !inbox.enabled) {
      await prisma.channelConfig.update({ where: { id: inbox.id }, data: { enabled: true } });
    }

    const probe = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.pageId)}?fields=id,name`,
      { headers: { Authorization: `Bearer ${cfg.accessToken}` } },
    );
    const body = (await probe.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      error?: { message?: string; code?: number };
    };
    if (!probe.ok || body.error) {
      console.warn(
        `[boot:facebook] auth check: ${body.error?.message ?? `HTTP ${probe.status}`}`,
      );
      return;
    }
    console.log(`[boot:facebook] auth ok page=${body.name ?? body.id ?? cfg.pageId}`);
  } catch (err) {
    console.warn("[boot:facebook]", err instanceof Error ? err.message : err);
  }
}

async function prepareEmail() {
  try {
    const inbox = await prisma.channelConfig.findFirst({
      where: { channelType: "email" },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    if (!inbox) {
      console.warn("[boot:email] no channel config");
      return;
    }

    const cfg = resolveChannelConfig("email", inbox.channelConfig) as EmailChannelConfig;
    const raw = asRecord(inbox.channelConfig);
    const hasOAuth =
      hasString(raw, "refreshToken") ||
      hasString(raw, "accessToken") ||
      Boolean(cfg.refreshToken || cfg.accessToken);
    const hasTopic = Boolean(cfg.pubsubTopic?.trim());

    if (!hasOAuth || !hasTopic) {
      console.warn(
        `[boot:email] incomplete oauth=${hasOAuth} pubsubTopic=${hasTopic} — Settings or seed:config`,
      );
      return;
    }

    if (!inbox.enabled) {
      await prisma.channelConfig.update({ where: { id: inbox.id }, data: { enabled: true } });
    }

    const results = await renewEmailWatch(inbox.id);
    for (const r of results) {
      if (r.ok) {
        console.log(`[boot:email] watch ready expires=${r.expiresAt ?? "?"}`);
      } else {
        console.warn(`[boot:email] watch failed: ${r.error}`);
      }
    }

    const catchUp = await catchUpRecentEmailMessages(inbox.id);
    console.log(
      `[boot:email] catch-up processed=${catchUp.processed} skipped=${catchUp.skipped}`,
    );
  } catch (err) {
    console.warn("[boot:email]", err instanceof Error ? err.message : err);
  }
}
