import type {
  ChannelAdapter,
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
  OutboundTextMessage,
  SendResult,
  WebhookVerifyQuery,
  WhatsAppChannelConfig,
} from "../shared/types.js";

const GRAPH = "https://graph.facebook.com/v21.0";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textFromMessage(msg: Record<string, unknown>): {
  content: string;
  contentType: NormalizedInboundMessage["contentType"];
} {
  const type = typeof msg.type === "string" ? msg.type : "unknown";
  if (type === "text") {
    const text = asRecord(msg.text);
    return { content: String(text?.body ?? ""), contentType: "text" };
  }
  if (type === "image") {
    const image = asRecord(msg.image);
    return {
      content: String(image?.caption ?? "[image]"),
      contentType: "image",
    };
  }
  if (type === "audio") return { content: "[audio]", contentType: "audio" };
  if (type === "video") return { content: "[video]", contentType: "video" };
  if (type === "document") {
    const doc = asRecord(msg.document);
    return {
      content: String(doc?.filename ?? "[file]"),
      contentType: "file",
    };
  }
  // Meta sends type "unsupported" when Cloud API cannot deliver the original
  // (e.g. view-once media, some stickers/polls, or types not enabled for the number).
  if (type === "unsupported") {
    return {
      content: "Unsupported message type (WhatsApp could not deliver this content to the API)",
      contentType: "unknown",
    };
  }
  if (type === "sticker") return { content: "[sticker]", contentType: "unknown" };
  if (type === "location") return { content: "[location]", contentType: "unknown" };
  if (type === "contacts") return { content: "[contact card]", contentType: "unknown" };
  if (type === "reaction") {
    const reaction = asRecord(msg.reaction);
    const emoji = typeof reaction?.emoji === "string" ? reaction.emoji : "";
    return { content: emoji ? `Reacted ${emoji}` : "[reaction]", contentType: "text" };
  }
  if (type === "button" || type === "interactive") {
    const button = asRecord(msg.button);
    const interactive = asRecord(msg.interactive);
    const buttonText =
      (typeof button?.text === "string" && button.text) ||
      (typeof asRecord(interactive?.button_reply)?.title === "string"
        ? String(asRecord(interactive?.button_reply)?.title)
        : "") ||
      (typeof asRecord(interactive?.list_reply)?.title === "string"
        ? String(asRecord(interactive?.list_reply)?.title)
        : "");
    return {
      content: buttonText || "[button reply]",
      contentType: "text",
    };
  }
  return { content: `[${type}]`, contentType: "unknown" };
}

