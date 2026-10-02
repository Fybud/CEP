import type {
  ChannelAdapter,
  InstagramChannelConfig,
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
  OutboundTextMessage,
  SendResult,
  WebhookVerifyQuery,
} from "../shared/types.js";

const FB_GRAPH = "https://graph.facebook.com/v21.0";
const IG_GRAPH = "https://graph.instagram.com/v21.0";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isInstagramUserToken(token: string): boolean {
  return token.startsWith("IGAA") || token.startsWith("IGAAT");
}

/** Prefer @username for UI — IG Messaging rarely sends a real display name. */
export function formatInstagramDisplayName(profile: {
  username?: string | null;
  name?: string | null;
}): string | undefined {
  const username = profile.username?.replace(/^@/, "").trim();
  if (username) return `@${username}`;
  const name = profile.name?.trim();
  // Ignore numeric "names" (scoped IDs accidentally stored as name)
  if (name && !/^\d+$/.test(name)) return name;
  return undefined;
}

/**
 * Resolve IG messaging participant profile (IGSID → username).
 * Tries Instagram Graph then Facebook Graph (Page tokens).
 */
export async function resolveInstagramSenderProfile(
  config: InstagramChannelConfig,
  igsid: string,
): Promise<{ username?: string; name?: string; profilePic?: string } | null> {
  if (!config.accessToken || !igsid) return null;
  const bases = isInstagramUserToken(config.accessToken)
    ? [IG_GRAPH, FB_GRAPH]
    : [FB_GRAPH, IG_GRAPH];

  for (const base of bases) {
    try {
      const res = await fetch(
        `${base}/${encodeURIComponent(igsid)}?fields=username,name,profile_pic`,
        { headers: { Authorization: `Bearer ${config.accessToken}` } },
      );
      const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !raw || raw.error) continue;
      const username = typeof raw.username === "string" ? raw.username : undefined;
      const name = typeof raw.name === "string" ? raw.name : undefined;
      if (!username && !name) continue;
      return {
        name,
        username,
        profilePic: typeof raw.profile_pic === "string" ? raw.profile_pic : undefined,
      };
    } catch {
      /* try next host */
    }
  }
  return null;
}

export async function enrichInstagramInboundNames(
  config: InstagramChannelConfig,
  messages: (NormalizedInboundMessage | NormalizedStatusUpdate)[],
): Promise<(NormalizedInboundMessage | NormalizedStatusUpdate)[]> {
  const cache = new Map<
    string,
    { username?: string; name?: string; profilePic?: string } | null
  >();
  for (const message of messages) {
    if (message.type !== "message") continue;
    const id = message.senderId;
    if (!cache.has(id)) {
      cache.set(id, await resolveInstagramSenderProfile(config, id));
    }
    const profile = cache.get(id) ?? null;
    if (!profile) continue;

    const display = formatInstagramDisplayName(profile);
    if (display) message.senderName = display;

    (message as { raw: unknown }).raw = {
      ...(asRecord(message.raw) ?? {}),
      _profile: {
        username: profile.username?.replace(/^@/, "") ?? null,
        name: profile.name ?? null,
        profilePic: profile.profilePic ?? null,
        displayName: display ?? null,
      },
    };
  }
  return messages;
}

function extractText(messaging: Record<string, unknown>): {
  content: string;
  contentType: NormalizedInboundMessage["contentType"];
} {
  const message = asRecord(messaging.message);
  if (!message) return { content: "", contentType: "unknown" };

  if (typeof message.text === "string") {
    return { content: message.text, contentType: "text" };
  }

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const first = asRecord(attachments[0]);
  const type = String(first?.type ?? "unknown").toLowerCase();
  if (type === "ig_reel" || type === "video" || type === "share") {
    return { content: "[video]", contentType: "video" };
  }
  if (type === "image" || type === "story_mention") {
    return { content: "[image]", contentType: "image" };
  }
  if (type === "audio") return { content: "[audio]", contentType: "audio" };
  if (type === "file") return { content: "[file]", contentType: "file" };
  return { content: `[${type}]`, contentType: "unknown" };
}

function pushFromEvent(
  ev: Record<string, unknown>,
  out: (NormalizedInboundMessage | NormalizedStatusUpdate)[],
) {
  // Ignore reaction/optin webhooks — they are not DMs
  if (ev.reaction || ev.optin) return;

  if (ev.delivery || ev.read) {
    const delivery = asRecord(ev.delivery);
    const read = asRecord(ev.read);
    const ts = Number(ev.timestamp);
    const occurredAt = Number.isFinite(ts)
      ? new Date(ts < 1e12 ? ts * 1000 : ts)
      : new Date();

    if (delivery) {
      const mids = Array.isArray(delivery.mids) ? delivery.mids : [];
      for (const mid of mids) {
        out.push({
          type: "status",
          externalId: String(mid),
          status: "delivered",
          occurredAt,
          raw: ev,
        });
      }
    } else if (read) {
      // Instagram read receipts often don't have mids, they are just watermark.
      // But we can parse if they provide mids, otherwise we may need watermark logic.
      // For now, if no mids, we skip.
      const mids = Array.isArray(read.mids) ? read.mids : [];
      for (const mid of mids) {
        out.push({
          type: "status",
          externalId: String(mid),
          status: "read",
          occurredAt,
          raw: ev,
        });
      }
    }
    return;
  }

  const sender = asRecord(ev.sender);
  const recipient = asRecord(ev.recipient);
  const message = asRecord(ev.message);
  if (!message) return;

  const isEcho = Boolean(message.is_echo);
  // Echo = business/page sent from IG app (or another client) — show as outgoing in CEP.
  // Customer id is the recipient on echoes; sender on normal inbound.
  const customerId = isEcho
    ? recipient?.id
      ? String(recipient.id)
      : null
    : sender?.id
      ? String(sender.id)
      : null;
  if (!customerId) return;

  const { content, contentType } = extractText(ev);
  if (!content) return;

  const mid = String(message.mid ?? message.id ?? `${customerId}_${ev.timestamp ?? Date.now()}`);
  const ts = Number(ev.timestamp);
  // Instagram timestamps are usually ms; if clearly seconds, convert
  const occurredAt = Number.isFinite(ts)
    ? new Date(ts < 1e12 ? ts * 1000 : ts)
    : new Date();

  out.push({
    type: "message",
    externalId: mid,
    externalThreadId: customerId,
    senderId: customerId,
    peerId: isEcho ? customerId : undefined,
    direction: isEcho ? "outgoing" : "incoming",
    senderName: undefined,
    content,
    contentType,
    occurredAt,
    raw: ev,
  });
}

