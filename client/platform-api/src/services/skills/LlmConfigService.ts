import { prisma } from "../../config/db.js";
import { SECRET_PLACEHOLDER } from "../SecretRedaction.js";
import { env } from "../../config/env.js";

export type LlmProvider = "openai" | "azure_openai" | "custom";

export type ResolvedLlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean;
};

function asProvider(value: string): LlmProvider {
  if (value === "azure_openai" || value === "custom") return value;
  return "openai";
}

function defaultBaseUrl(provider: LlmProvider): string {
  if (provider === "openai") return "https://api.openai.com/v1";
  return "";
}

/** Public shape for admin UI (api key redacted). */
export function shapeLlmConfig(row: {
  id: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  updatedAt: Date;
}) {
  const hasKey = Boolean(row.apiKey?.trim());
  return {
    id: row.id,
    provider: asProvider(row.provider),
    apiKey: hasKey ? SECRET_PLACEHOLDER : "",
    hasApiKey: hasKey,
    baseUrl: row.baseUrl || "",
    model: row.model || "gpt-4o-mini",
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureLlmConfigRow() {
  return (
    (await prisma.llmConfig.findUnique({ where: { id: "llm_default" } })) ??
    (await prisma.llmConfig.create({ data: { id: "llm_default" } }))
  );
}

export async function getLlmConfigPublic() {
  const row = await ensureLlmConfigRow();
  return shapeLlmConfig(row);
}

export async function updateLlmConfig(input: {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  clearKey?: boolean;
}) {
  await ensureLlmConfigRow();
  const nextKey =
    typeof input.apiKey === "string" ? input.apiKey.trim() : undefined;
  const keepKey =
    !input.clearKey &&
    (nextKey === undefined || nextKey === "" || nextKey === SECRET_PLACEHOLDER);

  const row = await prisma.llmConfig.update({
    where: { id: "llm_default" },
    data: {
      ...(input.provider !== undefined
        ? { provider: asProvider(input.provider) }
        : {}),
      ...(!keepKey || input.clearKey
        ? { apiKey: input.clearKey ? "" : (nextKey ?? "") }
        : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl.trim() } : {}),
      ...(input.model !== undefined ? { model: input.model.trim() || "gpt-4o-mini" } : {}),
    },
  });
  return shapeLlmConfig(row);
}

/**
 * Resolve credentials for outbound LLM calls.
 * Prefers tenant DB config; falls back to process env for local/dev.
 */
export async function resolveLlmConfig(): Promise<ResolvedLlmConfig> {
  const row = await ensureLlmConfigRow();
  const provider = asProvider(row.provider);
  const dbKey = row.apiKey?.trim() || "";
  const envKey = env.openaiApiKey?.trim() || "";
  const apiKey = dbKey || envKey;
  const baseUrl =
    row.baseUrl?.trim() ||
    defaultBaseUrl(provider) ||
    "https://api.openai.com/v1";
  const model = row.model?.trim() || env.openaiModel || "gpt-4o-mini";
  return {
    provider,
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    configured: Boolean(apiKey),
  };
}
