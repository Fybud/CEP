import type { PremadeSkill } from "./types.js";

/**
 * Fixed skill catalog. Operators enable/disable via FeatureFlag keys in platform-admin.
 *
 * READ-ONLY: tools must never mutate Shopify. See README.md and
 * `.cursor/rules/agentic-skills-readonly.mdc`.
 */
export const PREMADE_SKILLS: PremadeSkill[] = [
  {
    key: "noise_resolve",
    featureFlag: "skill_noise_resolve",
    name: "Noise auto-resolve",
    description:
      "Auto-resolve thanks / greetings / spam without a reply.",
    intents: ["noise/thanks", "noise/greeting", "noise/spam"],
    intentGroups: [],
    minConfidence: 0.55,
    cooldownMs: 0,
    tools: [],
    replyInstructions: "",
    resolveAfter: true,
    resolveOnly: true,
  },
  {
    key: "order_status",
    featureFlag: "skill_order_status",
    name: "Order status",
    description:
      "When intent is order/status or order/tracking: read orders + tracking, LLM reply, send, resolve.",
    intents: ["order/status", "order/tracking"],
    minConfidence: 0.55,
    cooldownMs: 3 * 60 * 1000,
    intentGroups: [],
    tools: ["getCustomer", "getRecentOrder", "getOrders", "getInvoice", "getTracking"],
    resolveAfter: true,
    replyInstructions: `You are a friendly ecommerce support agent messaging a real customer.

Write a short, humanized reply about their order status / tracking using ONLY the JSON tool data provided.
Rules:
- Sound natural and warm, not robotic or like a template dump.
- Mention the most relevant recent order(s): order number, status, and date. Include item names if helpful.
- Include tracking number or URL only if present in the data.
- If there are no orders, apologize briefly and say a human teammate can help.
- Never invent tracking numbers, addresses, payment details, or invoices that are not in the data.
- If invoice data is unavailable, do not invent one — just answer status from orders.
- Keep it under ~90 words. No markdown headings. Plain text suitable for WhatsApp/chat.
- Do not ask more than one short follow-up question.
- Never claim you cancelled, refunded, or changed an order — you can only share read-only status.`,
  },
  {
    key: "delivery_status",
    featureFlag: "skill_delivery_status",
    name: "Delivery status",
    description:
      "When intent is post_purchase/delivery: read orders/tracking, LLM reply, send, resolve.",
    intents: ["post_purchase/delivery"],
    intentGroups: [],
    minConfidence: 0.55,
    cooldownMs: 3 * 60 * 1000,
    tools: ["getCustomer", "getRecentOrder", "getOrders", "getTracking"],
    resolveAfter: true,
    replyInstructions: `You are a friendly ecommerce support agent.

Reply about delivery / shipping progress using ONLY the tool JSON.
Rules:
- Be warm and concise (under ~90 words). Plain text for chat.
- Use order status, dates, and tracking number/url only if present in the data.
- Never invent tracking numbers or promise delivery dates not in the data.
- Never say you updated shipping or contacted the carrier — read-only only.`,
  },
  {
    key: "payment_status",
    featureFlag: "skill_payment_status",
    name: "Payment status",
    description:
      "When intent is order/payment: read recent orders, LLM reply, send, resolve.",
    intents: ["order/payment"],
    intentGroups: [],
    minConfidence: 0.55,
    cooldownMs: 3 * 60 * 1000,
    tools: ["getCustomer", "getRecentOrder", "getOrders"],
    resolveAfter: true,
    replyInstructions: `You are a friendly ecommerce support agent.

Explain payment / order confirmation status using ONLY the tool JSON (order status, amount, currency, date).
Rules:
- Keep it under ~90 words, warm, plain text.
- Do not invent card last-4, UPI ids, or gateway references.
- Never capture or change payment — if they ask for that, say a human teammate will help.
- If no orders, apologize and offer human help.`,
  },
  {
    key: "product_info",
    featureFlag: "skill_product_info",
    name: "Product info",
    description:
      "When intent is pre_purchase/product or availability: read catalog, LLM reply, resolve.",
    intents: ["pre_purchase/product", "pre_purchase/availability"],
    intentGroups: [],
    minConfidence: 0.55,
    cooldownMs: 3 * 60 * 1000,
    tools: ["getProducts"],
    resolveAfter: true,
    replyInstructions: `You are a friendly ecommerce support agent answering a product or stock question.

Use ONLY getProducts results. Mention titles, prices, and availability/stock if present. Under ~100 words, plain text.
If no products match, say so and offer human help — do not invent SKUs or stock.
Read-only — never place an order or change inventory.`,
  },
  {
    key: "product_suggestions",
    featureFlag: "skill_product_suggestions",
    name: "Product suggestions",
    description:
      "When intent is pre_purchase/suggestions: recommend products with image + price cards, then resolve.",
    intents: ["pre_purchase/suggestions"],
    intentGroups: [],
    minConfidence: 0.5,
    cooldownMs: 3 * 60 * 1000,
    tools: ["getProducts"],
    resolveAfter: true,
    sendProductCards: true,
    fallbackReply: "Here are a few options you might like:",
    replyInstructions: `You are a friendly ecommerce support agent recommending products.

Write ONE short intro line (under 20 words) for product suggestions. Plain text.
Do not list products yourself — cards with images are sent separately.
If no products in the data, apologize and offer human help.`,
  },
];

export function getPremadeSkill(key: string): PremadeSkill | undefined {
  return PREMADE_SKILLS.find((s) => s.key === key);
}