export const instagramAdapter: ChannelAdapter<InstagramChannelConfig> = {
  channelType: "instagram",

  verifyWebhook(config: InstagramChannelConfig, query: WebhookVerifyQuery) {
    const mode = query["hub.mode"] ?? query.mode;
    const token = query["hub.verify_token"] ?? query.verify_token;
    const challenge = query["hub.challenge"] ?? query.challenge;
    if (mode === "subscribe" && token && token === config.verifyToken && challenge) {
      return challenge;
    }
    return null;
  },

  parseInbound(_config: InstagramChannelConfig, payload: unknown): (NormalizedInboundMessage | NormalizedStatusUpdate)[] {
    const root = asRecord(payload);
    if (!root) return [];
    if (root.object !== "instagram" && root.object !== "page") {
      return [];
    }

    const out: (NormalizedInboundMessage | NormalizedStatusUpdate)[] = [];

    // Meta dashboard "Send to My Server" sample:
    // { field: "messages", value: { sender, recipient, timestamp, message } }
    if (root.field === "messages" || root.value) {
      const value = asRecord(root.value);
      if (value && (value.message || value.sender)) {
        pushFromEvent(value, out);
        if (out.length) return out;
      }
    }

    // Also accept bare messaging event
    if (root.sender && root.message) {
      pushFromEvent(root, out);
      if (out.length) return out;
    }

    const entries = Array.isArray(root.entry) ? root.entry : [];

    for (const entry of entries) {
      const entryObj = asRecord(entry);
      if (!entryObj) continue;

      // Instagram API with Instagram Login: entry.changes[].field === "messages"
      const changes = Array.isArray(entryObj.changes) ? entryObj.changes : [];
      for (const change of changes) {
        const changeObj = asRecord(change);
        const field = String(changeObj?.field ?? "");
        const value = asRecord(changeObj?.value);
        if (!value) continue;
        if (
          field === "messages" ||
          field === "message_echoes" ||
          value.message ||
          value.sender
        ) {
          pushFromEvent(value, out);
        }
      }

      // Messenger / Page-linked Instagram style: entry.messaging[]
      const messagingEvents = Array.isArray(entryObj.messaging) ? entryObj.messaging : [];
      for (const event of messagingEvents) {
        const ev = asRecord(event);
        if (ev) pushFromEvent(ev, out);
      }

      // Meta standby deliveries: entry.standby[] (array of messaging events)
      const standbyEvents = Array.isArray(entryObj.standby) ? entryObj.standby : [];
      for (const event of standbyEvents) {
        const ev = asRecord(event);
        if (ev) pushFromEvent(ev, out);
      }
    }

    return out;
  },

  async sendMessage(config: InstagramChannelConfig, message: OutboundTextMessage): Promise<SendResult> {
    if (!config.accessToken) {
      return { ok: false, status: "failed", error: "Instagram accessToken missing" };
    }

    const useIgLogin = isInstagramUserToken(config.accessToken);
    const url = useIgLogin
      ? `${IG_GRAPH}/me/messages`
      : `${FB_GRAPH}/${config.pageId}/messages`;

    if (!useIgLogin && !config.pageId) {
      return {
        ok: false,
        status: "failed",
        error: "Instagram access token is not an Instagram Login token. Reconnect Instagram in Settings.",
      };
    }

    try {
      let body: Record<string, unknown>;
      if (message.mediaKey && message.mediaMimeType) {
        const { getObjectBuffer } = await import("../../services/MediaService.js");
        const { getChannelMediaHandler } = await import("../../services/channel-media/index.js");
        const mediaHandler = getChannelMediaHandler("instagram");
        if (!mediaHandler) {
          return { ok: false, status: "failed", error: "Instagram media is not configured" };
        }
        const { body: buffer } = await getObjectBuffer(message.mediaKey);
        body = await mediaHandler.buildOutboundWithMedia({
          config,
          message,
          to: message.to,
          buffer,
        });
      } else {
        const text = message.content?.trim();
        if (!text) {
          return { ok: false, status: "failed", error: "Message text is required" };
        }
        body = {
          recipient: { id: message.to },
          message: { text },
          ...(message.messagingType === "MESSAGE_TAG" && message.tag
            ? { messaging_type: "MESSAGE_TAG", tag: message.tag }
            : {}),
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawObj = asRecord(raw);
        const err = asRecord(rawObj?.error);
        const detail =
          typeof err?.message === "string" && err.message
            ? err.message
            : `Instagram API ${res.status}`;
        return {
          ok: false,
          status: "failed",
          error: detail,
          raw,
        };
      }
      const rawObj = asRecord(raw);
      return {
        ok: true,
        externalId: rawObj?.message_id ? String(rawObj.message_id) : undefined,
        status: "sent",
        raw,
      };
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        error: err instanceof Error ? err.message : "Instagram send failed",
      };
    }
  },
};
