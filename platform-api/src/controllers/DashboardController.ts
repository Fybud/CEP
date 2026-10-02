import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export class DashboardController {
  static async getMetrics(
    _request: FastifyRequest<{ Querystring: { accountId?: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const now = Date.now();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000);

      const [
        totalMessages,
        activeContacts,
        recentMessages,
        byChannel,
        ticketsByStatusRows,
        unassignedTickets,
        ticketsByTeamRows,
        unresolvedCustomers,
      ] = await Promise.all([
        prisma.message.count(),
        prisma.customer.count({ where: { resolved: false } }),
        prisma.message.findMany({
          orderBy: { createdAt: "desc" },
          take: 40,
        }),
        prisma.message.groupBy({
          by: ["channelType"],
          _count: { _all: true },
        }),
        prisma.ticket.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.ticket.count({
          where: {
            assignedTo: null,
            status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] },
          },
        }),
        prisma.ticket.groupBy({
          by: ["teamId"],
          where: { teamId: { not: null } },
          _count: { _all: true },
        }),
        prisma.customer
          .findMany({
            where: { resolved: false },
            select: {
              id: true,
              name: true,
              whatsappIdentities: {
                select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
              },
              instagramIdentities: {
                select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
              },
              facebookIdentities: {
                select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
              },
              emailIdentities: {
                select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
              },
              webChatIdentities: {
                select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
              },
            },
            take: 500,
          })
          .catch(async (err) => {
            if (!String(err?.message || "").includes("web_chat_channel")) throw err;
            return prisma.customer.findMany({
              where: { resolved: false },
              select: {
                id: true,
                name: true,
                whatsappIdentities: {
                  select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
                },
                instagramIdentities: {
                  select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
                },
                facebookIdentities: {
                  select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
                },
                emailIdentities: {
                  select: { lastCustomerMessageAt: true, lastMessageAt: true, resolved: true },
                },
              },
              take: 500,
            });
          }),
      ]);

      // Dedupe recent activity by customer+channel
      const seen = new Set<string>();
      const recentUnique = [];
      for (const m of recentMessages) {
        const key = `${m.customerId}:${m.channelType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        recentUnique.push(m);
        if (recentUnique.length >= 8) break;
      }

      const customerIds = [...new Set(recentUnique.map((m) => m.customerId))];
      const customers = await prisma.customer
        .findMany({
          where: { id: { in: customerIds } },
          include: {
            whatsappIdentities: true,
            instagramIdentities: true,
            emailIdentities: true,
            facebookIdentities: true,
            webChatIdentities: true,
          },
        })
        .catch(async (err) => {
          if (!String(err?.message || "").includes("web_chat_channel")) throw err;
          return prisma.customer.findMany({
            where: { id: { in: customerIds } },
            include: {
              whatsappIdentities: true,
              instagramIdentities: true,
              emailIdentities: true,
              facebookIdentities: true,
            },
          });
        });
      const byId = new Map(customers.map((c) => [c.id, c]));

      const recentActivity = recentUnique.map((m) => {
        const c = byId.get(m.customerId);
        const name =
          c?.name ||
          c?.whatsappIdentities[0]?.externalId ||
          c?.emailIdentities[0]?.externalId ||
          c?.instagramIdentities[0]?.externalId ||
          "Unknown";
        return {
          id: `${m.customerId}:${m.channelType}:${m.id}`,
          contactName: name,
          initials: initialsFrom(name),
          preview: (m.content || "").slice(0, 120) || "Attachment",
          timestamp: m.createdAt.toISOString(),
          channelType: m.channelType,
        };
      });

      const channelDistribution = byChannel.reduce(
        (acc: Record<string, number>, row) => {
          acc[row.channelType] = row._count._all;
          return acc;
        },
        {} as Record<string, number>,
      );

      const ticketsByStatus = ticketsByStatusRows.reduce(
        (acc: Record<string, number>, row) => {
          acc[row.status] = row._count._all;
          return acc;
        },
        {} as Record<string, number>,
      );

      const teamIds = ticketsByTeamRows
        .map((r) => r.teamId)
        .filter((id): id is string => Boolean(id));
      const teams = teamIds.length
        ? await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
        : [];
      const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
      const ticketsByTeam = ticketsByTeamRows
        .filter((r) => r.teamId)
        .map((r) => ({
          teamName: teamNameById.get(r.teamId!) || "Unknown team",
          count: r._count._all,
        }))
        .sort((a, b) => b.count - a.count);

      // Aging: unresolved identities with last customer message older than 24h
      type AgingSample = {
        conversationId: string;
        contactName: string;
        channelType: string;
        ageHours: number;
      };
      const agingSamples: AgingSample[] = [];
      let over24h = 0;
      let over48h = 0;

      for (const c of unresolvedCustomers) {
        const channels: Array<{
          type: string;
          last: Date | null;
          resolved: boolean;
        }> = [
          ...c.whatsappIdentities.map((i) => ({
            type: "whatsapp",
            last: i.lastCustomerMessageAt ?? i.lastMessageAt,
            resolved: i.resolved,
          })),
          ...c.instagramIdentities.map((i) => ({
            type: "instagram",
            last: i.lastCustomerMessageAt ?? i.lastMessageAt,
            resolved: i.resolved,
          })),
          ...c.facebookIdentities.map((i) => ({
            type: "facebook",
            last: i.lastCustomerMessageAt ?? i.lastMessageAt,
            resolved: i.resolved,
          })),
          ...c.emailIdentities.map((i) => ({
            type: "email",
            last: i.lastCustomerMessageAt ?? i.lastMessageAt,
            resolved: i.resolved,
          })),
          ...((c as any).webChatIdentities ?? []).map((i: any) => ({
            type: "web_chat",
            last: i.lastCustomerMessageAt ?? i.lastMessageAt,
            resolved: i.resolved,
          })),
        ];

        for (const ch of channels) {
          if (ch.resolved || !ch.last) continue;
          if (ch.last > dayAgo) continue;
          const ageHours = Math.max(1, Math.round((now - ch.last.getTime()) / 36e5));
          if (ch.last <= twoDaysAgo) over48h += 1;
          else over24h += 1;
          // Full list so the client can filter by feature-enabled + connected channels.
          agingSamples.push({
            conversationId: `${c.id}:${ch.type}`,
            contactName: c.name || "Unknown",
            channelType: ch.type,
            ageHours,
          });
        }
      }

      agingSamples.sort((a, b) => b.ageHours - a.ageHours);

      return reply.send({
        totalMessages,
        activeContacts,
        openConversations: unresolvedCustomers.length,
        pendingConversations: unresolvedCustomers.length,
        unassignedTickets,
        recentActivity,
        channelDistribution,
        ticketsByStatus,
        ticketsByTeam,
        agingConversations: {
          total: over24h + over48h,
          over24h,
          over48h,
          sample: agingSamples,
        },
      });
    } catch (err: any) {
      // web_chat_channel may be missing before migrate — retry without it
      if (String(err?.message || "").includes("web_chat_channel")) {
        return reply.code(503).send({
          error:
            "Database missing web_chat_channel table. Run: npx prisma migrate deploy",
        });
      }
      return reply.code(500).send({ error: err.message });
    }
  }
}
