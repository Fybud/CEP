import type { ChannelType } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import { isFeatureEnabled } from "./FeatureService.js";
import type { ClassifyResult } from "./IntentClassifierService.js";
import { orderService } from "./orders/order.service.js";
import type { CustomerOrder } from "./orders/types.js";
import { setChannelResolved } from "./ResolveService.js";

const FEATURE_KEY = "agentic_replies_enabled";
/** Minimum classifier confidence before we take an automatic action. */
const MIN_CONFIDENCE = 0.55;
/** Skip if we already auto-replied on this identity in this window. */
const COOLDOWN_MS = 3 * 60 * 1000;

export async function shouldRunAgenticReplies(): Promise<boolean> {
  return isFeatureEnabled(FEATURE_KEY, false);
}

function formatOrderReply(orders: CustomerOrder[]): string {
  const latest = [...orders].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 2);
  const lines: string[] = [
    latest.length === 1
      ? "Here is your latest order status:"
      : "Here are your recent order statuses:",
  ];
  for (const o of latest) {
    const items = o.items
      .slice(0, 3)
      .map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
      .join(", ");
    lines.push("");
    lines.push(`Order #${o.orderId}`);
    lines.push(`Status: ${o.status}`);
    lines.push(`Date: ${o.date}`);
    if (items) lines.push(`Items: ${items}`);
  }
  lines.push("");
  lines.push("Reply here if you need help with a different order.");
  return lines.join("\n");
}

async function lookupCustomerContact(customerId: string): Promise<{
  email: string | null;
  phone: string | null;
}> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      emailIdentities: { select: { externalId: true }, take: 3 },
      whatsappIdentities: { select: { externalId: true }, take: 3 },
    },
  });
  if (!customer) return { email: null, phone: null };
  const email = customer.emailIdentities[0]?.externalId?.trim() || null;
  const phone = customer.whatsappIdentities[0]?.externalId ?? null;
  return { email, phone };
}

async function recentlyAutoReplied(
  channelType: ChannelType,
  channelId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_MS);
  const row = await prisma.message.findFirst({
    where: {
      channelType,
      channelId,
      direction: "outgoing",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { rawPayload: true },
  });
  if (!row?.rawPayload || typeof row.rawPayload !== "object") return false;
  return Boolean((row.rawPayload as { agentic?: boolean }).agentic);
}

async function resolveCustomerId(
  channelType: ChannelType,
  channelId: string,
): Promise<string | null> {
  switch (channelType) {
    case "whatsapp":
      return (
        (await prisma.whatsAppChannel.findUnique({ where: { id: channelId }, select: { customerId: true } }))
          ?.customerId ?? null
      );
    case "instagram":
      return (
        (await prisma.instagramChannel.findUnique({ where: { id: channelId }, select: { customerId: true } }))
          ?.customerId ?? null
      );
    case "facebook":
      return (
        (await prisma.facebookChannel.findUnique({ where: { id: channelId }, select: { customerId: true } }))
          ?.customerId ?? null
      );
    case "email":
      return (
        (await prisma.emailChannel.findUnique({ where: { id: channelId }, select: { customerId: true } }))
          ?.customerId ?? null
      );
    case "web_chat":
      return (
        (await prisma.webChatChannel.findUnique({ where: { id: channelId }, select: { customerId: true } }))
          ?.customerId ?? null
      );
    default:
      return null;
  }
}

/**
 * After intent is stored: auto order/status reply (Shopify) or resolve noise.
 * Everything else → human only.
 */
export async function runAgenticReplyForInbound(input: {
  channelType: ChannelType;
  channelId: string;
  content: string;
  classify: ClassifyResult;
}): Promise<void> {
  if (!(await shouldRunAgenticReplies())) return;
  if (input.classify.confidence < MIN_CONFIDENCE) return;

  const intent = input.classify.intent;
  const group = input.classify.group;

  if (group === "noise") {
    await setChannelResolved({
      channelType: input.channelType,
      channelId: input.channelId,
      resolved: true,
    });
    console.info(`[agentic] noise → resolved ${input.channelType}/${input.channelId}`);
    return;
  }

  // Auto-send only for order/status
  if (intent !== "order/status") return;

  const customerId = await resolveCustomerId(input.channelType, input.channelId);
  if (!customerId) return;

  if (await recentlyAutoReplied(input.channelType, input.channelId)) {
    console.info("[agentic] order skip — cooldown");
    return;
  }

  const { email, phone } = await lookupCustomerContact(customerId);
  if (!email && !phone) {
    console.info("[agentic] order skip — no email/phone on contact");
    return;
  }

  const commerce = await orderService.getCustomerCommerce({
    email,
    phone,
    customerId,
  });
  if (!commerce.orders.length) {
    console.info("[agentic] order skip — no Shopify orders");
    return;
  }

  const body = formatOrderReply(commerce.orders);
  const { sendCustomerChannelMessage } = await import("./MessagingService.js");
  const result = await sendCustomerChannelMessage({
    customerId,
    channelType: input.channelType,
    content: body,
    agentic: true,
    agenticIntent: "order/status",
  });

  if (!result.message) {
    console.warn("[agentic] order auto-reply failed:", result.result?.error);
    return;
  }
  console.info(
    `[agentic] order auto-reply sent ${input.channelType}/${input.channelId} msg=${result.message.id}`,
  );
}
