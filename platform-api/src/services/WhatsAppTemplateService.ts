import { prisma } from "../config/db.js";
import type { Prisma } from "../generated/client/index.js";
import type { WhatsAppChannelConfig } from "../adapters/shared/types.js";

/** Map Meta error codes/messages to human-readable copy. */
function mapMetaError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
        error_user_title?: string;
        error_user_msg?: string;
      };
    };
    const e = parsed?.error;
    if (!e) return raw;
    return (
      e.error_user_msg ||
      e.error_user_title ||
      e.message ||
      raw
    );
  } catch {
    return raw;
  }
}

/** Meta expects locale codes (e.g. en_US); we accept short codes in the UI. */
function toMetaLanguageCode(lang: string): string {
  const code = lang.trim().toLowerCase();
  const map: Record<string, string> = {
    en: "en_US",
    hi: "hi_IN",
  };
  return map[code] || lang;
}

function languageMatches(a: string, b: string): boolean {
  if (a === b) return true;
  const base = (v: string) => v.split("_")[0]?.toLowerCase();
  return base(a) === base(b);
}

function templateKey(name: string, language: string): string {
  return `${name}::${toMetaLanguageCode(language)}`;
}

async function metaFetch(
  config: WhatsAppChannelConfig,
  url: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
}

export class WhatsAppTemplateService {
  private static async getWAConfig(): Promise<WhatsAppChannelConfig> {
    const config = await prisma.channelConfig.findFirst({
      where: { channelType: "whatsapp", enabled: true },
    });
    if (!config) throw new Error("WhatsApp channel not configured");
    return config.channelConfig as unknown as WhatsAppChannelConfig;
  }

  private static async verifyMetaTemplate(
    config: WhatsAppChannelConfig,
    metaTemplateId: string
  ): Promise<{ id: string; status: string; name: string; language: string }> {
    const response = await metaFetch(
      config,
      `https://graph.facebook.com/v21.0/${metaTemplateId}?fields=id,name,status,language`
    );
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Meta template verification failed: ${mapMetaError(err)}`);
    }
    const data = (await response.json()) as {
      id?: string;
      status?: string;
      name?: string;
      language?: string;
    };
    if (!data.id) {
      throw new Error("Meta template verification failed: template not found");
    }
    return {
      id: String(data.id),
      status: data.status || "PENDING",
      name: data.name || "",
      language: data.language || "",
    };
  }

  private static async findLocalByMetaTemplate(
    name: string,
    language: string
  ) {
    const candidates = await prisma.whatsAppTemplate.findMany({
      where: { name },
    });
    return candidates.find((t) => languageMatches(t.language, language)) ?? null;
  }

  static async syncTemplatesFromMeta(): Promise<{
    templates: Awaited<ReturnType<typeof prisma.whatsAppTemplate.findMany>>;
    removedOrphans: string[];
  }> {
    const config = await this.getWAConfig();
    if (!config.businessAccountId)
      throw new Error("WhatsApp Business Account ID not configured");
    if (!config.accessToken)
      throw new Error("WhatsApp access token not configured");

    const response = await metaFetch(
      config,
      `https://graph.facebook.com/v21.0/${config.businessAccountId}/message_templates?limit=100&fields=id,name,language,category,status,components,quality_score,rejected_reason`
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Meta API Error:", err);
      throw new Error(`Failed to fetch templates from Meta: ${mapMetaError(err)}`);
    }

    const metaTemplates: any[] = [];
    let page = (await response.json()) as {
      data?: any[];
      paging?: { next?: string };
    };
    metaTemplates.push(...(page.data || []));

    while (page.paging?.next) {
      const nextResponse = await metaFetch(config, page.paging.next);
      if (!nextResponse.ok) {
        const err = await nextResponse.text();
        console.error("Meta API pagination error:", err);
        break;
      }
      page = await nextResponse.json();
      metaTemplates.push(...(page.data || []));
    }

    const metaKeys = new Set(
      metaTemplates.map((tpl) => templateKey(tpl.name, tpl.language))
    );
    const metaIds = new Set(metaTemplates.map((tpl) => String(tpl.id)));

    for (const tpl of metaTemplates) {
      const existing = await this.findLocalByMetaTemplate(tpl.name, tpl.language);

      const sharedData = {
        status: tpl.status,
        metaCategory: tpl.category,
        metaTemplateId: String(tpl.id || ""),
        wabaId: config.businessAccountId,
        components: tpl.components as Prisma.InputJsonValue,
        rejectionReason: tpl.rejected_reason || null,
        qualityScore: tpl.quality_score
          ? typeof tpl.quality_score === "string"
            ? tpl.quality_score
            : tpl.quality_score?.score || null
          : null,
        lastSyncedAt: new Date(),
      };

      if (existing) {
        await prisma.whatsAppTemplate.update({
          where: { id: existing.id },
          data: {
            ...sharedData,
            language: tpl.language,
          },
        });
      } else {
        await prisma.whatsAppTemplate.create({
          data: {
            name: tpl.name,
            language: tpl.language,
            internalCategory: tpl.category,
            ...sharedData,
          },
        });
      }
    }

