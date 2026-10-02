import type { Prisma } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import {
  emailAdapter,
  getEmailClient,
  resolveChannelConfig,
  type EmailChannelConfig,
} from "../adapters/shared/index.js";
import { ingestInboundMessages } from "./MessagingService.js";

interface PubSubPushBody {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

interface EmailPubSubData {
  emailAddress?: string;
  historyId?: string;
}

const RECENT_INBOX_LIMIT = 30;

/** Serialize Gmail ingest so Pub/Sub bursts + boot catch-up don't exhaust Prisma's tiny pool. */
let emailIngestTail: Promise<unknown> = Promise.resolve();

function withEmailIngestLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = emailIngestTail.then(fn, fn);
  emailIngestTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function asEmailConfig(raw: Prisma.JsonValue): EmailChannelConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  // Accept legacy provider:gmail rows and new email-only configs
  if (obj.provider === "gmail" || obj.refreshToken || obj.clientId) {
    const config = resolveChannelConfig("email", obj) as EmailChannelConfig;
    return {
      ...config,
      // Static Gmail application settings come from the API environment.
      clientId: env.gmailClientId || config.clientId,
      clientSecret: env.gmailClientSecret || config.clientSecret,
      pubsubTopic: env.gmailPubsubTopic || config.pubsubTopic,
    };
  }
  return null;
}

/** Pick an Email inbox (optional match on notification emailAddress). Prefer enabled. */
async function resolveEmailInbox(emailAddress?: string) {
  const candidates = await prisma.channelConfig.findMany({
    where: { channelType: "email" },
    orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
  });
  const emailInboxes = candidates.filter((inbox) => asEmailConfig(inbox.channelConfig));

  if (emailAddress) {
    const matched = emailInboxes.find((inbox) => {
      const cfg = inbox.channelConfig as Record<string, unknown>;
      const email = typeof cfg.email === "string" ? cfg.email : null;
      return email?.toLowerCase() === emailAddress.toLowerCase();
    });
    if (matched) return matched;
  }

  if (emailInboxes.length === 0) {
    throw new Error("No Email inbox found — connect Gmail in Settings or set .env tokens");
  }
  const enabled = emailInboxes.filter((i) => i.enabled);
  if (enabled.length === 1) return enabled[0]!;
  if (enabled.length > 1) {
    throw new Error("Multiple Email inboxes enabled — keep a single email inbox");
  }
  return emailInboxes[0]!;
}

async function listRecentLabeledMessageIds(
  gmail: ReturnType<typeof getEmailClient>,
  labelIds: string[],
  maxResults = RECENT_INBOX_LIMIT,
): Promise<string[]> {
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds,
    maxResults,
  });
  return (listRes.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);
}

async function listRecentInboxMessageIds(
  gmail: ReturnType<typeof getEmailClient>,
  maxResults = RECENT_INBOX_LIMIT,
): Promise<string[]> {
  return listRecentLabeledMessageIds(gmail, ["INBOX"], maxResults);
}

async function listRecentSentMessageIds(
  gmail: ReturnType<typeof getEmailClient>,
  maxResults = RECENT_INBOX_LIMIT,
): Promise<string[]> {
  return listRecentLabeledMessageIds(gmail, ["SENT"], maxResults);
}

async function processGmailMessageIds(input: {
  inboxId: string;
  config: EmailChannelConfig;
  messageIds: string[];
}): Promise<{ processed: number; skipped: number }> {
  const gmail = getEmailClient(input.config);
  let processed = 0;
  let skipped = 0;

  for (const msgId of [...new Set(input.messageIds)]) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msgId,
        format: "full",
      });
      const msgData = msgRes.data;
      const labels = msgData.labelIds ?? [];
      // Skip drafts / chat / trash noise; keep INBOX and SENT (device/app replies).
      if (labels.includes("DRAFT") || labels.includes("TRASH") || labels.includes("SPAM")) {
        skipped++;
        continue;
      }
      if (!labels.includes("INBOX") && !labels.includes("SENT")) {
        skipped++;
        continue;
      }

      const normalized = emailAdapter.parseInbound(input.config, msgData);
      if (normalized.length === 0) {
        console.warn(`[email] parseInbound empty for gmail id=${msgId}`);
        skipped++;
        continue;
      }

      const first = normalized[0]!;
      if (first.type === "status") {
        skipped++;
        continue;
      }
      const peer =
        first.direction === "outgoing"
          ? first.peerId ?? first.senderEmail ?? first.senderId
          : first.senderEmail ?? first.senderId;
      const result = await ingestInboundMessages({
        channelConfigId: input.inboxId,
        payload: msgData,
        eventKey: `email:${normalized.map((m) => m.externalId).join(",")}`,
      });
      if (result.created > 0) {
        processed += result.created;
        console.info(
          `[email] ingested gmail=${msgId} dir=${first.direction ?? "incoming"} peer=${peer ?? "?"} created=${result.created}`,
        );
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`[email] Failed to process message ${msgId}:`, err);
      skipped++;
    }
  }

  return { processed, skipped };
}

