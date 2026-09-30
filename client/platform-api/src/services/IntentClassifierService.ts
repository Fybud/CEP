import type { ChannelType } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { isFeatureEnabled } from "./FeatureService.js";

/** Leaf labels from the hierarchical classifier (group/sub). */
export const INTENT_LEAVES = [
  "pre_purchase/product",
  "pre_purchase/price",
  "pre_purchase/shipping",
  "pre_purchase/other",
  "order/status",
  "order/change",
  "order/payment",
  "order/other",
  "post_purchase/delivery",
  "post_purchase/return",
  "post_purchase/feedback",
  "post_purchase/other",
  "noise/thanks",
  "noise/greeting",
  "noise/human",
  "noise/spam",
] as const;

export const INTENT_GROUPS = [
  "pre_purchase",
  "order",
  "post_purchase",
  "noise",
] as const;

export type IntentLeaf = (typeof INTENT_LEAVES)[number];
export type IntentGroup = (typeof INTENT_GROUPS)[number];

export type ClassifyResult = {
  /** Full leaf e.g. order/status */
  intent: IntentLeaf;
  group: IntentGroup;
  sub: string;
  confidence: number;
};

const FEATURE_KEY = "intent_classifier_enabled";

function isIntentLeaf(value: string): value is IntentLeaf {
  return (INTENT_LEAVES as readonly string[]).includes(value);
}

function isIntentGroup(value: string): value is IntentGroup {
  return (INTENT_GROUPS as readonly string[]).includes(value);
}

/** Map legacy flat labels (pre v2) → group. */
export function normalizeIntentGroup(
  intent: string | null | undefined,
  intentGroup?: string | null,
): IntentGroup | null {
  if (intentGroup && isIntentGroup(intentGroup)) return intentGroup;
  if (!intent) return null;
  if (intent.includes("/")) {
    const g = intent.split("/")[0]!;
    return isIntentGroup(g) ? g : null;
  }
  // legacy
  if (intent === "order_status") return "order";
  if (intent === "post_purchase_issue") return "post_purchase";
  if (intent === "non_customer_noise") return "noise";
  if (intent === "pre_purchase") return "pre_purchase";
  return isIntentGroup(intent) ? intent : null;
}

/** Only call the ML service when the admin flag is on and URL is configured. */
export async function shouldClassifyIntent(): Promise<boolean> {
  if (!env.intentClassifierUrl) return false;
  return isFeatureEnabled(FEATURE_KEY, false);
}

export async function classifyMessageText(
  text: string,
  channel?: ChannelType | string,
): Promise<ClassifyResult | null> {
  const cleaned = (text || "").trim();
  if (!cleaned) return null;
  if (!(await shouldClassifyIntent())) return null;

  const base = env.intentClassifierUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const res = await fetch(`${base}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleaned, channel: channel ?? null }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[intent] classifier HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      intent?: string;
      group?: string;
      sub?: string;
      confidence?: number;
    };
    if (!data.intent || !isIntentLeaf(data.intent)) return null;
    const group =
      (data.group && isIntentGroup(data.group) ? data.group : null) ??
      normalizeIntentGroup(data.intent);
    if (!group) return null;
    const sub = data.sub || data.intent.split("/")[1] || "other";
    return {
      intent: data.intent,
      group,
      sub,
      confidence: typeof data.confidence === "number" ? data.confidence : 0,
    };
  } catch (err) {
    console.warn(
      "[intent] classifier call failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function updateIdentityIntent(
  channelType: ChannelType,
  channelId: string,
  result: ClassifyResult,
) {
  const data = {
    intent: result.intent,
    intentGroup: result.group,
    intentConfidence: result.confidence,
    intentUpdatedAt: new Date(),
  };
  switch (channelType) {
    case "whatsapp":
      await prisma.whatsAppChannel.update({ where: { id: channelId }, data });
      break;
    case "instagram":
      await prisma.instagramChannel.update({ where: { id: channelId }, data });
      break;
    case "facebook":
      await prisma.facebookChannel.update({ where: { id: channelId }, data });
      break;
    case "email":
      await prisma.emailChannel.update({ where: { id: channelId }, data });
      break;
    case "web_chat":
      await prisma.webChatChannel.update({ where: { id: channelId }, data });
      break;
    default:
      break;
  }
}

/**
 * Fire-and-forget classify for a new inbound customer message.
 * No-ops when admin flag is off or classifier URL is missing.
 */
export function classifyInboundMessageAsync(input: {
  channelType: ChannelType;
  channelId: string;
  content: string;
}): void {
  void (async () => {
    const result = await classifyMessageText(input.content, input.channelType);
    if (!result) return;
    await updateIdentityIntent(input.channelType, input.channelId, result);

    const { runAgenticReplyForInbound } = await import("./AgenticReplyService.js");
    await runAgenticReplyForInbound({
      channelType: input.channelType,
      channelId: input.channelId,
      content: input.content,
      classify: result,
    });
  })().catch((err) => {
    console.warn(
      "[intent] store/agentic failed:",
      err instanceof Error ? err.message : err,
    );
  });
}

const CHANNEL_TYPES: ChannelType[] = [
  "whatsapp",
  "instagram",
  "facebook",
  "email",
  "web_chat",
];

let backfillRunning = false;

/**
 * Classify latest inbound for identities that still have no intent.
 */
export function backfillMissingIntentsAsync(limit = 40): void {
  if (backfillRunning) return;
  backfillRunning = true;
  void (async () => {
    try {
      if (!(await shouldClassifyIntent())) return;

      const identities: Array<{
        channelType: ChannelType;
        channelId: string;
      }> = [];

      for (const channelType of CHANNEL_TYPES) {
        switch (channelType) {
          case "whatsapp": {
            const rows = await prisma.whatsAppChannel.findMany({
              where: { intent: null },
              select: { id: true },
              take: limit,
            });
            for (const r of rows) identities.push({ channelType, channelId: r.id });
            break;
          }
          case "instagram": {
            const rows = await prisma.instagramChannel.findMany({
              where: { intent: null },
              select: { id: true },
              take: limit,
            });
            for (const r of rows) identities.push({ channelType, channelId: r.id });
            break;
          }
          case "facebook": {
            const rows = await prisma.facebookChannel.findMany({
              where: { intent: null },
              select: { id: true },
              take: limit,
            });
            for (const r of rows) identities.push({ channelType, channelId: r.id });
            break;
          }
          case "email": {
            const rows = await prisma.emailChannel.findMany({
              where: { intent: null },
              select: { id: true },
              take: limit,
            });
            for (const r of rows) identities.push({ channelType, channelId: r.id });
            break;
          }
          case "web_chat": {
            const rows = await prisma.webChatChannel.findMany({
              where: { intent: null },
              select: { id: true },
              take: limit,
            });
            for (const r of rows) identities.push({ channelType, channelId: r.id });
            break;
          }
          default:
            break;
        }
      }

      for (const item of identities.slice(0, limit)) {
        const lastInbound = await prisma.message.findFirst({
          where: {
            channelType: item.channelType,
            channelId: item.channelId,
            direction: "incoming",
          },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        });
        const text = lastInbound?.content?.trim();
        if (!text) continue;
        const result = await classifyMessageText(text, item.channelType);
        if (!result) continue;
        await updateIdentityIntent(item.channelType, item.channelId, result);
      }
    } catch (err) {
      console.warn(
        "[intent] backfill failed:",
        err instanceof Error ? err.message : err,
      );
    } finally {
      backfillRunning = false;
    }
  })();
}
