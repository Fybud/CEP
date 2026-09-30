import { prisma } from "../config/db.js";
import type { WhatsAppChannelConfig } from "../adapters/shared/types.js";

export interface TemplateQuotaResult {
  available: boolean;
  usedToday?: number;
  limitToday?: number;
  tier?: string;
  message?: string;
  metaBusinessSuiteUrl: string;
}

/**
 * WhatsApp Cloud API does NOT expose per-day template send quotas
 * via the Graph API for regular app tokens. The messaging limit tiers
 * (1K / 10K / 100K / unlimited) are determined by Meta internally based
 * on business verification status, but the current limit is not returned
 * by any public Graph API field.
 *
 * We attempt to fetch WABA-level metadata to provide whatever is available.
 */
export class WhatsAppQuotaService {
  static async getTemplateMessagingQuota(): Promise<TemplateQuotaResult> {
    const metaBusinessSuiteUrl =
      "https://business.facebook.com/wa/manage/message-templates/";

    let config: WhatsAppChannelConfig | null = null;
    try {
      const row = await prisma.channelConfig.findFirst({
        where: { channelType: "whatsapp", enabled: true },
      });
      if (row) {
        config = row.channelConfig as unknown as WhatsAppChannelConfig;
      }
    } catch {
      // DB error
    }

    if (!config?.businessAccountId || !config?.accessToken) {
      return {
        available: false,
        message: "WhatsApp is not configured. Add credentials in Settings.",
        metaBusinessSuiteUrl,
      };
    }

    try {
      // Attempt to fetch WABA messaging_limit_tier if exposed
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${config.businessAccountId}?fields=id,name,currency,message_template_namespace,account_review_status`,
        {
          headers: { Authorization: `Bearer ${config.accessToken}` },
        }
      );

      if (!res.ok) {
        return {
          available: false,
          message:
            "Usage details are not available via the API. Check Meta Business Manager for billing and limits.",
          metaBusinessSuiteUrl,
        };
      }

      const data = await res.json();

      // Meta does not expose usedToday / limitToday in any public Graph API field.
      // We return available=false with a helpful message pointing to Business Suite.
      return {
        available: false,
        tier: data.account_review_status || undefined,
        message:
          "Daily template send limits are managed by Meta and not exposed via the API. Check Meta Business Manager for current usage and limits.",
        metaBusinessSuiteUrl,
      };
    } catch {
      return {
        available: false,
        message:
          "Unable to reach Meta to fetch quota info. Check Meta Business Manager for limits.",
        metaBusinessSuiteUrl,
      };
    }
  }
}
