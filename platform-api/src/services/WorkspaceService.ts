import { Prisma } from "../generated/client/index.js";
import { prisma } from "../config/db.js";

type ChannelType = "whatsapp" | "instagram" | "facebook" | "email";

function configObject(
  value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function hasChannelCreds(channel: ChannelType, config: Record<string, unknown>): boolean {
  const s = (key: string) => {
    const v = config[key];
    return typeof v === "string" && v.trim().length > 0 && v !== "***";
  };
  if (channel === "whatsapp") return s("phoneNumberId") && s("accessToken");
  if (channel === "instagram") return s("accessToken") && s("verifyToken");
  if (channel === "facebook") return s("pageId") && s("accessToken");
  return (s("refreshToken") || s("accessToken")) && s("clientId");
}

/**
 * Ensure empty channels_config rows + shopify_config exist.
 * Does NOT read .env — credentials come from Settings UI or `npm run seed:config`.
 */
export async function ensureWorkspace() {
  for (const channel of ["whatsapp", "instagram", "facebook", "email"] as ChannelType[]) {
    const name =
      channel === "whatsapp"
        ? "WhatsApp"
        : channel === "instagram"
          ? "Instagram"
          : channel === "facebook"
            ? "Facebook"
            : "Email";
    const preferredId = `channel_${channel}`;

    try {
      await prisma.channelConfig.upsert({
        where: { id: preferredId },
        update: { name },
        create: {
          id: preferredId,
          name,
          channelType: channel,
          enabled: false,
          channelConfig: {},
        },
      });
    } catch (err) {
      console.warn(`[workspace] Failed to upsert ${channel} config, ignoring...`);
    }
  }

  const shopify = await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } });
  if (!shopify) {
    await prisma.shopifyConfig.create({
      data: {
        id: "shopify_default",
        shop: "",
        clientId: "",
        clientSecret: "",
      },
    });
    console.log("[workspace] created empty shopify_config");
  }
}

/** Used by seed:config — merge into DB without reading process.env channel secrets. */
export async function upsertChannelConfigSeed(
  channel: ChannelType,
  config: Record<string, unknown>,
  enabled = true,
) {
  const name =
    channel === "whatsapp"
      ? "WhatsApp"
      : channel === "instagram"
        ? "Instagram"
        : channel === "facebook"
          ? "Facebook"
          : "Email";
  const preferredId = `channel_${channel}`;
  const existing =
    (await prisma.channelConfig.findUnique({ where: { id: preferredId } })) ??
    (await prisma.channelConfig.findFirst({ where: { channelType: channel } }));

  const prev = configObject(existing?.channelConfig);
  const next = { ...prev, ...config };
  // drop empty strings so seed can partial-update
  for (const [k, v] of Object.entries(next)) {
    if (typeof v === "string" && !v.trim()) delete next[k];
  }
  const ready = hasChannelCreds(channel, next);

  if (existing) {
    return prisma.channelConfig.update({
      where: { id: existing.id },
      data: {
        name,
        channelConfig: next as Prisma.InputJsonValue,
        enabled: enabled && ready,
      },
    });
  }

  return prisma.channelConfig.create({
    data: {
      id: preferredId,
      name,
      channelType: channel,
      channelConfig: next as Prisma.InputJsonValue,
      enabled: enabled && ready,
    },
  });
}

export async function upsertShopifyConfigSeed(input: {
  shop?: string;
  clientId?: string;
  clientSecret?: string;
}) {
  const existing = await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } });
  const shop = (input.shop ?? existing?.shop ?? "").trim().replace(/\.myshopify\.com$/i, "");
  const clientId = (input.clientId ?? existing?.clientId ?? "").trim();
  const clientSecret = (input.clientSecret ?? existing?.clientSecret ?? "").trim();

  if (existing) {
    return prisma.shopifyConfig.update({
      where: { id: "shopify_default" },
      data: { shop, clientId, clientSecret },
    });
  }
  return prisma.shopifyConfig.create({
    data: {
      id: "shopify_default",
      shop,
      clientId,
      clientSecret,
    },
  });
}
