import type { ChannelType, Prisma } from "../../generated/client/index.js";
import { prisma } from "../../config/db.js";
import { isFeatureEnabled } from "../FeatureService.js";
import type { ClassifyResult } from "../IntentClassifierService.js";
import { setChannelResolved } from "../ResolveService.js";
import { PREMADE_SKILLS } from "./catalog.js";
import { generateHumanizedReply } from "./llmReply.js";
import { gatherSkillTools, lookupCustomerContact, resolveCustomerId } from "./tools.js";
import type {
  PremadeSkill,
  SkillContext,
  SkillExecutionResult,
  ToolTraceEntry,
} from "./types.js";

const MASTER_FLAG = "agentic_replies_enabled";

export async function shouldRunAgenticReplies(): Promise<boolean> {
  return isFeatureEnabled(MASTER_FLAG, false);
}

function skillMatches(
  skill: PremadeSkill,
  input: { intent: string; group: string; confidence: number },
): boolean {
  if (input.confidence < skill.minConfidence) return false;
  const hasIntent = skill.intents.length > 0;
  const hasGroup = skill.intentGroups.length > 0;
  if (!hasIntent && !hasGroup) return false;
  const intentHit = !hasIntent || skill.intents.includes(input.intent);
  const groupHit = !hasGroup || skill.intentGroups.includes(input.group);
  if (hasIntent && hasGroup) return intentHit && groupHit;
  if (hasIntent) return intentHit;
  return groupHit;
}

async function recentlyAutoReplied(
  channelType: ChannelType,
  channelId: string,
  cooldownMs: number,
  skillKey: string,
): Promise<boolean> {
  if (cooldownMs <= 0) return false;
  const since = new Date(Date.now() - cooldownMs);
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
  const raw = row.rawPayload as { agentic?: boolean; agenticSkillKey?: string };
  if (!raw.agentic) return false;
  if (raw.agenticSkillKey && raw.agenticSkillKey !== skillKey) return false;
  return true;
}

