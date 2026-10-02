import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { ulid } from "ulid";

type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";

export class TeamController {
  static async createTeam(
    request: FastifyRequest<{ Body: { name: string; managerId?: string; parentTeamId?: string } }>,
    reply: FastifyReply,
  ) {
    const { name, managerId, parentTeamId } = request.body ?? {};
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }

    const userRole = (request.user as any)?.role as Role;
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return reply.code(403).send({ error: "Only admins can create teams" });
    }

    if (managerId) {
      const alreadyManaging = await prisma.team.findFirst({
        where: { managerId },
        select: { id: true, name: true },
      });
      if (alreadyManaging) {
        return reply.code(400).send({
          error: `This manager is already assigned to team "${alreadyManaging.name}". Each manager can only manage one team.`,
        });
      }
    }

    try {
      const team = await prisma.team.create({
        data: {
          id: ulid(),
          name,
          managerId: managerId || null,
          parentTeamId: parentTeamId || null,
        },
      });

      // Keep manager's user.teamId in sync so they appear as team members
      if (managerId) {
        await prisma.user.update({
          where: { id: managerId },
          data: { teamId: team.id },
        });
      }

      return reply.code(201).send(team);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to create team", details: err.message });
    }
  }

  static async listTeams(request: FastifyRequest, reply: FastifyReply) {
    const userRole = (request.user as any)?.role as Role | undefined;
    const teamId = (request.user as any)?.teamId as string | null | undefined;

    // Managers & Agents only see their own team; Admins see all
    const where =
      userRole === "MANAGER" || userRole === "AGENT"
        ? { id: teamId ?? "__none__" }
        : {};

    const teams = await prisma.team.findMany({
      where,
      include: {
        manager: { select: { id: true, username: true, name: true } },
        _count: { select: { members: true, tickets: true } },
      },
      orderBy: { name: "asc" },
    });
    return reply.send(teams);
  }

  static async getTeam(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const userRole = (request.user as any)?.role as Role | undefined;
    const actorTeamId = (request.user as any)?.teamId as string | null | undefined;

    if (userRole === "MANAGER" && id !== actorTeamId) {
      return reply.code(403).send({ error: "Managers can only view their own team" });
    }

    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, username: true, name: true, role: true, isActive: true } },
        members: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { members: true, tickets: true } },
      },
    });

    if (!team) return reply.code(404).send({ error: "team not found" });
    return reply.send(team);
  }

  static async updateTeam(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; managerId?: string; parentTeamId?: string };
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const { name, managerId, parentTeamId } = request.body ?? {};

    const userRole = (request.user as any)?.role as Role;
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return reply.code(403).send({ error: "Only admins can update teams" });
    }

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "team not found" });

    // One manager per team — cannot replace without clearing first
    if (managerId && existing.managerId && managerId !== existing.managerId) {
      return reply.code(400).send({
        error: "This team already has a manager. Clear the current manager before assigning another.",
      });
    }

    if (managerId) {
      const alreadyManaging = await prisma.team.findFirst({
        where: { managerId, NOT: { id } },
        select: { id: true, name: true },
      });
      if (alreadyManaging) {
        return reply.code(400).send({
          error: `This manager is already assigned to team "${alreadyManaging.name}". Each manager can only manage one team.`,
        });
      }
    }

    try {
      const team = await prisma.team.update({
        where: { id },
        data: {
          name,
          managerId: managerId !== undefined ? managerId || null : undefined,
          parentTeamId: parentTeamId !== undefined ? parentTeamId || null : undefined,
        },
      });

      if (managerId) {
        await prisma.user.update({
          where: { id: managerId },
          data: { teamId: id },
        });
      }

      return reply.send(team);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to update team", details: err.message });
    }
  }
}
