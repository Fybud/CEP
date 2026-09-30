/** READ-ONLY skill tools — never mutate Shopify. See README.md + .cursor/rules/agentic-skills-readonly.mdc */
import type { ChannelType } from "../../generated/client/index.js";
import { prisma } from "../../config/db.js";
import { orderService } from "../orders/order.service.js";
import { searchProductsReadOnly } from "../orders/shopify-read.js";
import type { CustomerOrder } from "../orders/types.js";
import type { SkillContext, SkillToolId, ToolTraceEntry } from "./types.js";

export async function resolveCustomerId(
  channelType: ChannelType,
  channelId: string,
): Promise<string | null> {
  switch (channelType) {
    case "whatsapp":
      return (
        (
          await prisma.whatsAppChannel.findUnique({
            where: { id: channelId },
            select: { customerId: true },
          })
        )?.customerId ?? null
      );
    case "instagram":
      return (
        (
          await prisma.instagramChannel.findUnique({
            where: { id: channelId },
            select: { customerId: true },
          })
        )?.customerId ?? null
      );
    case "facebook":
      return (
        (
          await prisma.facebookChannel.findUnique({
            where: { id: channelId },
            select: { customerId: true },
          })
        )?.customerId ?? null
      );
    case "email":
      return (
        (
          await prisma.emailChannel.findUnique({
            where: { id: channelId },
            select: { customerId: true },
          })
        )?.customerId ?? null
      );
    case "web_chat":
      return (
        (
          await prisma.webChatChannel.findUnique({
            where: { id: channelId },
            select: { customerId: true },
          })
        )?.customerId ?? null
      );
    default:
      return null;
  }
}

export async function lookupCustomerContact(customerId: string): Promise<{
  email: string | null;
  phone: string | null;
  name: string | null;
}> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      name: true,
      emailIdentities: { select: { externalId: true }, take: 3 },
      whatsappIdentities: { select: { externalId: true }, take: 3 },
    },
  });
  if (!customer) return { email: null, phone: null, name: null };
  return {
    name: customer.name?.trim() || null,
    email: customer.emailIdentities[0]?.externalId?.trim() || null,
    phone: customer.whatsappIdentities[0]?.externalId ?? null,
  };
}

function sortOrdersNewest(orders: CustomerOrder[]): CustomerOrder[] {
  return [...orders].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export type GatheredToolData = {
  getCustomer?: unknown;
  getRecentOrder?: unknown;
  getOrders?: unknown;
  getInvoice?: unknown;
  getTracking?: unknown;
  getProducts?: unknown;
  traces: ToolTraceEntry[];
};

/**
 * Prefetch skill tools once, then pass JSON to the LLM.
 * READ-ONLY: never mutate Shopify/commerce state from here.
 */
export async function gatherSkillTools(
  tools: SkillToolId[],
  ctx: SkillContext,
): Promise<GatheredToolData> {
  const out: GatheredToolData = { traces: [] };
  if (!tools.length) return out;

  let commerce: Awaited<ReturnType<typeof orderService.getCustomerCommerce>> | null =
    null;

  const needCommerce = tools.some((t) =>
    ["getCustomer", "getRecentOrder", "getOrders", "getInvoice", "getTracking"].includes(t),
  );

  if (needCommerce) {
    try {
      commerce = await orderService.getCustomerCommerce({
        email: ctx.email,
        phone: ctx.phone,
        customerId: ctx.customerId,
      });
      out.traces.push({
        tool: "commerce_lookup",
        ok: true,
        summary: `${commerce.orders.length} order(s) via ${commerce.provider}`,
      });
    } catch (err) {
      out.traces.push({
        tool: "commerce_lookup",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const orders = sortOrdersNewest(commerce?.orders ?? []);

  for (const tool of tools) {
    if (tool === "getCustomer") {
      out.getCustomer = {
        cepName: ctx.customerName,
        email: ctx.email,
        phone: ctx.phone,
        shopify: commerce?.customer ?? null,
        stats: commerce?.stats ?? null,
      };
      out.traces.push({ tool, ok: true, summary: commerce?.customer ? "found" : "none" });
    } else if (tool === "getOrders") {
      out.getOrders = orders.slice(0, 5).map((o) => ({
        orderId: o.orderId,
        status: o.status,
        date: o.date,
        amount: o.amount,
        currency: o.currency,
        items: o.items.slice(0, 5),
        tracking: o.tracking ?? [],
      }));
      out.traces.push({ tool, ok: true, summary: `${orders.length} order(s)` });
    } else if (tool === "getRecentOrder") {
      const recent = orders[0] ?? null;
      out.getRecentOrder = recent
        ? {
            orderId: recent.orderId,
            status: recent.status,
            date: recent.date,
            amount: recent.amount,
            currency: recent.currency,
            items: recent.items.slice(0, 5),
            tracking: recent.tracking ?? [],
          }
        : null;
      out.traces.push({
        tool,
        ok: true,
        summary: recent ? `#${recent.orderId}` : "none",
      });
    } else if (tool === "getInvoice") {
      out.getInvoice = {
        available: false,
        reason: "Invoice PDF download is not configured for this workspace yet.",
        orderId: orders[0]?.orderId ?? null,
      };
      out.traces.push({ tool, ok: true, summary: "unavailable" });
    } else if (tool === "getTracking") {
      out.getTracking = {
        source: "shopify_fulfillments_read",
        shipments: orders.slice(0, 3).map((o) => ({
          orderId: o.orderId,
          status: o.status,
          date: o.date,
          tracking: o.tracking ?? [],
        })),
      };
      const withTrack = orders.filter((o) => (o.tracking?.length ?? 0) > 0).length;
      out.traces.push({
        tool,
        ok: true,
        summary: `${withTrack}/${Math.min(orders.length, 3)} with tracking`,
      });
    } else if (tool === "getProducts") {
      const { products, query } = await searchProductsReadOnly(ctx.content);
      out.getProducts = { query, products };
      out.traces.push({
        tool,
        ok: true,
        summary: `${products.length} product(s) for "${query}"`,
      });
    }
  }

  return out;
}