async function writeAudit(input: {
  skillKey: string;
  ctx: SkillContext;
  result: SkillExecutionResult;
}): Promise<void> {
  try {
    await prisma.agentSkillRun.create({
      data: {
        skillKey: input.skillKey,
        channelType: input.ctx.channelType,
        channelId: input.ctx.channelId,
        customerId: input.ctx.customerId,
        intent: input.ctx.classify.intent,
        intentGroup: input.ctx.classify.group,
        confidence: input.ctx.classify.confidence,
        action: input.result.action,
        messageId: input.result.messageId ?? null,
        detail: input.result.detail ?? null,
        toolTrace: (input.result.toolTrace ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn(
      "[skills] audit write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function executeSkill(
  skill: PremadeSkill,
  ctx: SkillContext,
): Promise<SkillExecutionResult> {
  if (await recentlyAutoReplied(ctx.channelType, ctx.channelId, skill.cooldownMs, skill.key)) {
    return { action: "skipped", detail: "cooldown" };
  }

  if (skill.resolveOnly) {
    await setChannelResolved({
      channelType: ctx.channelType,
      channelId: ctx.channelId,
      resolved: true,
    });
    return {
      action: "resolved",
      detail: "noise resolved",
      toolTrace: [{ tool: "resolve_channel", ok: true }],
    };
  }

  if (!ctx.customerId) {
    return { action: "skipped", detail: "no customer" };
  }

  const toolData = await gatherSkillTools(skill.tools, ctx);
  const toolTrace: ToolTraceEntry[] = [...toolData.traces];

  if (skill.sendProductCards) {
    return sendProductSuggestionCards({ skill, ctx, toolData, toolTrace });
  }

  let replyBody =
    (await generateHumanizedReply({ skill, ctx, toolData })) ||
    skill.fallbackReply?.trim() ||
    null;
  if (!replyBody) {
    return {
      action: "skipped",
      detail: "llm unavailable or empty reply",
      toolTrace,
    };
  }

  const { sendCustomerChannelMessage } = await import("../MessagingService.js");
  const result = await sendCustomerChannelMessage({
    customerId: ctx.customerId,
    channelType: ctx.channelType,
    content: replyBody,
    agentic: true,
    agenticIntent: ctx.classify.intent,
    agenticSkillKey: skill.key,
  });

  if (!result.message) {
    return {
      action: "failed",
      detail: result.result?.error || "send failed",
      toolTrace,
    };
  }

  if (skill.resolveAfter) {
    await setChannelResolved({
      channelType: ctx.channelType,
      channelId: ctx.channelId,
      resolved: true,
    });
    toolTrace.push({ tool: "resolve_channel", ok: true, summary: "after reply" });
  }

  return {
    action: "sent",
    messageId: result.message.id,
    replyBody,
    detail: skill.resolveAfter ? "sent + resolved" : "sent",
    toolTrace,
  };
}

async function sendProductSuggestionCards(input: {
  skill: PremadeSkill;
  ctx: SkillContext;
  toolData: Awaited<ReturnType<typeof gatherSkillTools>>;
  toolTrace: ToolTraceEntry[];
}): Promise<SkillExecutionResult> {
  const { skill, ctx, toolData, toolTrace } = input;
  const productsRaw = (toolData.getProducts as { products?: Array<{
    title?: string;
    price?: string | null;
    imageUrl?: string | null;
  }> } | undefined)?.products ?? [];
  const products = productsRaw.slice(0, 3);

  const intro =
    (await generateHumanizedReply({ skill, ctx, toolData })) ||
    skill.fallbackReply ||
    "Here are a few options you might like:";

  const { sendCustomerChannelMessage } = await import("../MessagingService.js");
  const { channelSupportsAttachments } = await import("../channel-media/index.js");
  const {
    isMediaStorageEnabled,
    putObject,
    channelMediaKey,
  } = await import("../MediaService.js");
  const { fetchProductImageBuffer } = await import("../orders/shopify-read.js");

  let lastMessageId: string | undefined;
  const canMedia =
    channelSupportsAttachments(ctx.channelType) && isMediaStorageEnabled();

  // Intro text
  {
    const result = await sendCustomerChannelMessage({
      customerId: ctx.customerId!,
      channelType: ctx.channelType,
      content: intro,
      agentic: true,
      agenticIntent: ctx.classify.intent,
      agenticSkillKey: skill.key,
    });
    if (result.message) lastMessageId = result.message.id;
  }

  if (!products.length) {
    const result = await sendCustomerChannelMessage({
      customerId: ctx.customerId!,
      channelType: ctx.channelType,
      content:
        "I couldn't find matching products right now — a teammate can help you pick something.",
      agentic: true,
      agenticIntent: ctx.classify.intent,
      agenticSkillKey: skill.key,
    });
    if (result.message) lastMessageId = result.message.id;
  } else {
    for (const p of products) {
      const priceBit = p.price ? ` — ₹${p.price}` : "";
      const caption = `${p.title ?? "Product"}${priceBit}`.slice(0, 900);

      if (canMedia && p.imageUrl) {
        const img = await fetchProductImageBuffer(p.imageUrl);
        if (img) {
          const key = channelMediaKey(
            ctx.channelType,
            ctx.customerId!,
            img.filename,
          );
          try {
            await putObject({
              key,
              body: img.buffer,
              contentType: img.contentType,
            });
            const result = await sendCustomerChannelMessage({
              customerId: ctx.customerId!,
              channelType: ctx.channelType,
              content: caption,
              mediaKey: key,
              mediaMimeType: img.contentType,
              mediaFilename: img.filename,
              agentic: true,
              agenticIntent: ctx.classify.intent,
              agenticSkillKey: skill.key,
            });
            if (result.message) {
              lastMessageId = result.message.id;
              toolTrace.push({
                tool: "product_card",
                ok: true,
                summary: `${p.title} (image)`,
              });
              continue;
            }
          } catch (err) {
            toolTrace.push({
              tool: "product_card",
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Text fallback (no image / media unavailable)
      const result = await sendCustomerChannelMessage({
        customerId: ctx.customerId!,
        channelType: ctx.channelType,
        content: caption,
        agentic: true,
        agenticIntent: ctx.classify.intent,
        agenticSkillKey: skill.key,
      });
      if (result.message) {
        lastMessageId = result.message.id;
        toolTrace.push({
          tool: "product_card",
          ok: true,
          summary: `${p.title} (text)`,
        });
      }
    }
  }

  if (!lastMessageId) {
    return { action: "failed", detail: "no suggestion messages sent", toolTrace };
  }

  if (skill.resolveAfter) {
    await setChannelResolved({
      channelType: ctx.channelType,
      channelId: ctx.channelId,
      resolved: true,
    });
    toolTrace.push({ tool: "resolve_channel", ok: true, summary: "after cards" });
  }

  return {
    action: "sent",
    messageId: lastMessageId,
    replyBody: intro,
    detail: `sent ${products.length} product card(s)`,
    toolTrace,
  };
}

/**
 * Match the first enabled premade skill and run it.
 */
export async function runSkillOrchestrator(input: {
  channelType: ChannelType;
  channelId: string;
  content: string;
  classify: ClassifyResult;
}): Promise<void> {
  if (!(await shouldRunAgenticReplies())) return;

  let match: PremadeSkill | undefined;
  for (const skill of PREMADE_SKILLS) {
    if (!skillMatches(skill, input.classify)) continue;
    if (!(await isFeatureEnabled(skill.featureFlag, false))) continue;
    match = skill;
    break;
  }
  if (!match) return;

  const customerId = await resolveCustomerId(input.channelType, input.channelId);
  let email: string | null = null;
  let phone: string | null = null;
  let customerName: string | null = null;
  if (customerId) {
    const contact = await lookupCustomerContact(customerId);
    email = contact.email;
    phone = contact.phone;
    customerName = contact.name;
  }

  const ctx: SkillContext = {
    channelType: input.channelType,
    channelId: input.channelId,
    content: input.content,
    classify: input.classify,
    customerId,
    customerName,
    email,
    phone,
  };

  const result = await executeSkill(match, ctx);
  await writeAudit({ skillKey: match.key, ctx, result });

  console.info(
    `[skills] ${match.key} → ${result.action}` +
      (result.detail ? ` (${result.detail})` : "") +
      ` ${input.channelType}/${input.channelId}`,
  );
}

/** Catalog + enablement for admin / tenant UI (read-only definitions). */
export async function listSkillsWithStatus() {
  const skills = [];
  for (const s of PREMADE_SKILLS) {
    skills.push({
      key: s.key,
      name: s.name,
      description: s.description,
      featureFlag: s.featureFlag,
      intents: s.intents,
      intentGroups: s.intentGroups,
      tools: s.tools,
      resolveAfter: s.resolveAfter,
      resolveOnly: Boolean(s.resolveOnly),
      enabled: await isFeatureEnabled(s.featureFlag, false),
    });
  }
  return skills;
}
