import type { ChannelType } from "../../generated/client/index.js";
import type { ClassifyResult } from "../IntentClassifierService.js";

/** Premade skill tools — gathered before the LLM call. READ-ONLY only. */
export type SkillToolId =
  | "getCustomer"
  | "getRecentOrder"
  | "getOrders"
  | "getInvoice"
  | "getTracking"
  | "getProducts";

export type SkillRunAction = "sent" | "resolved" | "skipped" | "failed";

/**
 * Premade skill definition (code only).
 * Tenants only toggle the featureFlag from platform-admin.
 */
export interface PremadeSkill {
  key: string;
  /** FeatureFlag key in tenant DB, e.g. skill_order_status */
  featureFlag: string;
  name: string;
  description: string;
  intents: string[];
  intentGroups: string[];
  minConfidence: number;
  cooldownMs: number;
  /** Tools to gather before asking the LLM */
  tools: SkillToolId[];
  /** How the LLM should write the reply */
  replyInstructions: string;
  /** Mark channel resolved after a successful send (or instead of send for resolve-only) */
  resolveAfter: boolean;
  /** If true, no LLM/send — only resolve (noise) */
  resolveOnly?: boolean;
  /** Used when LLM is down */
  fallbackReply?: string;
  /**
   * Send Shopify product cards (image + price caption) instead of a single text LLM reply.
   * Still read-only catalog GET.
   */
  sendProductCards?: boolean;
}

export interface SkillContext {
  channelType: ChannelType;
  channelId: string;
  content: string;
  classify: ClassifyResult;
  customerId: string | null;
  customerName: string | null;
  email: string | null;
  phone: string | null;
}

export interface ToolTraceEntry {
  tool: string;
  ok: boolean;
  summary?: string;
  error?: string;
}

export interface SkillExecutionResult {
  action: SkillRunAction;
  detail?: string;
  messageId?: string;
  replyBody?: string;
  toolTrace?: ToolTraceEntry[];
}
