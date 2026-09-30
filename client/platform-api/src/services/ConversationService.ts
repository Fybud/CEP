import type { ChannelType, Prisma } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import {
  sendCustomerChannelMessage,
  shapeCustomer,
} from "./MessagingService.js";
import {
  recomputeCustomerResolved,
  resolveAllIdentitiesForCustomerChannel,
} from "./ResolveService.js";
import {
  getMessagingWindow,
  serializeConversationWindow,
} from "./ConversationWindowService.js";
import { isFeatureEnabled } from "./FeatureService.js";
import {
  suppressConversation,
  suppressMessages as suppressSelectedMessages,
} from "./SuppressService.js";
import {
  buildConversationId,
  displayEmailSubject,
  parseConversationId,
} from "../utils/conversationId.js";
import {
  getChannelMediaHandler,
  listGmailAttachmentParts,
  normalizeMediaItems,
} from "./channel-media/index.js";
import { resolveChannelConfig } from "../adapters/shared/index.js";
import type { ChannelConfig } from "../adapters/shared/types.js";

function previewMessage(content: string) {
  return content.length > 120 ? `${content.slice(0, 117)}…` : content;
}

type MessageMediaFields = {
  id: string;
  direction: string;
  content: string;
  contentType: string;
  subject: string | null;
  status: string;
  createdAt: Date;
  externalThreadId?: string | null;
  isRead?: boolean;
  mediaKey?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
  mediaItems?: unknown;
  rawPayload?: unknown;
};

function shapeMessage(conversationId: string, m: MessageMediaFields) {
  const mediaItems = normalizeMediaItems(m.mediaItems, {
    mediaKey: m.mediaKey,
    mediaMimeType: m.mediaMimeType,
    mediaFilename: m.mediaFilename,
    contentType: m.contentType,
  });
  const raw = typeof m.rawPayload === "object" && m.rawPayload ? (m.rawPayload as any) : {};
  return {
    id: m.id,
    conversationId,
    direction: m.direction,
    content: previewMessage(m.content),
    contentType: m.contentType,
    subject: m.subject,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    externalThreadId: m.externalThreadId ?? null,
    isRead: m.isRead ?? m.direction === "outgoing",
    hasMedia: mediaItems.length > 0,
    mediaFilename: mediaItems[0]?.filename ?? m.mediaFilename ?? null,
    mediaMimeType: mediaItems[0]?.mimeType ?? m.mediaMimeType ?? null,
    mediaItems,
    errorMessage: raw.errorMessage ?? null,
    agentic: Boolean(raw.agentic),
    agenticIntent: typeof raw.agenticIntent === "string" ? raw.agenticIntent : null,
  };
}

function fullShapeMessage(conversationId: string, m: MessageMediaFields) {
  const mediaItems = normalizeMediaItems(m.mediaItems, {
    mediaKey: m.mediaKey,
    mediaMimeType: m.mediaMimeType,
    mediaFilename: m.mediaFilename,
    contentType: m.contentType,
  });
  const raw = typeof m.rawPayload === "object" && m.rawPayload ? (m.rawPayload as any) : {};
  return {
    id: m.id,
    conversationId,
    direction: m.direction,
    content: m.content,
    contentType: m.contentType,
    subject: m.subject,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    externalThreadId: m.externalThreadId ?? null,
    isRead: m.isRead ?? m.direction === "outgoing",
    hasMedia: mediaItems.length > 0,
    mediaFilename: mediaItems[0]?.filename ?? m.mediaFilename ?? null,
    mediaMimeType: mediaItems[0]?.mimeType ?? m.mediaMimeType ?? null,
    mediaItems,
    errorMessage: raw.errorMessage ?? null,
    agentic: Boolean(raw.agentic),
    agenticIntent: typeof raw.agenticIntent === "string" ? raw.agenticIntent : null,
  };
}