    const removedOrphans: string[] = [];
    const localTemplates = await prisma.whatsAppTemplate.findMany();
    for (const local of localTemplates) {
      const inMetaById =
        Boolean(local.metaTemplateId) && metaIds.has(local.metaTemplateId!);
      const inMetaByName = metaKeys.has(templateKey(local.name, local.language));
      if (!inMetaById && !inMetaByName) {
        await prisma.whatsAppTemplate.delete({ where: { id: local.id } });
        removedOrphans.push(local.name);
      }
    }

    const templates = await prisma.whatsAppTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { templates, removedOrphans };
  }

  static async syncSingleTemplate(id: string) {
    const template = await prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) throw new Error("Template not found");

    const config = await this.getWAConfig();
    if (!config.businessAccountId)
      throw new Error("WhatsApp Business Account ID not configured");
    if (!config.accessToken)
      throw new Error("WhatsApp access token not configured");

    const metaId = template.metaTemplateId;
    let url: string;

    if (metaId) {
      url = `https://graph.facebook.com/v21.0/${metaId}?fields=id,name,language,category,status,components,quality_score,rejected_reason`;
    } else {
      url = `https://graph.facebook.com/v21.0/${config.businessAccountId}/message_templates?name=${encodeURIComponent(template.name)}&fields=id,name,language,category,status,components,quality_score,rejected_reason`;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to sync template: ${mapMetaError(err)}`);
    }

    const data = await response.json();
    const tpl = metaId ? data : (data.data?.[0] ?? null);
    if (!tpl) {
      await prisma.whatsAppTemplate.delete({ where: { id } });
      throw new Error("Template not found in Meta — removed local copy");
    }

    return prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        status: tpl.status,
        metaCategory: tpl.category,
        metaTemplateId: String(tpl.id || ""),
        wabaId: config.businessAccountId,
        components: tpl.components as Prisma.InputJsonValue,
        rejectionReason: tpl.rejected_reason || null,
        qualityScore: tpl.quality_score
          ? typeof tpl.quality_score === "string"
            ? tpl.quality_score
            : tpl.quality_score?.score || null
          : null,
        lastSyncedAt: new Date(),
      },
    });
  }

  static async listTemplates() {
    return prisma.whatsAppTemplate.findMany({ orderBy: { createdAt: "desc" } });
  }

  static async getTemplate(id: string) {
    return prisma.whatsAppTemplate.findUnique({ where: { id } });
  }

  static async createTemplate(data: {
    name: string;
    language: string;
    internalCategory: string;
    metaCategory: string;
    components: any[];
  }) {
    if (!data.name || !data.language || !data.components) {
      throw new Error("Missing required template fields");
    }

    // Validate name format
    if (!/^[a-z0-9_]+$/.test(data.name)) {
      throw new Error(
        "Template name must be lowercase letters, numbers, and underscores only"
      );
    }

    const config = await this.getWAConfig();
    if (!config.businessAccountId)
      throw new Error("WhatsApp Business Account ID not configured");
    if (!config.accessToken)
      throw new Error("WhatsApp access token not configured");

    const metaLanguage = toMetaLanguageCode(data.language);

    const payload = {
      name: data.name,
      language: metaLanguage,
      category: data.metaCategory,
      components: data.components,
    };

    const response = await metaFetch(
      config,
      `https://graph.facebook.com/v21.0/${config.businessAccountId}/message_templates`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Meta API Error on Create:", err);
      throw new Error(`Failed to create template: ${mapMetaError(err)}`);
    }

    const metaRes = (await response.json()) as {
      id?: string;
      status?: string;
    };

    if (!metaRes.id) {
      throw new Error(
        "Meta did not return a template ID. Check payment setup and permissions in Meta Business Manager."
      );
    }

    const verified = await this.verifyMetaTemplate(config, String(metaRes.id));

    return prisma.whatsAppTemplate.create({
      data: {
        name: data.name,
        language: verified.language || metaLanguage,
        internalCategory: data.internalCategory,
        metaCategory: data.metaCategory,
        components: data.components as Prisma.InputJsonValue,
        status: (verified.status as any) || (metaRes.status as any) || "PENDING",
        metaTemplateId: verified.id,
        wabaId: config.businessAccountId,
        lastSyncedAt: new Date(),
      },
    });
  }

  static async updateTemplate(
    id: string,
    data: {
      components?: any[];
      internalCategory?: string;
    }
  ) {
    const template = await prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) throw new Error("Template not found");

    // If it's approved, we cannot edit Meta components, but we CAN edit our internalCategory.
    if (template.status === "APPROVED" && data.components) {
      throw new Error(
        "Approved templates cannot have their content edited. Duplicate it to create a new version."
      );
    }

    // For PENDING templates, Meta supports updating components
    if (data.components && template.metaTemplateId) {
      const config = await this.getWAConfig();
      if (!config.businessAccountId || !config.accessToken) {
        throw new Error("WhatsApp not configured");
      }

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${template.metaTemplateId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ components: data.components }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to update template at Meta: ${mapMetaError(err)}`);
      }
    }

    return prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        ...(data.components
          ? { components: data.components as Prisma.InputJsonValue }
          : {}),
        ...(data.internalCategory
          ? { internalCategory: data.internalCategory }
          : {}),
      },
    });
  }

  static async deleteTemplate(id: string) {
    const template = await prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) throw new Error("Template not found");

    const config = await this.getWAConfig();
    if (!config.businessAccountId)
      throw new Error("WhatsApp Business Account ID not configured");
    if (!config.accessToken)
      throw new Error("WhatsApp access token not configured");

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.businessAccountId}/message_templates?name=${encodeURIComponent(template.name)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.accessToken}` },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Meta API Error on Delete:", err);
      // Still delete locally even if Meta delete fails (template might already be gone)
      console.warn("Meta delete failed, removing from local DB anyway:", err);
    }

    return prisma.whatsAppTemplate.delete({ where: { id } });
  }

  /**
   * Fetch template analytics from Meta's WABA template_analytics endpoint.
   * Returns last-30-day aggregated sent/delivered/read totals.
   * Returns null if the WABA is not configured or Meta doesn't have data.
   */
  static async getTemplateAnalytics(id: string): Promise<{
    sent: number;
    delivered: number;
    read: number;
    period: { start: string; end: string };
    available: boolean;
    message?: string;
  }> {
    const template = await prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) throw new Error("Template not found");

    const usageCount = await this.getTemplateUsageCount(template.name);

    if (!template.metaTemplateId) {
      return {
        sent: 0,
        delivered: 0,
        read: 0,
        period: { start: "", end: "" },
        available: false,
        message: "Template has no Meta ID — sync first to populate analytics.",
        usageCount,
      } as any;
    }

    let config: WhatsAppChannelConfig | null = null;
    try {
      config = await this.getWAConfig();
    } catch {
      return {
        sent: 0,
        delivered: 0,
        read: 0,
        period: { start: "", end: "" },
        available: false,
        message: "WhatsApp not configured.",
        usageCount,
      } as any;
    }

    if (!config?.businessAccountId || !config?.accessToken) {
      return {
        sent: 0,
        delivered: 0,
        read: 0,
        period: { start: "", end: "" },
        available: false,
        message: "WhatsApp not configured.",
        usageCount,
      } as any;
    }

    // 30-day window
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - 30 * 24 * 3600;

    const url = new URL(
      `https://graph.facebook.com/v21.0/${config.businessAccountId}/template_analytics`
    );
    url.searchParams.set("start", String(startTs));
    url.searchParams.set("end", String(endTs));
    url.searchParams.set("granularity", "DAILY");
    url.searchParams.set("metric_types", "sent,delivered,read");
    // Pass the specific template id
    url.searchParams.set("template_ids", JSON.stringify([template.metaTemplateId]));

    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn("[analytics] Meta API non-OK:", errText);
        return {
          sent: 0,
          delivered: 0,
          read: 0,
          period: {
            start: new Date(startTs * 1000).toISOString(),
            end: new Date(endTs * 1000).toISOString(),
          },
          available: false,
          message: "Meta Analytics API returned an error. The token may need whatsapp_business_management permission, or analytics may not be enabled for this WABA.",
          usageCount,
        } as any;
      }

      const json = await res.json() as {
        data?: Array<{
          template_id: string;
          data_points: Array<{
            start: number;
            end: number;
            sent: number;
            delivered: number;
            read: number;
          }>;
        }>;
      };

      const tplData = json.data?.find((d) => d.template_id === template.metaTemplateId);
      if (!tplData || !tplData.data_points?.length) {
        return {
          sent: 0,
          delivered: 0,
          read: 0,
          period: {
            start: new Date(startTs * 1000).toISOString(),
            end: new Date(endTs * 1000).toISOString(),
          },
          available: true,
          message: "No data for this template in the last 30 days.",
          usageCount,
        } as any;
      }

      // Sum across all daily data points
      let sent = 0, delivered = 0, read = 0;
      for (const dp of tplData.data_points) {
        sent += dp.sent ?? 0;
        delivered += dp.delivered ?? 0;
        read += dp.read ?? 0;
      }

      return {
        sent,
        delivered,
        read,
        period: {
          start: new Date(startTs * 1000).toISOString(),
          end: new Date(endTs * 1000).toISOString(),
        },
        available: true,
        usageCount,
      } as any;
    } catch (err) {
      console.error("[analytics] fetch error:", err);
      return {
        sent: 0,
        delivered: 0,
        read: 0,
        period: { start: "", end: "" },
        available: false,
        message: "Failed to reach Meta analytics API.",
        usageCount,
      } as any;
    }
  }

  /**
   * Count how many times this template was sent from the inbox
   * by searching messages with contentType=template and matching name.
   */
  static async getTemplateUsageCount(templateName: string): Promise<number> {
    return prisma.message.count({
      where: {
        contentType: "template",
        direction: "outgoing",
        content: { contains: `[WhatsApp Template: ${templateName}]` },
      },
    });
  }
}
