import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";

interface ChannelHealthResult {
  channel: string;
  channelType: string;
  status: "ok" | "warning" | "error";
  message: string;
}

export class HealthController {
  static async checkChannelHealth(
    _request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      const channels = await prisma.channelConfig.findMany({
        where: { enabled: true },
      });

      const now = new Date();

      const results: ChannelHealthResult[] = channels.map((ch) => {
        const cfg = (ch.channelConfig ?? {}) as Record<string, unknown>;
        const updatedAt = new Date(ch.updatedAt);
        const ageMs = now.getTime() - updatedAt.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        switch (ch.channelType) {
          case "whatsapp": {
            const hasToken =
              Boolean(cfg["accessToken"]) || Boolean(cfg["phoneNumberId"]);
            if (!hasToken) {
              return {
                channel: ch.name,
                channelType: ch.channelType,
                status: "error" as const,
                message: `${ch.name}: Missing WhatsApp access token or phone number ID`,
              };
            }
            if (ageDays > 7) {
              return {
                channel: ch.name,
                channelType: ch.channelType,
                status: "warning" as const,
                message: `${ch.name}: WhatsApp config not updated in over 7 days`,
              };
            }
            return {
              channel: ch.name,
              channelType: ch.channelType,
              status: "ok" as const,
              message: `${ch.name}: WhatsApp is healthy`,
            };
          }

          case "instagram": {
            const hasToken = Boolean(cfg["accessToken"]);
            if (!hasToken) {
              return {
                channel: ch.name,
                channelType: ch.channelType,
                status: "error" as const,
                message: `${ch.name}: Missing Instagram access token`,
              };
            }
            if (ageDays >= 58) {
              return {
                channel: ch.name,
                channelType: ch.channelType,
                status: "error" as const,
                message: `${ch.name}: Instagram token has likely expired (${Math.floor(ageDays)} days old)`,
              };
            }
            if (ageDays >= 50) {
              return {
                channel: ch.name,
                channelType: ch.channelType,
                status: "warning" as const,
                message: `${ch.name}: Instagram token may be expiring soon (${Math.floor(ageDays)} days old)`,
              };
            }
            return {
              channel: ch.name,
              channelType: ch.channelType,
              status: "ok" as const,
              message: `${ch.name}: Instagram is healthy`,
            };
          }

          case "email": {
            const hasCredentials =
              Boolean(cfg["accessToken"]) || Boolean(cfg["refreshToken"]);
            if (!hasCredentials) {
              return {
                channel: ch.name,
                channelType: ch.channelType,
                status: "error" as const,
                message: `${ch.name}: Missing Gmail access or refresh token`,
              };
            }

            // Check Gmail watch expiry
            const watchExpiryRaw =
              cfg["watchExpiry"] ?? cfg["gmailWatchExpiry"];
            if (watchExpiryRaw) {
              const watchExpiry = new Date(watchExpiryRaw as string | number);
              const msUntilExpiry = watchExpiry.getTime() - now.getTime();
              const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

              if (msUntilExpiry <= 0) {
                return {
                  channel: ch.name,
                  channelType: ch.channelType,
                  status: "warning" as const,
                  message: `${ch.name}: Gmail watch has expired and needs renewal`,
                };
              }
              if (msUntilExpiry <= twoDaysMs) {
                return {
                  channel: ch.name,
                  channelType: ch.channelType,
                  status: "warning" as const,
                  message: `${ch.name}: Gmail watch expires within 2 days`,
                };
              }
            }

            return {
              channel: ch.name,
              channelType: ch.channelType,
              status: "ok" as const,
              message: `${ch.name}: Email is healthy`,
            };
          }

          default:
            return {
              channel: ch.name,
              channelType: ch.channelType,
              status: "ok" as const,
              message: `${ch.name}: Channel is healthy`,
            };
        }
      });

      return reply.send(results);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
