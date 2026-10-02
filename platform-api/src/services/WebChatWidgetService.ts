import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { ulid } from "ulid";
import { isFeatureEnabled } from "./FeatureService.js";

export type WebChatChannelConfigJson = {
  /** @deprecated Ignored — access is origin allowlist only. Kept for older configs. */
  widgetKey?: string;
  allowedOrigins?: string[];
};

export function parseWebChatConfig(raw: unknown): WebChatChannelConfigJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const allowedOrigins = Array.isArray(obj.allowedOrigins)
    ? obj.allowedOrigins
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
  return { allowedOrigins };
}

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function extractRequestOrigin(request: FastifyRequest): string | null {
  const originHeader = request.headers.origin;
  if (typeof originHeader === "string" && originHeader.trim()) {
    return normalizeOrigin(originHeader);
  }
  const referer = request.headers.referer;
  if (typeof referer === "string" && referer.trim()) {
    return normalizeOrigin(referer);
  }
  return null;
}

/** CEP app hosts are always allowed (preview + in-app widget) — no allowlist entry needed. */
function isCepPlatformOrigin(requestOrigin: string): boolean {
  const webBase = normalizeOrigin(env.webBaseUrl);
  if (webBase && requestOrigin === webBase) return true;

  let reqHost: string;
  try {
    reqHost = new URL(requestOrigin).hostname.toLowerCase();
  } catch {
    return false;
  }

  // api.cep-demo.fybud.com → allow https://cep-demo.fybud.com (+ www)
  const apiBase = normalizeOrigin(env.apiBaseUrl);
  if (apiBase) {
    try {
      const apiHost = new URL(apiBase).hostname.toLowerCase();
      if (apiHost.startsWith("api.")) {
        const appHost = apiHost.slice(4);
        if (reqHost === appHost || reqHost === `www.${appHost}`) return true;
      }
      if (reqHost === apiHost) return true;
    } catch {
      /* ignore */
    }
  }

  // Also accept www / apex variants of PLATFORM_WEB_BASE_URL
  if (webBase) {
    try {
      const webHost = new URL(webBase).hostname.toLowerCase();
      if (reqHost === webHost || reqHost === `www.${webHost}`) return true;
      if (webHost.startsWith("www.") && reqHost === webHost.slice(4)) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

function isOriginAllowed(requestOrigin: string | null, allowedOrigins: string[]): boolean {
  if (!requestOrigin) return false;

  // CEP /chat preview and platform web app — always allowed.
  if (isCepPlatformOrigin(requestOrigin)) return true;

  const normalizedAllowed = allowedOrigins
    .map((o) => normalizeOrigin(o))
    .filter((o): o is string => Boolean(o));

  // No customer domains configured → only CEP preview works.
  if (normalizedAllowed.length === 0) return false;

  return normalizedAllowed.includes(requestOrigin);
}

function isMissingWebChatEnumError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes('invalid input value for enum "ChannelType"') &&
    msg.includes("web_chat")
  );
}

/** Ensure web_chat ChannelConfig exists. */
export async function ensureWebChatChannelConfig() {
  const existing = await prisma.channelConfig.findFirst({
    where: { channelType: "web_chat" },
  });

  if (!existing) {
    return prisma.channelConfig.create({
      data: {
        id: ulid(),
        name: "Web Chat",
        channelType: "web_chat",
        channelConfig: {
          allowedOrigins: [],
        },
        enabled: true,
      },
    });
  }

  if (existing.enabled) return existing;

  return prisma.channelConfig.update({
    where: { id: existing.id },
    data: { enabled: true },
  });
}

export async function getWebChatSettings() {
  const cfg = await ensureWebChatChannelConfig();
  const parsed = parseWebChatConfig(cfg.channelConfig);
  return {
    enabled: cfg.enabled,
    allowedOrigins: parsed.allowedOrigins ?? [],
  };
}

export async function updateWebChatSettings(input: { allowedOrigins?: string[] }) {
  const cfg = await ensureWebChatChannelConfig();
  const parsed = parseWebChatConfig(cfg.channelConfig);
  const next: WebChatChannelConfigJson = {
    allowedOrigins:
      input.allowedOrigins !== undefined
        ? input.allowedOrigins.map((o) => o.trim()).filter(Boolean)
        : parsed.allowedOrigins ?? [],
  };

  const updated = await prisma.channelConfig.update({
    where: { id: cfg.id },
    data: { channelConfig: next as object },
  });

  const out = parseWebChatConfig(updated.channelConfig);
  return {
    enabled: updated.enabled,
    allowedOrigins: out.allowedOrigins ?? [],
  };
}

/** Validate feature flag + Origin/Referer allowlist on public embed APIs. */
export async function assertWebChatWidgetAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const featureOn = await isFeatureEnabled("web_chat_channel", false);
    if (!featureOn) {
      void reply.code(403).send({ error: "Web chat is not enabled for this workspace" });
      return false;
    }

    const cfg = await ensureWebChatChannelConfig();
    if (!cfg.enabled) {
      void reply.code(403).send({ error: "Web chat is disabled" });
      return false;
    }

    const parsed = parseWebChatConfig(cfg.channelConfig);
    const requestOrigin = extractRequestOrigin(request);
    if (!isOriginAllowed(requestOrigin, parsed.allowedOrigins ?? [])) {
      void reply.code(403).send({
        error:
          "Origin not allowed. Add this site’s domain under Settings → Web Chat.",
      });
      return false;
    }

    return true;
  } catch (err) {
    if (isMissingWebChatEnumError(err)) {
      void reply.code(503).send({
        error:
          "Web Chat is not ready on this database yet. Restart the API so migrations can add ChannelType.web_chat, then try again.",
      });
      return false;
    }
    void reply.code(500).send({
      error: err instanceof Error ? err.message : "Web chat access check failed",
    });
    return false;
  }
}
