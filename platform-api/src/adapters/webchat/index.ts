import type { ChannelAdapter, ChannelType, ChannelConfig, WebhookVerifyQuery, NormalizedInboundMessage, NormalizedStatusUpdate, OutboundTextMessage, SendResult } from "../shared/types.js";
import { randomUUID } from "crypto";

export const webChatAdapter: ChannelAdapter = {
  channelType: "web_chat",
  
  verifyWebhook(config: ChannelConfig, query: WebhookVerifyQuery): string | null {
    return null;
  },

  parseInbound(config: ChannelConfig, payload: unknown): (NormalizedInboundMessage | NormalizedStatusUpdate)[] {
    return [];
  },

  async sendMessage(config: ChannelConfig, message: OutboundTextMessage): Promise<SendResult> {
    return {
      ok: true,
      status: "sent",
      externalId: randomUUID()
    };
  }
};
