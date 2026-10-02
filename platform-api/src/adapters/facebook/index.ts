import type {
  ChannelAdapter,
  FacebookChannelConfig,
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
  OutboundTextMessage,
  SendResult,
  WebhookVerifyQuery,
} from "../shared/types.js";

const FB_GRAPH = "https://graph.facebook.com/v21.0";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function formatFacebookDisplayName(profile: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}): string | undefined {
  if (profile.name?.trim()) return profile.name.trim();
  const parts = [profile.first_name, profile.last_name].filter(Boolean).map((p) => p!.trim());
  if (parts.length) return parts.join(" ");
  return undefined;
}

export async function resolveFacebookSenderProfile(
  config: FacebookChannelConfig,
  psid: string,
): Promise<{ name?: string; profilePic?: string } | null> {
  if (!config.accessToken || !psid) return null;
  try {
    const res = await fetch(
      `${FB_GRAPH}/${encodeURIComponent(psid)}?fields=first_name,last_name,name,profile_pic&access_token=${encodeURIComponent(config.accessToken)}`,
    );
    const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !raw || raw.error) return null;

    const name =
      typeof raw.name === "string"
        ? raw.name
        : [raw.first_name, raw.last_name].filter((x) => typeof x === "string" && x.trim()).join(" ") ||
          undefined;

    return {
      name,
      profilePic: typeof raw.profile_pic === "string" ? raw.profile_pic : undefined,
    };
  } catch {
    return null;
  }
}

export async function enrichFacebookInboundNames(
  config: FacebookChannelConfig,
  messages: (NormalizedInboundMessage | NormalizedStatusUpdate)[],
): Promise<(NormalizedInboundMessage | NormalizedStatusUpdate)[]> {
  const cache = new Map<string, { name?: string; profilePic?: string } | null>();
  for (const message of messages) {
    if (message.type !== "message") continue;
    const id = message.senderId;
    if (!cache.has(id)) {
      cache.set(id, await resolveFacebookSenderProfile(config, id));
    }
    const profile = cache.get(id) ?? null;
    if (!profile) continue;

    if (profile.name) message.senderName = profile.name;

    (message as { raw: unknown }).raw = {
      ...(asRecord(message.raw) ?? {}),
      _profile: {
        name: profile.name ?? null,
        profilePic: profile.profilePic ?? null,
        displayName: profile.name ?? null,
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
  const type = String(first?.type ?? "unknown");
  if (type === "image") return { content: "[image]", contentType: "image" };
  if (type === "audio") return { content: "[audio]", contentType: "audio" };
  if (type === "video") return { content: "[video]", contentType: "video" };
  if (type === "file") return { content: "[file]", contentType: "file" };
  return { content: `[${type}]`, contentType: "unknown" };
}

function pushFromEvent(
  ev: Record<string, unknown>,
  out: (NormalizedInboundMessage | NormalizedStatusUpdate)[],
) {
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

export const facebookAdapter: ChannelAdapter<FacebookChannelConfig> = {
  channelType: "facebook",

  verifyWebhook(config: FacebookChannelConfig, query: WebhookVerifyQuery) {
    const mode = query["hub.mode"] ?? query.mode;
    const token = query["hub.verify_token"] ?? query.verify_token;
    const challenge = query["hub.challenge"] ?? query.challenge;
    if (mode === "subscribe" && token && token === config.verifyToken && challenge) {
      return challenge;
    }
    return null;
  },

  parseInbound(_config: FacebookChannelConfig, payload: unknown): (NormalizedInboundMessage | NormalizedStatusUpdate)[] {
    const root = asRecord(payload);
    if (!root) return [];
    if (root.object !== "page") {
      return [];
    }

    const out: (NormalizedInboundMessage | NormalizedStatusUpdate)[] = [];

    if (root.field === "messages" || root.value) {
      const value = asRecord(root.value);
      if (value && (value.message || value.sender)) {
        pushFromEvent(value, out);
        if (out.length) return out;
      }
    }

    if (root.sender && root.message) {
      pushFromEvent(root, out);
      if (out.length) return out;
    }

    const entries = Array.isArray(root.entry) ? root.entry : [];
    for (const entry of entries) {
      const entryObj = asRecord(entry);
      if (!entryObj) continue;

      const messagingEvents = Array.isArray(entryObj.messaging) ? entryObj.messaging : [];
      for (const event of messagingEvents) {
        const ev = asRecord(event);
        if (ev) pushFromEvent(ev, out);
      }

      const standbyEvents = Array.isArray(entryObj.standby) ? entryObj.standby : [];
      for (const event of standbyEvents) {
        const ev = asRecord(event);
        if (ev) pushFromEvent(ev, out);
      }
    }

    return out;
  },

  async sendMessage(config: FacebookChannelConfig, message: OutboundTextMessage): Promise<SendResult> {
    if (!config.accessToken) {
      return { ok: false, status: "failed", error: "Facebook Page accessToken missing" };
    }

    const url = config.pageId
      ? `${FB_GRAPH}/${encodeURIComponent(config.pageId)}/messages`
      : `${FB_GRAPH}/me/messages`;

    try {
      let body: Record<string, unknown>;
      if (message.mediaKey && message.mediaMimeType) {
        const { getObjectBuffer } = await import("../../services/MediaService.js");
        const { getChannelMediaHandler } = await import("../../services/channel-media/index.js");
        const mediaHandler = getChannelMediaHandler("facebook");
        if (!mediaHandler) {
          return { ok: false, status: "failed", error: "Facebook media is not configured" };
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
          messaging_type: message.messagingType ?? "RESPONSE",
          ...(message.tag ? { tag: message.tag } : {}),
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
            : `Facebook API ${res.status}`;
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
        error: err instanceof Error ? err.message : "Facebook send failed",
      };
    }
  },
};