export async function handlePubSubNotification(
  body: PubSubPushBody,
): Promise<{ processed: number; skipped: number; inboxId: string; primed?: boolean }> {
  return withEmailIngestLock(() => handlePubSubNotificationLocked(body));
}

async function handlePubSubNotificationLocked(
  body: PubSubPushBody,
): Promise<{ processed: number; skipped: number; inboxId: string; primed?: boolean }> {
  const rawData = body.message?.data;
  if (!rawData) throw new Error("Missing Pub/Sub message data");

  let pubsubData: EmailPubSubData;
  try {
    pubsubData = JSON.parse(Buffer.from(rawData, "base64").toString("utf-8"));
  } catch {
    throw new Error("Invalid Pub/Sub message data (not valid base64 JSON)");
  }

  const notificationHistoryId = String(pubsubData.historyId ?? "");
  if (!notificationHistoryId) throw new Error("Missing historyId in Pub/Sub data");

  const inbox = await resolveEmailInbox(pubsubData.emailAddress);
  const inboxId = inbox.id;

  let config = asEmailConfig(inbox.channelConfig);
  if (!config) throw new Error("Inbox is not configured for email");

  const startHistoryId = config.historyId ? String(config.historyId) : "";
  let primed = false;
  if (!startHistoryId) {
    console.warn(
      `[email] No historyId on inbox ${inboxId}; running users.watch and catching up recent INBOX mail.`,
    );
    primed = true;
    try {
      await setupEmailWatch(inboxId);
      const refreshed = await prisma.channelConfig.findUnique({ where: { id: inboxId } });
      config = refreshed ? asEmailConfig(refreshed.channelConfig) : config;
    } catch (err) {
      console.error("[email] Auto watch setup failed:", err);
      await updateInboxConfig(inboxId, inbox.channelConfig, {
        historyId: notificationHistoryId,
      });
    }
  }

  const gmail = getEmailClient(config!);
  let messageIds: string[] = [];
  let historyOk = false;

  // History since last cursor (can miss messages if the cursor advanced ahead of ingest).
  // No labelId filter so SENT (agent replies from Gmail app) is included with INBOX.
  if (startHistoryId && !primed) {
    try {
      let pageToken: string | undefined;
      do {
        const historyRes = await gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
          pageToken,
        });
        for (const h of historyRes.data.history ?? []) {
          for (const a of h.messagesAdded ?? []) {
            if (a.message?.id) messageIds.push(a.message.id);
          }
        }
        pageToken = historyRes.data.nextPageToken ?? undefined;
      } while (pageToken);
      historyOk = true;
    } catch (err: unknown) {
      const status = (err as { code?: number })?.code;
      console.warn("[email] history.list failed:", status ?? err);
    }
  }

  // Only scan recent INBOX+SENT when history is empty/failed or watch was just primed.
  // Unioning 30 messages on every Pub/Sub push re-ran ingest under a 3-conn pool (P2024).
  if (!historyOk || messageIds.length === 0 || primed) {
    try {
      const [recentInbox, recentSent] = await Promise.all([
        listRecentInboxMessageIds(gmail),
        listRecentSentMessageIds(gmail),
      ]);
      const recentIds = [...recentInbox, ...recentSent];
      console.warn(
        `[email] history empty/failed from ${startHistoryId || "(none)"}; using recent INBOX+SENT (${recentIds.length})`,
      );
      messageIds = [...messageIds, ...recentIds];
    } catch (err) {
      console.error("[email] recent INBOX/SENT list failed:", err);
    }
  } else {
    console.info(`[email] history=${messageIds.length} (skipping recent union)`);
  }

  messageIds = [...new Set(messageIds)];

  if (messageIds.length === 0) {
    await updateInboxConfig(inboxId, inbox.channelConfig, {
      historyId: notificationHistoryId,
    });
    return { processed: 0, skipped: 0, inboxId, primed };
  }

  const { processed, skipped } = await processGmailMessageIds({
    inboxId,
    config: config!,
    messageIds,
  });

  await updateInboxConfig(
    inboxId,
    (await prisma.channelConfig.findUnique({ where: { id: inboxId } }))?.channelConfig ??
      inbox.channelConfig,
    {
      historyId: notificationHistoryId,
    },
  );

  console.info(`[email] pubsub done inbox=${inboxId} processed=${processed} skipped=${skipped}`);
  return { processed, skipped, inboxId, primed };
}

