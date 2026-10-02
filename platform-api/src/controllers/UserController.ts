import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { ulid } from "ulid";

type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";

/** Roles the actor may create */
function allowedRolesToCreate(actorRole: Role): Role[] {
  switch (actorRole) {
    case "SUPER_ADMIN":
      return ["SUPER_ADMIN", "ADMIN", "MANAGER", "AGENT"];
    case "ADMIN":
      // Admins cannot create Super Admins or Admins
      return ["MANAGER", "AGENT"];
    case "MANAGER":
      return ["AGENT"];
    default:
      return [];
  }
}

/** Whether actor can manage (edit / deactivate / delete) the target */
function canManageUser(
  actorRole: Role,
  targetRole: Role,
  actorId: string,
  targetId: string,
  actorTeamId?: string | null,
  targetTeamId?: string | null,
): boolean {
  if (actorId === targetId) return false;

  if (actorRole === "SUPER_ADMIN") return true;

  if (actorRole === "ADMIN") {
    // Admins cannot manage Super Admins or other Admins
    return targetRole === "MANAGER" || targetRole === "AGENT";
  }

  if (actorRole === "MANAGER") {
    // Managers only manage Agents on their own team
    return (
      targetRole === "AGENT" &&
      !!actorTeamId &&
      targetTeamId === actorTeamId
    );
  }

  return false;
}

function selectUser() {
  return {
    id: true,
    username: true,
    name: true,
    role: true,
    isActive: true,
    teamId: true,
    team: { select: { name: true } },
    createdAt: true,
  } as const;
}

export class UserController {
  static async listUsers(request: FastifyRequest, reply: FastifyReply) {
    const actorRole = (request.user as any)?.role as Role;
    const actorTeamId = (request.user as any)?.teamId as string | null | undefined;

    const where =
      actorRole === "SUPER_ADMIN"
        ? {}
        : actorRole === "ADMIN"
          ? { role: { in: ["MANAGER", "AGENT"] as Role[] } }
          : actorRole === "MANAGER"
            ? {
                OR: [
                  {
                    role: "AGENT" as Role,
                    teamId: actorTeamId ?? "__none__",
                  },
                  { role: { in: ["MANAGER", "ADMIN", "SUPER_ADMIN"] as Role[] } },
                ],
              }
            : // Agents need Manager/Admin list for escalation targets
              {
                role: { in: ["MANAGER", "ADMIN", "SUPER_ADMIN"] as Role[] },
                isActive: true,
              };

    const users = await prisma.user.findMany({
      where: where as any,
      orderBy: { createdAt: "asc" },
      select: selectUser(),
    });
    return reply.send(users);
  }

  static async createUser(
    request: FastifyRequest<{ Body: { email: string; name?: string; role: Role; teamId?: string } }>,
    reply: FastifyReply,
  ) {
    const actorRole = (request.user as any)?.role as Role;
    const actorId = (request.user as any)?.id as string;
    const actorTeamId = (request.user as any)?.teamId as string | null | undefined;
    const { email, name, role, teamId } = request.body ?? {};

    if (!email || !role) return reply.code(400).send({ error: "email and role are required" });

    const allowed = allowedRolesToCreate(actorRole);
    if (!allowed.includes(role)) {
      return reply.code(403).send({
        error: `Your role (${actorRole}) cannot create users with role ${role}`,
      });
    }

    // Managers can only create agents on their own team
    let resolvedTeamId = teamId ?? null;
    if (actorRole === "MANAGER") {
      if (!actorTeamId) {
        return reply.code(400).send({ error: "Manager has no team assigned" });
      }
      resolvedTeamId = actorTeamId;
    }

    // Admins/Super Admins: no team for ADMIN / SUPER_ADMIN roles
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      resolvedTeamId = null;
    }

    const existing = await prisma.user.findUnique({ where: { username: email.trim().toLowerCase() } });
    if (existing) return reply.code(400).send({ error: "A user with this email already exists" });

    try {
      const user = await prisma.user.create({
        data: {
          id: ulid(),
          username: email.trim().toLowerCase(),
          name: name?.trim(),
          role: role as any,
          teamId: resolvedTeamId,
          createdById: actorId,
        },
        select: selectUser(),
      });
      return reply.code(201).send(user);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to create user", details: err.message });
    }
  }

  static async updateUser(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; role?: Role; teamId?: string; isActive?: boolean };
    }>,
    reply: FastifyReply,
  ) {
    const actorRole = (request.user as any)?.role as Role;
    const actorId = (request.user as any)?.id as string;
    const actorTeamId = (request.user as any)?.teamId as string | null | undefined;
    const { id } = request.params;
    const { name, role, teamId, isActive } = request.body ?? {};

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: "user not found" });

    if (
      !canManageUser(
        actorRole,
        target.role as Role,
        actorId,
        id,
        actorTeamId,
        target.teamId,
      )
    ) {
      return reply.code(403).send({ error: "You do not have permission to manage this user" });
    }

    if (role) {
      const allowed = allowedRolesToCreate(actorRole);
      if (!allowed.includes(role)) {
        return reply.code(403).send({ error: `Cannot assign role ${role}` });
      }
    }

    // Managers cannot move agents off their team
    let nextTeamId = teamId !== undefined ? teamId || null : undefined;
    if (actorRole === "MANAGER") {
      nextTeamId = actorTeamId ?? null;
    }
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      nextTeamId = null;
    }

    try {
      const updated = await prisma.user.update({
        where: { id },
        data: {
          name: name !== undefined ? name?.trim() : undefined,
          role: (role as any) ?? undefined,
          teamId: nextTeamId,
          isActive: isActive !== undefined ? isActive : undefined,
        },
        select: selectUser(),
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to update user", details: err.message });
    }
  }

  static async deleteUser(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const actorRole = (request.user as any)?.role as Role;
    const actorId = (request.user as any)?.id as string;
    const actorTeamId = (request.user as any)?.teamId as string | null | undefined;
    const { id } = request.params;

    if (id === actorId) {
      return reply.code(400).send({ error: "You cannot delete your own account" });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: "user not found" });

    if (
      !canManageUser(
        actorRole,
        target.role as Role,
        actorId,
        id,
        actorTeamId,
        target.teamId,
      )
    ) {
      return reply.code(403).send({ error: "You do not have permission to delete this user" });
    }

    try {
      await prisma.$transaction([
        prisma.ticketNote.deleteMany({ where: { authorId: id } }),
        prisma.ticket.updateMany({ where: { assignedTo: id }, data: { assignedTo: null } }),
        prisma.ticket.updateMany({ where: { createdBy: id }, data: { createdBy: null } }),
        prisma.team.updateMany({ where: { managerId: id }, data: { managerId: null } }),
        prisma.user.delete({ where: { id } }),
      ]);
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.code(400).send({
        error: "failed to delete user",
        details: err.message,
      });
    }
  }
}
