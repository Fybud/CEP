import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { mergeChannelConfig } from "./MessagingService.js";
import { normalizeInstagramChannelConfigStored } from "../adapters/shared/index.js";
import { computeChannelHealth } from "./ChannelHealth.js";
import { redactChannelConfigForClient } from "./SecretRedaction.js";
import type { ChannelType, Prisma } from "../generated/client/index.js";

function shapeChannelConfig(row: {
  id: string;
  name: string;
  channelType: ChannelType;
  channelConfig: Prisma.JsonValue;
  enabled: boolean;
}) {
  const base = env.apiBaseUrl.replace(/\/$/, "");
  let channelConfig = row.channelConfig;
  if (
    row.channelType === "instagram" &&
    channelConfig &&
    typeof channelConfig === "object" &&
    !Array.isArray(channelConfig)
  ) {
    channelConfig = normalizeInstagramChannelConfigStored(
      channelConfig as Record<string, unknown>,
    ) as Prisma.JsonValue;
  }
  // Health from real secrets; client only receives redacted config (anti-XSS).
  const health = computeChannelHealth(row.channelType, channelConfig, row.enabled);
  return {
    id: row.id,
    accountId: "workspace",
    name: row.name,
    channelType: row.channelType,
    channelConfig: redactChannelConfigForClient(channelConfig),
    enabled: row.enabled,
    webhookUrl:
      row.channelType === "email"
        ? `${base}/webhooks/email/pubsub`
        : `${base}/webhooks/${row.channelType}`,
    health,
  };
}

export class InboxService {
  static async listByAccount(_accountId?: string) {
    const rows = await prisma.channelConfig.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(shapeChannelConfig);
  }

  static async getById(id: string) {
    const row = await prisma.channelConfig.findUnique({ where: { id } });
    return row ? shapeChannelConfig(row) : null;
  }

  static async update(
    id: string,
    data: {
      name?: string;
      channelConfig?: Record<string, unknown>;
      enabled?: boolean;
    },
  ) {
    const existing = await prisma.channelConfig.findUnique({ where: { id } });
    if (!existing) throw new Error("not found");

    let patch = data.channelConfig;
    if (patch && existing.channelType === "instagram") {
      const incoming = { ...patch };
      if (
        typeof incoming.appSecret === "string" &&
        incoming.appSecret.trim() &&
        !(typeof incoming.instagramAppSecret === "string" && incoming.instagramAppSecret.trim())
      ) {
        incoming.instagramAppSecret = incoming.appSecret;
      }
      patch = {
        ...normalizeInstagramChannelConfigStored(incoming),
        appSecret: null,
        pageId: null,
      };
    }

    const merged =
      patch !== undefined ? mergeChannelConfig(existing.channelConfig, patch) : undefined;

    const nextConfig =
      merged &&
      existing.channelType === "instagram" &&
      typeof merged === "object" &&
      !Array.isArray(merged)
        ? (normalizeInstagramChannelConfigStored(merged as Record<string, unknown>) as Prisma.InputJsonValue)
        : merged;

    const row = await prisma.channelConfig.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(nextConfig !== undefined ? { channelConfig: nextConfig } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });
    return shapeChannelConfig(row);
  }

  static async updateByChannelType(
    channelType: ChannelType,
    data: {
      name?: string;
      channelConfig?: Record<string, unknown>;
      enabled?: boolean;
    },
  ) {
    const existing = await prisma.channelConfig.findFirst({ where: { channelType } });
    if (!existing) throw new Error("not found");
    return this.update(existing.id, data);
  }

  /** Wipe credentials and disable — Settings "Disconnect". */
  static async disconnect(id: string) {
    const existing = await prisma.channelConfig.findUnique({ where: { id } });
    if (!existing) throw new Error("not found");
    const row = await prisma.channelConfig.update({
      where: { id },
      data: {
        channelConfig: {},
        enabled: false,
      },
    });
    return shapeChannelConfig(row);
  }
}