/** After watch / redeploy: ingest recent INBOX + SENT so mail isn't stuck waiting for Pub/Sub. */
export async function catchUpRecentEmailMessages(
  inboxId: string,
  maxResults = RECENT_INBOX_LIMIT,
): Promise<{ processed: number; skipped: number }> {
  return withEmailIngestLock(async () => {
    const inbox = await prisma.channelConfig.findUnique({ where: { id: inboxId } });
    if (!inbox) return { processed: 0, skipped: 0 };
    const config = asEmailConfig(inbox.channelConfig);
    if (!config) return { processed: 0, skipped: 0 };

    const gmail = getEmailClient(config);
    const [inboxIds, sentIds] = await Promise.all([
      listRecentInboxMessageIds(gmail, maxResults),
      listRecentSentMessageIds(gmail, maxResults),
    ]);
    return processGmailMessageIds({
      inboxId: inbox.id,
      config,
      messageIds: [...inboxIds, ...sentIds],
    });
  });
}

export async function setupEmailWatch(inboxId?: string) {
  const inbox = inboxId
    ? await prisma.channelConfig.findUnique({ where: { id: inboxId } })
    : await resolveEmailInbox();
  if (!inbox) throw new Error("Email inbox not found");

  const config = asEmailConfig(inbox.channelConfig);
  if (!config) throw new Error("Inbox is not configured for email");
  if (!config.pubsubTopic) throw new Error("Email pubsubTopic missing");
  if (!config.refreshToken && !config.accessToken) {
    throw new Error("Email OAuth tokens missing (refreshToken/accessToken)");
  }

  const gmail = getEmailClient(config);
  const watchRes = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: config.pubsubTopic,
      // INBOX = customer mail; SENT = agent replies from Gmail web/app outside CEP
      labelIds: ["INBOX", "SENT"],
    },
  });

  const historyId = String(watchRes.data.historyId ?? "");
  const expiration = Number(watchRes.data.expiration ?? 0);

  await updateInboxConfig(inbox.id, inbox.channelConfig, {
    historyId,
    watchExpiration: expiration,
  });

  return {
    inboxId: inbox.id,
    historyId,
    watchExpiration: expiration,
    expiresAt: expiration ? new Date(expiration).toISOString() : null,
  };
}

/** Google caps a watch at ~7 days. Renew on a timer so mail keeps arriving. */
const WATCH_RENEW_MS = 12 * 60 * 60 * 1000;

export function startGmailWatchScheduler(): void {
  const tick = async () => {
    try {
      const results = await renewEmailWatch();
      for (const r of results) {
        if (!r.ok) {
          console.warn(`[email] watch renew failed inbox=${r.inboxId}: ${r.error}`);
          continue;
        }

        console.log(`[email] watch renewed inbox=${r.inboxId} expires=${r.expiresAt ?? "?"}`);
        try {
          const catchUp = await catchUpRecentEmailMessages(r.inboxId);
          console.log(
            `[email] post-renew catch-up inbox=${r.inboxId} processed=${catchUp.processed} skipped=${catchUp.skipped}`,
          );
        } catch (err) {
          console.warn(
            `[email] post-renew catch-up failed inbox=${r.inboxId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } catch (err) {
      console.warn("[email] watch scheduler:", err instanceof Error ? err.message : err);
    }
  };

  void tick();
  setInterval(tick, WATCH_RENEW_MS);
}

/** @deprecated use setupEmailWatch */
export const setupGmailWatch = setupEmailWatch;

export async function renewEmailWatch(inboxId?: string) {
  const where: import("../generated/client/index.js").Prisma.ChannelConfigWhereInput = {
    channelType: "email",
  };
  if (inboxId) where.id = inboxId;

  const inboxes = await prisma.channelConfig.findMany({
    where,
    orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
  });
  const results: Array<{ inboxId: string; ok: boolean; error?: string; expiresAt?: string }> = [];

  for (const inbox of inboxes) {
    const config = asEmailConfig(inbox.channelConfig);
    if (!config) continue;
    if (!config.pubsubTopic || (!config.refreshToken && !config.accessToken)) {
      results.push({
        inboxId: inbox.id,
        ok: false,
        error: "missing pubsubTopic or OAuth tokens",
      });
      continue;
    }
    try {
      if (!inbox.enabled) {
        await prisma.channelConfig.update({ where: { id: inbox.id }, data: { enabled: true } });
      }
      const result = await setupEmailWatch(inbox.id);
      results.push({
        inboxId: inbox.id,
        ok: true,
        expiresAt: result.expiresAt ?? undefined,
      });
    } catch (err) {
      results.push({
        inboxId: inbox.id,
        ok: false,
        error: err instanceof Error ? err.message : "watch failed",
      });
    }
  }

  return results;
}

/** @deprecated use renewGmailWatch */
export const renewGmailWatch = renewEmailWatch;

async function updateInboxConfig(
  inboxId: string,
  existing: Prisma.JsonValue,
  patch: Record<string, unknown>,
) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch)) {
    base[key] = value;
  }
  delete base.provider;
  delete base.smtpHost;
  delete base.smtpPort;
  delete base.smtpUser;
  delete base.smtpPass;
  delete base.fromAddress;
  delete base.fromName;

  await prisma.channelConfig.update({
    where: { id: inboxId },
    data: { channelConfig: base as Prisma.InputJsonValue },
  });
}
