export type ChannelType = "whatsapp" | "instagram" | "facebook" | "email" | "web_chat";

export type MessageContentType = "text" | "html" | "image" | "file" | "audio" | "video" | "template" | "unknown";

export interface WhatsAppChannelConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  businessAccountId?: string;
}

export interface InstagramChannelConfig {
  /**
   * Legacy Facebook Page messaging only. Unused for Instagram Login
   * (`graph.instagram.com/me/messages`). Stripped on Settings save / Connect.
   */
  pageId?: string;
  accessToken: string;
  verifyToken: string;
  /** Instagram App Secret from Instagram > API setup with Instagram login */
  instagramAppSecret?: string;
  /** Instagram App ID from Instagram > API setup with Instagram login */
  instagramAppId?: string;
  instagramUsername?: string;
}

export interface FacebookChannelConfig {
  pageId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  pageName?: string;
}

/** Email channel = Gmail (vendor assumed). */
export interface EmailChannelConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  pubsubTopic: string;
  /** Connected mailbox address (optional; used for Pub/Sub matching) */
  email?: string;
  historyId?: string;
  watchExpiration?: number;
}

export type ChannelConfig =
  | WhatsAppChannelConfig
  | InstagramChannelConfig
  | FacebookChannelConfig
  | EmailChannelConfig;

export interface OutboundTextMessage {
  to: string;
  content: string;
  contentType?: MessageContentType;
  /** Outbound media already stored on S3 (WhatsApp / Instagram / Email). */
  mediaKey?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  /**
   * Email: RFC Message-ID of the parent message (In-Reply-To).
   * Must be the header Message-ID (e.g. `<CABx…@mail.gmail.com>`), never a Gmail API id.
   */
  replyToExternalId?: string;
  /** Email: space-separated RFC Message-ID chain for the References header */
  references?: string;
  subject?: string;
  /** Email: Gmail API thread id so the send stays in the same Gmail conversation */
  threadId?: string;
  /** WhatsApp Template Data */
  templatePayload?: unknown;
  /** Instagram Messaging API: MESSAGE_TAG with HUMAN_AGENT for 24h–7d window */
  messagingType?: "MESSAGE_TAG" | "RESPONSE";
  tag?: "HUMAN_AGENT";
}

export interface SendResult {
  ok: boolean;
  externalId?: string;
  status: "sent" | "queued" | "failed";
  raw?: unknown;
  error?: string;
}

export interface InboundAttachment {
  url?: string;
  mimeType?: string;
  filename?: string;
}

export interface NormalizedInboundMessage {
  type?: "message";
  externalId: string;
  externalThreadId?: string;
  /** WhatsApp phone E.164, IG scoped id, email address */
  senderId: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  /**
   * Provider-sourced direction. Default incoming (customer → business).
   * Outgoing = agent reply from native app / device (IG echo, Gmail SENT, WA smb echo).
   */
  direction?: "incoming" | "outgoing";
  /**
   * For outgoing echoes: the customer peer id (IGSID, WA phone digits, email).
   * When set, identity resolution uses peerId instead of senderId.
   */
  peerId?: string;
  content: string;
  contentType: MessageContentType;
  subject?: string;
  attachments?: InboundAttachment[];
  occurredAt: Date;
  raw: unknown;
}

export interface NormalizedStatusUpdate {
  type: "status";
  externalId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
  occurredAt: Date;
  raw: unknown;
}

export interface WebhookVerifyQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
  mode?: string;
  verify_token?: string;
  challenge?: string;
}

export interface ChannelAdapter<TConfig extends ChannelConfig = ChannelConfig> {
  readonly channelType: ChannelType;
  verifyWebhook?(config: TConfig, query: WebhookVerifyQuery): string | null;
  parseInbound(config: TConfig, payload: unknown): (NormalizedInboundMessage | NormalizedStatusUpdate)[];
  sendMessage(config: TConfig, message: OutboundTextMessage): Promise<SendResult>;
}
