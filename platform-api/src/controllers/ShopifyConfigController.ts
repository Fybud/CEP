import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { SECRET_PLACEHOLDER } from "../services/SecretRedaction.js";
import { clearShopifyTokenCache } from "../services/orders/shopify.client.js";

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function shape(row: {
  id: string;
  shop: string;
  clientId: string;
  clientSecret: string;
  metadata?: unknown;
  updatedAt: Date;
}) {
  const meta = asMeta(row.metadata);
  const hasToken = typeof meta.accessToken === "string" && meta.accessToken.trim().length > 0;
  const connected = Boolean(
    row.shop?.trim() &&
      row.clientId?.trim() &&
      row.clientSecret?.trim() &&
      (hasToken || meta.authMode === "client_credentials"),
  );
  return {
    id: row.id,
    connected,
    shop: "",
    clientId: "",
    clientSecret: connected ? SECRET_PLACEHOLDER : "",
    hasClientSecret: connected,
    updatedAt: row.updatedAt,
  };
}

export class ShopifyConfigController {
  static async get(_request: FastifyRequest, reply: FastifyReply) {
    const row =
      (await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } })) ??
      (await prisma.shopifyConfig.create({
        data: { id: "shopify_default" },
      }));
    return reply.send(shape(row));
  }

  static async update(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      shop?: string;
      clientId?: string;
      clientSecret?: string;
      disconnect?: boolean;
    };

    await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } }) ??
      (await prisma.shopifyConfig.create({ data: { id: "shopify_default" } }));

    if (body.disconnect) {
      clearShopifyTokenCache();
      const row = await prisma.shopifyConfig.update({
        where: { id: "shopify_default" },
        data: { shop: "", clientId: "", clientSecret: "", metadata: {} },
      });
      return reply.send(shape(row));
    }

    const nextSecret =
      typeof body.clientSecret === "string" ? body.clientSecret.trim() : undefined;
    const keepSecret =
      nextSecret === undefined ||
      nextSecret === "" ||
      nextSecret === SECRET_PLACEHOLDER;

    const row = await prisma.shopifyConfig.update({
      where: { id: "shopify_default" },
      data: {
        ...(body.shop !== undefined
          ? { shop: body.shop.trim().replace(/\.myshopify\.com$/i, "") }
          : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId.trim() } : {}),
        ...(!keepSecret ? { clientSecret: nextSecret } : {}),
      },
    });

    return reply.send(shape(row));
  }
}