/** Backfill missing email attachments from Gmail rawPayload (older single-file ingest). */
async function rehydrateEmailMediaIfNeeded(
  messages: Array<{
    id: string;
    channelType: ChannelType;
    customerId: string;
    mediaKey: string | null;
    mediaMimeType: string | null;
    mediaFilename: string | null;
    mediaItems: unknown;
    rawPayload: unknown;
    contentType: string;
  }>,
) {
  const needs = messages.filter((m) => {
    if (m.channelType !== "email" || !m.rawPayload) return false;
    const parts = listGmailAttachmentParts(m.rawPayload);
    if (parts.length <= 1) return false;
    const stored = normalizeMediaItems(m.mediaItems, {
      mediaKey: m.mediaKey,
      mediaMimeType: m.mediaMimeType,
      mediaFilename: m.mediaFilename,
    });
    return stored.length < parts.length;
  });
  if (!needs.length) return;

  const channelCfg = await prisma.channelConfig.findFirst({
    where: { channelType: "email" },
    orderBy: { createdAt: "asc" },
  });
  if (!channelCfg) return;
  const config = resolveChannelConfig("email", channelCfg.channelConfig) as ChannelConfig;
  const handler = getChannelMediaHandler("email");
  if (!handler?.parseAllInboundRaw) return;

  for (const m of needs) {
    try {
      const parsedList = handler.parseAllInboundRaw(m.rawPayload);
      const storedItems = [];
      for (const parsed of parsedList) {
        const stored = await handler.persistInbound({
          config,
          customerId: m.customerId,
          parsed,
        });
        if (stored) {
          storedItems.push({
            ...stored,
            contentType: parsed.contentType,
          });
        }
      }
      if (!storedItems.length) continue;
      await prisma.message.update({
        where: { id: m.id },
        data: {
          mediaKey: storedItems[0]!.mediaKey,
          mediaMimeType: storedItems[0]!.mimeType,
          mediaFilename: storedItems[0]!.filename,
          mediaItems: storedItems as unknown as Prisma.InputJsonValue,
        },
      });
      m.mediaKey = storedItems[0]!.mediaKey;
      m.mediaMimeType = storedItems[0]!.mimeType;
      m.mediaFilename = storedItems[0]!.filename ?? null;
      m.mediaItems = storedItems;
    } catch (err) {
      console.warn(
        "[email-media] rehydrate failed:",
        m.id,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

async function loadUnreadMap() {
  const rows = await prisma.message.groupBy({
    by: ["customerId", "channelType"],
    where: { direction: "incoming", isRead: false },
    _count: { id: true },
  });
  const map = new Map<string, Partial<Record<ChannelType, number>>>();
  for (const row of rows) {
    const prev = map.get(row.customerId) ?? {};
    prev[row.channelType] = row._count.id;
    map.set(row.customerId, prev);
  }
  return map;
}

function contactHasUnread(
  customerId: string,
  unreadMap: Map<string, Partial<Record<ChannelType, number>>>,
  channelFilter?: ChannelType,
): boolean {
  const counts = unreadMap.get(customerId);
  if (!counts) return false;
  if (channelFilter) return (counts[channelFilter] ?? 0) > 0;
  return Object.values(counts).some((n) => (n ?? 0) > 0);
}

/**
 * Synthesize conversation-like rows for the Inbox UI.
 * WhatsApp / Instagram: one row per (customer, channel).
 * Email: one row per Gmail thread under the customer.
 */
export class ConversationService {
  static async searchMessages(query: string) {
    const messages = await prisma.message.findMany({
      where: { content: { contains: query, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    
    // We need to return customer info and a computed conversationId for the UI
    const customerIds = [...new Set(messages.map(m => m.customerId))];
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } }
    });
    
    return messages.map(msg => {
      const customer = customers.find(c => c.id === msg.customerId);
      return {
        ...msg,
        customerName: customer?.name || "Unknown",
        conversationId: buildConversationId(msg.customerId, msg.channelType, msg.externalThreadId ?? undefined)
      };
    });
  }
  static parseConversationId = parseConversationId;

  static async list(status?: "active" | "resolved" | "all") {
    const enabledConfigs = await prisma.channelConfig.findMany({
      where: { enabled: true },
    });
    const enabledTypes = new Set(enabledConfigs.map((c) => c.channelType));
    const instagramHumanAgentEnabled = await isFeatureEnabled(
      "instagram_human_agent_enabled",
      false,
    );
    const windowOptions = { instagramHumanAgentEnabled };

    const customers = await prisma.customer.findMany({
      include: {
        whatsappIdentities: true,
        instagramIdentities: true,
        facebookIdentities: true,
        emailIdentities: true,
        webChatIdentities: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const unreadMap = await loadUnreadMap();

    const blockedRows = await prisma.blockedContact.findMany({
      select: { customerId: true },
    });
    const blockedCustomerIds = new Set(blockedRows.map((r) => r.customerId));

    // ── Batch fetch latest non-email messages (prevents N+1 per customer) ──────
    const nonEmailGroups = await prisma.message.groupBy({
      by: ["customerId", "channelType"],
      where: { channelType: { in: ["whatsapp", "instagram", "facebook", "web_chat"] } },
      _max: { createdAt: true },
    });
    const latestNonEmailMsgs = nonEmailGroups.length > 0
      ? await prisma.message.findMany({
          where: {
            OR: nonEmailGroups
              .filter((g) => g._max.createdAt !== null)
              .map((g) => ({
                customerId: g.customerId,
                channelType: g.channelType as ChannelType,
                createdAt: g._max.createdAt!,
              })),
          },
        })
      : [];
    const lastNonEmailMsgMap = new Map<string, (typeof latestNonEmailMsgs)[0]>();
    for (const msg of latestNonEmailMsgs) {
      // Keep only the most recent if two messages share the same createdAt
      const key = `${msg.customerId}:${msg.channelType}`;
      const existing = lastNonEmailMsgMap.get(key);
      if (!existing || msg.createdAt > existing.createdAt) {
        lastNonEmailMsgMap.set(key, msg);
      }
    }

    // ── Batch fetch all email messages (prevents N+1 per customer) ──────────
    const allEmailMessages = await prisma.message.findMany({
      where: { channelType: "email" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        customerId: true,
        direction: true,
        content: true,
        contentType: true,
        subject: true,
        status: true,
        createdAt: true,
        externalThreadId: true,
        rawPayload: true,
        mediaKey: true,
        mediaMimeType: true,
        mediaFilename: true,
        mediaItems: true,
        isRead: true,
      },
    });
    const emailMsgsByCustomer = new Map<string, (typeof allEmailMessages)>();
    for (const msg of allEmailMessages) {
      const list = emailMsgsByCustomer.get(msg.customerId) ?? [];
      list.push(msg);
      emailMsgsByCustomer.set(msg.customerId, list);
    }

    const rows = [];
    for (const customer of customers) {
      const shaped = shapeCustomer(customer);
      const channelStatuses: Partial<Record<ChannelType, "open" | "resolved">> = {};

      for (const type of ["whatsapp", "instagram", "facebook", "email", "web_chat"] as ChannelType[]) {
        if (!enabledTypes.has(type)) continue;
        const identities =
          type === "whatsapp"
            ? customer.whatsappIdentities
            : type === "instagram"
              ? customer.instagramIdentities
              : type === "facebook"
                ? customer.facebookIdentities
                : type === "web_chat"
                  ? customer.webChatIdentities
                  : customer.emailIdentities;
        const active = identities.filter((i) => i.lastMessageAt != null);
        if (!active.length) continue;
        const unresolved = active.some((i) => !i.resolved);
        channelStatuses[type] = unresolved ? "open" : "resolved";
      }

      for (const type of ["whatsapp", "instagram", "facebook", "email", "web_chat"] as ChannelType[]) {
        if (!enabledTypes.has(type)) continue;
        const identities =
          type === "whatsapp"
            ? customer.whatsappIdentities
            : type === "instagram"
              ? customer.instagramIdentities
              : type === "facebook"
                ? customer.facebookIdentities
                : type === "web_chat"
                  ? customer.webChatIdentities
                  : customer.emailIdentities;
        const active = identities.filter((i) => i.lastMessageAt != null);
        if (!active.length) continue;

        const unresolved = active.some((i) => !i.resolved);
        if (status === "active" && !unresolved) continue;
        if (status === "resolved" && unresolved) continue;

        const contactBase = {
          ...shaped,
          channelStatuses,
          globalStatus: Object.values(channelStatuses).some((s) => s === "open")
            ? ("active" as const)
            : ("resolved" as const),
          hasUnread: contactHasUnread(customer.id, unreadMap),
          unreadByChannel: unreadMap.get(customer.id) ?? {},
          blocked: blockedCustomerIds.has(customer.id),
        };

        const inboxMeta = {
          id: `channel_${type}`,
          name:
            type === "whatsapp"
              ? "WhatsApp"
              : type === "instagram"
                ? "Instagram"
                : type === "facebook"
                  ? "Facebook"
                  : type === "web_chat"
                    ? "Web Chat"
                    : "Email",
          channelType: type,
        };

        if (type !== "email") {
          const latest = [...active].sort((a, b) => {
            const at = a.lastMessageAt?.getTime() ?? 0;
            const bt = b.lastMessageAt?.getTime() ?? 0;
            return bt - at;
          })[0]!;

          const lastMsg = lastNonEmailMsgMap.get(`${customer.id}:${type}`) ?? null;

          const windowState = serializeConversationWindow(
            getMessagingWindow(type, latest.lastCustomerMessageAt ?? null, windowOptions),
          );

          const conversationId = buildConversationId(customer.id, type);
          rows.push({
            id: conversationId,
            contactId: customer.id,
            accountId: "workspace",
            status: unresolved ? ("open" as const) : ("resolved" as const),
            lastMessageAt: lastMsg?.createdAt ?? latest.lastMessageAt ?? null,
            channelType: type,
            externalThreadId: null as string | null,
            threadSubject: null as string | null,
            hasUnread: (unreadMap.get(customer.id)?.[type] ?? 0) > 0,
            intent: (latest as { intent?: string | null }).intent ?? null,
            intentGroup:
              (latest as { intentGroup?: string | null }).intentGroup ?? null,
            intentConfidence:
              (latest as { intentConfidence?: number | null }).intentConfidence ?? null,
            intentUpdatedAt:
              (latest as { intentUpdatedAt?: Date | null }).intentUpdatedAt?.toISOString() ??
              null,
            inbox: inboxMeta,
            contact: contactBase,
            windowState,
            messages: lastMsg ? [shapeMessage(conversationId, lastMsg)] : [],
          });
          continue;
        }

        // One inbox row per Gmail thread
        const emailMessages = emailMsgsByCustomer.get(customer.id) ?? [];

        const byThread = new Map<string, typeof emailMessages>();
        for (const msg of emailMessages) {
          const threadKey = msg.externalThreadId || `legacy:${customer.id}`;
          const list = byThread.get(threadKey);
          if (list) list.push(msg);
          else byThread.set(threadKey, [msg]);
        }

        for (const [threadId, threadMsgs] of byThread) {
          // threadMsgs are newest-first from the query order
          const lastMsg = threadMsgs[0]!;
          const oldestWithSubject = [...threadMsgs]
            .reverse()
            .find((m) => m.subject?.trim());
          const conversationId = buildConversationId(customer.id, "email", threadId);
          const emailIdentity = active[0] as {
            intent?: string | null;
            intentGroup?: string | null;
            intentConfidence?: number | null;
            intentUpdatedAt?: Date | null;
          };
          rows.push({
            id: conversationId,
            contactId: customer.id,
            accountId: "workspace",
            status: unresolved ? ("open" as const) : ("resolved" as const),
            lastMessageAt: lastMsg.createdAt,
            channelType: "email" as const,
            externalThreadId: threadId,
            threadSubject: displayEmailSubject(
              oldestWithSubject?.subject ?? lastMsg.subject,
            ),
            hasUnread: (unreadMap.get(customer.id)?.email ?? 0) > 0,
            intent: emailIdentity?.intent ?? null,
            intentGroup: emailIdentity?.intentGroup ?? null,
            intentConfidence: emailIdentity?.intentConfidence ?? null,
            intentUpdatedAt: emailIdentity?.intentUpdatedAt?.toISOString() ?? null,
            inbox: inboxMeta,
            contact: contactBase,
            windowState: serializeConversationWindow(
              getMessagingWindow("email", lastMsg.createdAt, windowOptions),
            ),
            messages: [shapeMessage(conversationId, lastMsg)],
          });
        }
      }
    }

    rows.sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });

    return rows;
  }

  static async listMessages(conversationId: string) {
    const { customerId, channelType, externalThreadId, isNewEmailThread } =
      this.parseConversationId(conversationId);

    if (isNewEmailThread) return [];

    const messages = await prisma.message.findMany({
      where: {
        customerId,
        channelType,
        ...(channelType === "email" && externalThreadId
          ? { externalThreadId }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    if (channelType === "email") {
      await rehydrateEmailMediaIfNeeded(messages);
    }

    await prisma.message.updateMany({
      where: {
        customerId,
        channelType,
        direction: "incoming",
        isRead: false,
        ...(channelType === "email" && externalThreadId
          ? { externalThreadId }
          : {}),
      },
      data: { isRead: true },
    });

    return messages.map((m) => fullShapeMessage(conversationId, m));
  }

  static async markConversationRead(conversationId: string) {
    const { customerId, channelType, externalThreadId, isNewEmailThread } =
      this.parseConversationId(conversationId);
    if (isNewEmailThread) return { updated: 0 };
    const result = await prisma.message.updateMany({
      where: {
        customerId,
        channelType,
        direction: "incoming",
        isRead: false,
        ...(channelType === "email" && externalThreadId
          ? { externalThreadId }
          : {}),
      },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  static async sendMessage(
    conversationId: string,
    content: string,
    subject?: string,
    media?: { mediaKey: string; mediaMimeType: string; mediaFilename?: string },
  ) {
    const { customerId, channelType, externalThreadId, isNewEmailThread } =
      this.parseConversationId(conversationId);
    const result = await sendCustomerChannelMessage({
      customerId,
      channelType,
      content,
      subject,
      externalThreadId,
      isNewEmailThread,
      mediaKey: media?.mediaKey,
      mediaMimeType: media?.mediaMimeType,
      mediaFilename: media?.mediaFilename,
    });

    const resolvedConversationId =
      channelType === "email" && result.externalThreadId
        ? buildConversationId(customerId, "email", result.externalThreadId)
        : buildConversationId(customerId, channelType, externalThreadId);

    return {
      conversationId: resolvedConversationId,
      message: result.message
        ? {
            id: result.message.id,
            conversationId: resolvedConversationId,
            direction: result.message.direction,
            content: result.message.content,
            contentType: result.message.contentType,
            subject: result.message.subject,
            status: result.message.status,
            createdAt: result.message.createdAt.toISOString(),
            externalThreadId: result.message.externalThreadId ?? null,
            isRead: true,
            hasMedia: Boolean(result.message.mediaKey),
            mediaFilename: result.message.mediaFilename ?? null,
            mediaMimeType: result.message.mediaMimeType ?? null,
            mediaItems: normalizeMediaItems(result.message!.mediaItems, {
              mediaKey: result.message!.mediaKey,
              mediaMimeType: result.message!.mediaMimeType,
              mediaFilename: result.message!.mediaFilename,
              contentType: result.message!.contentType,
            }),
          }
        : null,
      result: result.result,
    };
  }

  static async sendWhatsAppTemplate(
    conversationId: string,
    templateId: string,
    variables: Record<string, string>
  ) {
    const { customerId, channelType } = this.parseConversationId(conversationId);
    if (channelType !== "whatsapp") {
      throw new Error("Templates can only be sent on WhatsApp");
    }

    const { sendWhatsAppTemplateMessage } = await import("./MessagingService.js");
    const result = await sendWhatsAppTemplateMessage({
      customerId,
      templateId,
      variables,
    });

    return {
      conversationId,
      message: result.message ? fullShapeMessage(conversationId, result.message) : null,
      result: result.result,
    };
  }

  static async updateStatus(conversationId: string, status: "open" | "pending" | "resolved") {
    const { customerId, channelType } = this.parseConversationId(conversationId);
    if (status === "resolved") {
      await resolveAllIdentitiesForCustomerChannel({ customerId, channelType });
    } else {
      if (channelType === "whatsapp") {
        await prisma.whatsAppChannel.updateMany({
          where: { customerId },
          data: { resolved: false },
        });
      } else if (channelType === "instagram") {
        await prisma.instagramChannel.updateMany({
          where: { customerId },
          data: { resolved: false },
        });
      } else if (channelType === "facebook") {
        await prisma.facebookChannel.updateMany({
          where: { customerId },
          data: { resolved: false },
        });
      } else if (channelType === "web_chat") {
        await prisma.webChatChannel.updateMany({
          where: { customerId },
          data: { resolved: false },
        });
      } else {
        await prisma.emailChannel.updateMany({
          where: { customerId },
          data: { resolved: false },
        });
      }
      await recomputeCustomerResolved(customerId);
    }

    const list = await this.list("all");
    const found =
      list.find((r) => r.id === conversationId) ??
      list.find((r) => r.contactId === customerId && r.channelType === channelType);
    if (!found) throw new Error("Conversation not found");
    return found;
  }

  /** Delete messages + tombstone external ids so providers cannot resurrect them. */
  static async suppress(conversationId: string) {
    const { customerId, channelType, externalThreadId, isNewEmailThread } =
      this.parseConversationId(conversationId);
    if (isNewEmailThread) {
      return { ok: true, conversationId, suppressed: 0, deletedMessages: 0 };
    }
    const result = await suppressConversation({
      customerId,
      channelType,
      externalThreadId,
    });
    return { ok: true, conversationId, ...result };
  }

  /** Delete selected messages in a thread (tombstone external ids). */
  static async suppressMessages(conversationId: string, messageIds: string[]) {
    const { customerId, channelType, externalThreadId } =
      this.parseConversationId(conversationId);
    const result = await suppressSelectedMessages({
      customerId,
      channelType,
      messageIds,
      externalThreadId,
    });
    return { ok: true, conversationId, ...result };
  }
}