export const whatsappAdapter: ChannelAdapter<WhatsAppChannelConfig> = {
  channelType: "whatsapp",

  verifyWebhook(config: WhatsAppChannelConfig, query: WebhookVerifyQuery) {
    const mode = query["hub.mode"] ?? query.mode;
    const token = query["hub.verify_token"] ?? query.verify_token;
    const challenge = query["hub.challenge"] ?? query.challenge;
    if (mode === "subscribe" && token && token === config.verifyToken && challenge) {
      return challenge;
    }
    return null;
  },

  parseInbound(_config: WhatsAppChannelConfig, payload: unknown): (NormalizedInboundMessage | NormalizedStatusUpdate)[] {
    const root = asRecord(payload);
    if (!root) return [];

    const entries = Array.isArray(root.entry) ? root.entry : [];
    const out: (NormalizedInboundMessage | NormalizedStatusUpdate)[] = [];

    for (const entry of entries) {
      const entryObj = asRecord(entry);
      const changes = Array.isArray(entryObj?.changes) ? entryObj!.changes : [];
      for (const change of changes) {
        const changeObj = asRecord(change);
        const value = asRecord(changeObj?.value);
        if (!value) continue;

        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const contactNameByWaId = new Map<string, string>();
        for (const c of contacts) {
          const cObj = asRecord(c);
          const profile = asRecord(cObj?.profile);
          const waId = String(cObj?.wa_id ?? "");
          if (waId && profile?.name) contactNameByWaId.set(waId, String(profile.name));
        }

        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          const msg = asRecord(message);
          if (!msg?.id || !msg.from) continue;
          const from = String(msg.from);
          const { content, contentType } = textFromMessage(msg);
          const ts = Number(msg.timestamp);
          out.push({
            type: "message",
            externalId: String(msg.id),
            externalThreadId: from,
            senderId: from,
            senderName: contactNameByWaId.get(from),
            senderPhone: from.startsWith("+") ? from : `+${from}`,
            direction: "incoming",
            content,
            contentType,
            occurredAt: Number.isFinite(ts) ? new Date(ts * 1000) : new Date(),
            raw: msg,
          });
        }

        // Coexistence / Business App: agent replies from phone appear as smb_message_echoes
        // (also accept message_echoes if Meta delivers that field name).
        const echoBuckets = [
          ...(Array.isArray(value.smb_message_echoes) ? value.smb_message_echoes : []),
          ...(Array.isArray(value.message_echoes) ? value.message_echoes : []),
        ];
        for (const echo of echoBuckets) {
          const msg = asRecord(echo);
          if (!msg?.id) continue;
          const to = String(msg.to ?? msg.recipient ?? "").replace(/\D/g, "");
          if (!to) continue;
          const { content, contentType } = textFromMessage(msg);
          if (!content) continue;
          const ts = Number(msg.timestamp);
          out.push({
            type: "message",
            externalId: String(msg.id),
            externalThreadId: to,
            senderId: to,
            peerId: to,
            senderPhone: to.startsWith("+") ? to : `+${to}`,
            senderName: contactNameByWaId.get(to),
            direction: "outgoing",
            content,
            contentType,
            occurredAt: Number.isFinite(ts) ? new Date(ts * 1000) : new Date(),
            raw: msg,
          });
        }

        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const status of statuses) {
          const sObj = asRecord(status);
          if (!sObj?.id || !sObj.status) continue;
          
          let mappedStatus: "sent" | "delivered" | "read" | "failed" = "sent";
          if (sObj.status === "delivered") mappedStatus = "delivered";
          if (sObj.status === "read") mappedStatus = "read";
          if (sObj.status === "failed") mappedStatus = "failed";
          if (sObj.status === "sent") mappedStatus = "sent";

          const errors = Array.isArray(sObj.errors) ? sObj.errors : [];
          const errorMsg = errors.length > 0 ? String(asRecord(errors[0])?.message ?? "") : undefined;

          const ts = Number(sObj.timestamp);
          out.push({
            type: "status",
            externalId: String(sObj.id),
            status: mappedStatus,
            error: errorMsg,
            occurredAt: Number.isFinite(ts) ? new Date(ts * 1000) : new Date(),
            raw: status,
          });
        }
      }
    }

    return out;
  },

  async sendMessage(config: WhatsAppChannelConfig, message: OutboundTextMessage): Promise<SendResult> {
    const phoneNumberId = String(config.phoneNumberId ?? "").trim();
    let accessToken = String(config.accessToken ?? "").trim();
    if (/^bearer\s+/i.test(accessToken)) {
      accessToken = accessToken.replace(/^bearer\s+/i, "").trim();
    }
    if (!phoneNumberId || !accessToken) {
      return {
        ok: false,
        status: "failed",
        error: "WhatsApp is not configured. Add credentials in Settings → Channels.",
      };
    }

    const to = message.to.replace(/[^\d]/g, "");
    if (!to) {
      return { ok: false, status: "failed", error: "WhatsApp recipient missing" };
    }

    try {
      let body: Record<string, unknown>;
      if (message.mediaKey && message.mediaMimeType) {
        const { getObjectBuffer } = await import("../../services/MediaService.js");
        const { getChannelMediaHandler } = await import("../../services/channel-media/index.js");
        const mediaHandler = getChannelMediaHandler("whatsapp");
        if (!mediaHandler) {
          return { ok: false, status: "failed", error: "WhatsApp media is not configured" };
        }
        const { body: buffer } = await getObjectBuffer(message.mediaKey);
        body = await mediaHandler.buildOutboundWithMedia({
          config,
          message,
          to,
          buffer,
        });
      } else if (message.contentType === "template" && message.templatePayload) {
        body = {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: message.templatePayload,
        };
      } else {
        const text = message.content?.trim();
        if (!text) {
          return { ok: false, status: "failed", error: "Message text is required" };
        }
        body = {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body: text },
        };
      }

      const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
            : `WhatsApp API ${res.status}`;
        const code = typeof err?.code === "number" ? err.code : undefined;
        const isAuth =
          code === 190 ||
          code === 102 ||
          /auth|oauth|access token|session has expired|permission/i.test(detail);
        const isNotRegistered = code === 133010 || /not registered/i.test(detail);
        const isHelloWorldTest =
          code === 131058 || /hello world templates can only be sent/i.test(detail);
        return {
          ok: false,
          status: "failed",
          error: isAuth
            ? "WhatsApp access token is invalid or expired. Update it in Settings → Channels."
            : isNotRegistered
              ? "WhatsApp phone number is not registered on Cloud API. Register it in Meta (POST /{phone-number-id}/register) and retry."
              : isHelloWorldTest
                ? "The hello_world template only works on Meta's test phone numbers. Create and approve a re-engagement template in Templates, then sync from Meta."
                : detail,
          raw,
        };
      }
      const rawObj = asRecord(raw);
      const messages = Array.isArray(rawObj?.messages) ? rawObj!.messages : [];
      const first = asRecord(messages[0]);
      return {
        ok: true,
        externalId: first?.id ? String(first.id) : undefined,
        status: "queued",
        raw,
      };
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        error: err instanceof Error ? err.message : "WhatsApp send failed",
      };
    }
  },
};
