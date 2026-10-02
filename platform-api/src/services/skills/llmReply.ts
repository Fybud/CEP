import { resolveLlmConfig } from "./LlmConfigService.js";
import type { PremadeSkill, SkillContext } from "./types.js";
import type { GatheredToolData } from "./tools.js";

/**
 * Single-shot LLM call: skill reply instructions + tool JSON + customer message.
 */
export async function generateHumanizedReply(input: {
  skill: PremadeSkill;
  ctx: SkillContext;
  toolData: GatheredToolData;
}): Promise<string | null> {
  const cfg = await resolveLlmConfig();
  if (!cfg.configured) {
    console.warn("[skills:llm] no API key configured (llm_config or OPENAI_API_KEY)");
    return null;
  }

  const {
    getCustomer,
    getRecentOrder,
    getOrders,
    getInvoice,
    getTracking,
    getProducts,
  } = input.toolData;
  const payload = {
    customerMessage: input.ctx.content,
    channel: input.ctx.channelType,
    intent: input.ctx.classify.intent,
    tools: {
      getCustomer,
      getRecentOrder,
      getOrders,
      getInvoice,
      getTracking,
      getProducts,
    },
  };

  const url = `${cfg.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      ...(cfg.provider === "azure_openai"
        ? { "api-key": cfg.apiKey }
        : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.55,
      messages: [
        { role: "system", content: input.skill.replyInstructions },
        {
          role: "user",
          content: `Use this data to reply:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn("[skills:llm] error:", res.status, errText.slice(0, 240));
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const body = (data.choices?.[0]?.message?.content ?? "").trim();
  return body || null;
}
