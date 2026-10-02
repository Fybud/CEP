import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { ulid } from "ulid";

type UserRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";

function getUser(request: FastifyRequest) {
  return request.user as { id: string; role: UserRole; teamId?: string | null } | undefined;
}

function isAdminOrAbove(role: UserRole) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Visibility rules:
 * - Admin+: everything
 * - Manager: own team + open pool (no team, unassigned) + tickets escalated to them
 * - Agent: assigned to me + unassigned on my team + open pool (no team, unassigned)
 *   Team-less agents only see their own + the open pool.
 */
function buildRbacWhere(role: UserRole, userId: string, teamId?: string | null) {
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return {};
  }
  if (role === "MANAGER") {
    return {
      OR: [
        ...(teamId ? [{ teamId }] : []),
        { teamId: null }, // open pool (any agent / manager can see)
        { escalatedToUserId: userId },
        ...(teamId ? [{ escalatedToTeamId: teamId }] : []),
      ],
    };
  }
  // AGENT
  return {
    OR: [
      { assignedTo: userId },
      ...(teamId ? [{ teamId, assignedTo: null }] : []),
      { teamId: null, assignedTo: null }, // open pool — any agent can claim
    ],
  };
}

/** Validate that the requesting user is allowed to view a specific ticket. */
function canViewTicket(
  role: UserRole,
  userId: string,
  teamId: string | null | undefined,
  ticket: {
    assignedTo: string | null;
    teamId: string | null;
    escalatedToUserId?: string | null;
    escalatedToTeamId?: string | null;
  },
): boolean {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (role === "MANAGER") {
    if (ticket.teamId === null) return true; // open pool
    if (teamId && ticket.teamId === teamId) return true;
    if (ticket.escalatedToUserId === userId) return true;
    if (teamId && ticket.escalatedToTeamId === teamId) return true;
    return false;
  }
  // AGENT: mine, my team queue, or open pool (no team + unassigned)
  if (ticket.assignedTo === userId) return true;
  if (ticket.assignedTo === null && ticket.teamId === null) return true;
  if (ticket.assignedTo === null && teamId && ticket.teamId === teamId) return true;
  return false;
}

/** Validate allowed status transitions per role. Returns error string or null. */
function validateTransition(
  role: UserRole,
  fromStatus: string,
  toStatus: string,
): string | null {
  if (isAdminOrAbove(role)) return null; // Admins can do anything

  if (role === "MANAGER") {
    // Managers cannot set CLOSED directly from non-RESOLVED
    if (toStatus === "CLOSED" && fromStatus !== "RESOLVED") {
      return "Ticket must be RESOLVED before CLOSED";
    }
    return null;
  }

  // AGENT allowed transitions
  const agentAllowed: Record<string, string[]> = {
    OPEN: ["IN_PROGRESS", "ESCALATED"],
    IN_PROGRESS: ["OPEN", "RESOLVED", "ESCALATED"],
    ESCALATED: [], // Read-only while escalated
    RESOLVED: ["OPEN"], // Can reopen
    CLOSED: [],
  };
  const allowed = agentAllowed[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    if (fromStatus === "ESCALATED") {
      return "Ticket is escalated — only Manager or Admin can change its status";
    }
    return `Agents cannot transition from ${fromStatus} to ${toStatus}`;
  }
  return null;
}

export class TicketController {
  static async createTicket(
    request: FastifyRequest<{
      Body: {
        subject: string;
        description?: string;
        channel?: string;
        customerId?: string;
        conversationId?: string;
        priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
        teamId?: string;
        assignedTo?: string;
      };
    }>,
    reply: FastifyReply,
  ) {
    const { subject, description, channel, customerId, conversationId, priority } = request.body ?? {};
    if (!subject?.trim()) return reply.code(400).send({ error: "subject is required" });

    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    // Team: explicit body > own team for Manager/Agent. Admins may leave unassigned with no team.
    let teamId = request.body.teamId ?? null;
    if (!teamId && (user.role === "MANAGER" || user.role === "AGENT") && user.teamId) {
      teamId = user.teamId;
    }

    if (teamId && !isAdminOrAbove(user.role) && teamId !== user.teamId) {
      return reply.code(403).send({ error: "You can only create tickets for your own team" });
    }

    // Assignee: agents always self. Others may assign Manager/Agent only.
    let assignedTo = request.body.assignedTo ?? null;
    if (assignedTo) {
      const assignee = await prisma.user.findUnique({
        where: { id: assignedTo },
        select: { id: true, role: true, teamId: true, isActive: true },
      });
      if (!assignee || !assignee.isActive) {
        return reply.code(400).send({ error: "Assignee not found or inactive" });
      }
      if (assignee.role !== "AGENT" && assignee.role !== "MANAGER") {
        return reply.code(400).send({ error: "Tickets can only be assigned to Managers or Agents" });
      }
      if (user.role === "MANAGER" && assignee.teamId !== user.teamId) {
        return reply.code(403).send({ error: "Managers can only assign to members of their own team" });
      }
      // Person assignment implies their team (team queue not used alongside person)
      teamId = assignee.teamId ?? teamId;
    }
    // Team-queue mode: assignedTo stays null, teamId set — any agent can claim later

    try {
      const ticket = await prisma.ticket.create({
        data: {
          id: ulid(),
          subject: subject.trim(),
          description: description?.trim() || null,
          channel: channel || null,
          customerId: customerId || null,
          conversationId: conversationId || null,
          priority: priority ?? "MEDIUM",
          teamId: teamId || null,
          assignedTo: assignedTo || null,
          createdBy: user.id,
          events: {
            create: {
              id: ulid(),
              actorId: user.id,
              type: "CREATED",
              toValue: { subject, priority, teamId, assignedTo },
            },
          },
        },
        include: {
          assignee: { select: { id: true, username: true } },
          creator: { select: { id: true, username: true } },
          team: { select: { id: true, name: true } },
          customer: { select: { name: true } },
        },
      });
      return reply.code(201).send(ticket);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to create ticket", details: err.message });
    }
  }

  static async listTickets(
    request: FastifyRequest<{
      Querystring: {
        status?: string;
        teamId?: string;
        assigneeId?: string;
        priority?: string;
        channel?: string;
        conversationId?: string;
        search?: string;
      };
    }>,
    reply: FastifyReply,
  ) {
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const { status, teamId, assigneeId, priority, channel, conversationId, search } = request.query;

    // Start with the role-scoped base filter
    const rbacWhere = buildRbacWhere(user.role, user.id, user.teamId);

    // Layer in explicit query filters on top — but only if role permits
    const extraFilters: Record<string, unknown> = {};
    if (status) extraFilters.status = status;
    if (priority) extraFilters.priority = priority;
    if (channel) extraFilters.channel = channel;
    if (conversationId) extraFilters.conversationId = conversationId;
    if (assigneeId) extraFilters.assignedTo = assigneeId;

    // Team filter: agents/managers can only filter within their scope
    if (teamId) {
      if (teamId === "NONE" || teamId === "null") {
        extraFilters.teamId = null;
      } else {
        if (!isAdminOrAbove(user.role) && teamId !== user.teamId) {
          return reply.send([]);
        }
        extraFilters.teamId = teamId;
      }
    }

    // Build final where
    let where: Record<string, unknown>;
    if ("OR" in rbacWhere) {
      // AGENT scope: wrap the RBAC OR with the extra filters
      where = { AND: [rbacWhere, extraFilters] };
    } else if ("teamId" in rbacWhere) {
      // MANAGER scope: merge teamId from rbac (cannot be overridden)
      where = { ...rbacWhere, ...extraFilters };
      // If explicit teamId filter is different from manager's team, return empty
      if (extraFilters.teamId && extraFilters.teamId !== rbacWhere.teamId) {
        return reply.send([]);
      }
    } else {
      // ADMIN/SUPER_ADMIN: just apply the extra filters directly
      where = extraFilters;
    }

    // Search
    if (search?.trim()) {
      where = {
        ...where,
        subject: { contains: search.trim(), mode: "insensitive" },
      };
    }

    const tickets = await prisma.ticket.findMany({
      where: where as any,
      orderBy: { updatedAt: "desc" },
      include: {
        assignee: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
        team: { select: { id: true, name: true } },
        customer: { select: { name: true } },
      },
    });
    return reply.send(tickets);
  }

  static async getTicket(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
        team: { select: { id: true, name: true } },
        customer: { select: { name: true } },
        events: { orderBy: { createdAt: "asc" } },
        notes: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, username: true } } },
        },
      },
    });
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });

    if (!canViewTicket(user.role, user.id, user.teamId, ticket)) {
      return reply.code(403).send({ error: "access denied" });
    }

    return reply.send(ticket);
  }

  static async updateTicket(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        subject?: string;
        description?: string;
        priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
        teamId?: string;
      };
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const { subject, description, priority, teamId } = request.body ?? {};
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });

    if (!canViewTicket(user.role, user.id, user.teamId, ticket)) {
      return reply.code(403).send({ error: "access denied" });
    }

    // Agents cannot change team
    if (teamId && user.role === "AGENT") {
      return reply.code(403).send({ error: "Agents cannot change the ticket's team" });
    }

    // Managers can only set their own team
    if (teamId && user.role === "MANAGER" && teamId !== user.teamId) {
      return reply.code(403).send({ error: "Managers can only assign tickets to their own team" });
    }

    const updateData: Record<string, unknown> = {};
    const auditEvents: { id: string; actorId: string; type: import("../generated/client/index.js").TicketEventType; fromValue?: any; toValue?: any }[] = [];

    if (subject !== undefined && subject.trim()) {
      updateData.subject = subject.trim();
    }
    if (description !== undefined) {
      updateData.description = description.trim() || null;
    }
    if (priority !== undefined && priority !== ticket.priority) {
      auditEvents.push({
        id: ulid(),
        actorId: user.id,
        type: "PRIORITY_CHANGED",
        fromValue: ticket.priority,
        toValue: priority,
      });
      updateData.priority = priority;
    }
    if (teamId !== undefined && teamId !== ticket.teamId) {
      auditEvents.push({
        id: ulid(),
        actorId: user.id,
        type: "TEAM_CHANGED",
        fromValue: ticket.teamId,
        toValue: teamId,
      });
      updateData.teamId = teamId || null;
    }

    try {
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          ...updateData,
          events: auditEvents.length
            ? { create: auditEvents }
            : undefined,
        },
        include: {
          assignee: { select: { id: true, username: true } },
          team: { select: { id: true, name: true } },
          customer: { select: { name: true } },
        },
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to update ticket", details: err.message });
    }
  }

  static async updateStatus(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { status: string };
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const { status } = request.body ?? {};
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const validStatuses = ["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"];
    if (!status || !validStatuses.includes(status)) {
      return reply.code(400).send({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });

    if (!canViewTicket(user.role, user.id, user.teamId, ticket)) {
      return reply.code(403).send({ error: "access denied" });
    }

    // Validate allowed transition
    const transitionError = validateTransition(user.role, ticket.status, status);
    if (transitionError) {
      return reply.code(403).send({ error: transitionError });
    }

    // ESCALATED status must go through /escalate endpoint
    if (status === "ESCALATED") {
      return reply.code(400).send({ error: "Use the /escalate endpoint to escalate a ticket" });
    }

    const eventType =
      status === "RESOLVED" ? "RESOLVED" :
      status === "CLOSED" ? "CLOSED" :
      status === "OPEN" ? "REOPENED" : "STATUS_CHANGED";

    try {
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          status: status as any,
          resolvedAt: status === "RESOLVED" ? new Date() : undefined,
          closedAt: status === "CLOSED" ? new Date() : undefined,
          // If returning escalated ticket to active status, clear escalation fields
          ...(ticket.status === "ESCALATED" && ["OPEN", "IN_PROGRESS"].includes(status)
            ? { escalatedToUserId: null, escalatedToTeamId: null }
            : {}),
          events: {
            create: {
              id: ulid(),
              actorId: user.id,
              type: eventType,
              fromValue: ticket.status,
              toValue: status,
            },
          },
        },
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to update status", details: err.message });
    }
  }

  static async assignTicket(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { assigneeId?: string; teamId?: string };
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const { assigneeId, teamId } = request.body ?? {};
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    // Empty strings / null = clear that field. At least one key must be present
    // (including empty) so clients can unassign.
    if (assigneeId === undefined && teamId === undefined) {
      return reply.code(400).send({ error: "assigneeId or teamId required" });
    }

    const nextAssignee =
      assigneeId !== undefined ? (assigneeId || null) : undefined;
    const nextTeam = teamId !== undefined ? (teamId || null) : undefined;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });

    if (!canViewTicket(user.role, user.id, user.teamId, ticket)) {
      return reply.code(403).send({ error: "access denied" });
    }

    // Agents can only self-assign / release back to the pool
    if (user.role === "AGENT") {
      if (nextAssignee && nextAssignee !== user.id) {
        return reply.code(403).send({ error: "Agents can only assign tickets to themselves" });
      }
      // Claiming open-pool or own-team tickets: don't let agents move tickets onto other teams
      if (nextTeam && nextTeam !== user.teamId) {
        return reply.code(403).send({ error: "Agents cannot change the ticket team" });
      }
    }

    let resolvedAssignee = nextAssignee;
    let resolvedTeam = nextTeam;

    if (nextAssignee) {
      const targetUser = await prisma.user.findUnique({
        where: { id: nextAssignee },
        select: { teamId: true, role: true, isActive: true },
      });
      if (!targetUser || !targetUser.isActive) {
        return reply.code(400).send({ error: "Assignee not found or inactive" });
      }
      if (targetUser.role !== "AGENT" && targetUser.role !== "MANAGER") {
        return reply.code(400).send({ error: "Tickets can only be assigned to Managers or Agents" });
      }
      if (user.role === "MANAGER" && targetUser.teamId !== user.teamId) {
        return reply.code(403).send({ error: "Managers can only assign to members of their own team" });
      }
      // Person assignment → their team when they have one; keep null for team-less agents (open pool claim)
      if (targetUser.teamId) {
        resolvedTeam = targetUser.teamId;
      } else if (nextTeam !== undefined) {
        resolvedTeam = nextTeam;
      } else {
        // Keep existing teamId when a team-less person claims (null stays open-pool context)
        resolvedTeam = ticket.teamId;
      }
    } else if (nextAssignee === null) {
      // Explicit clear of person (team queue or full unassign)
      resolvedAssignee = null;
      // Admin "Unassigned" with empty team → open pool (any agent can claim)
      if (nextTeam === null) {
        resolvedTeam = null;
      }
    }

    if (user.role === "MANAGER" && resolvedTeam && resolvedTeam !== user.teamId) {
      return reply.code(403).send({ error: "Managers can only use their own team queue" });
    }

    const isReassign =
      ticket.assignedTo !== null &&
      resolvedAssignee !== undefined &&
      resolvedAssignee !== ticket.assignedTo;
    const eventType = isReassign ? "REASSIGNED" : "ASSIGNED";

    try {
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          assignedTo: resolvedAssignee,
          teamId: resolvedTeam,
          events: {
            create: {
              id: ulid(),
              actorId: user.id,
              type: eventType,
              fromValue: { assigneeId: ticket.assignedTo, teamId: ticket.teamId },
              toValue: {
                assigneeId: resolvedAssignee !== undefined ? resolvedAssignee : ticket.assignedTo,
                teamId: resolvedTeam !== undefined ? resolvedTeam : ticket.teamId,
              },
            },
          },
        },
        include: {
          assignee: { select: { id: true, username: true } },
          team: { select: { id: true, name: true } },
        },
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to assign ticket", details: err.message });
    }
  }

  static async escalateTicket(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { teamId?: string; userId?: string; targetUserId?: string; note?: string };
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const body = request.body ?? {};
    const teamId = body.teamId || undefined;
    const targetUserId = body.userId || body.targetUserId || undefined;
    const note = body.note;
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });

    if (!canViewTicket(user.role, user.id, user.teamId, ticket)) {
      return reply.code(403).send({ error: "access denied" });
    }

    if (ticket.status === "ESCALATED") {
      return reply.code(400).send({ error: "Ticket is already escalated" });
    }

    if (user.role === "AGENT" && !note?.trim()) {
      return reply.code(400).send({ error: "A reason note is required when escalating" });
    }

    let resolvedTeamId: string | null = teamId ?? null;
    let resolvedUserId: string | null = targetUserId ?? null;

    if (user.role === "AGENT") {
      const hasOwnTeam = !!user.teamId;

      if (hasOwnTeam) {
        // Team agents: escalate to own team queue (manager), or optionally a Manager/Admin person
        if (teamId && teamId !== user.teamId) {
          return reply.code(403).send({ error: "Agents can only escalate to their own team queue" });
        }
        if (!resolvedUserId) {
          resolvedTeamId = user.teamId!;
        }
        // If they pick a Manager/Admin, validate below; team may stay null or their own
      } else {
        // Team-less agents (or open-pool work): must escalate to a Manager or Admin
        if (!resolvedUserId) {
          return reply.code(400).send({
            error: "Select a Manager or Admin to escalate to (you are not on a team)",
          });
        }
        resolvedTeamId = null;
      }

      if (resolvedUserId) {
        const target = await prisma.user.findUnique({
          where: { id: resolvedUserId },
          select: { id: true, role: true, isActive: true, teamId: true },
        });
        if (!target || !target.isActive) {
          return reply.code(400).send({ error: "Escalation target not found or inactive" });
        }
        if (target.role !== "MANAGER" && target.role !== "ADMIN" && target.role !== "SUPER_ADMIN") {
          return reply.code(400).send({ error: "Agents can only escalate to a Manager or Admin" });
        }
      }

      if (!resolvedTeamId && !resolvedUserId) {
        return reply.code(400).send({ error: "teamId or userId required for escalation" });
      }
    } else {
      // Manager / Admin: team queue and/or specific user
      if (!resolvedTeamId && !resolvedUserId) {
        return reply.code(400).send({ error: "teamId or userId required for escalation" });
      }
      if (resolvedUserId) {
        const target = await prisma.user.findUnique({
          where: { id: resolvedUserId },
          select: { id: true, role: true, isActive: true },
        });
        if (!target || !target.isActive) {
          return reply.code(400).send({ error: "Escalation target not found or inactive" });
        }
      }
    }

    try {
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          status: "ESCALATED",
          escalatedToUserId: resolvedUserId,
          escalatedToTeamId: resolvedTeamId,
          events: {
            create: {
              id: ulid(),
              actorId: user.id,
              type: "ESCALATED",
              fromValue: ticket.status,
              toValue: { teamId: resolvedTeamId, userId: resolvedUserId },
              note: note?.trim() ?? null,
            },
          },
        },
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to escalate ticket", details: err.message });
    }
  }

  static async returnTicket(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { note?: string };
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const { note } = request.body ?? {};
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    if (user.role === "AGENT") {
      return reply.code(403).send({ error: "Only Managers and Admins can return escalated tickets" });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });

    if (ticket.status !== "ESCALATED") {
      return reply.code(400).send({ error: "Ticket is not in ESCALATED status" });
    }

    if (user.role === "MANAGER") {
      const allowed =
        ticket.teamId === user.teamId ||
        ticket.teamId === null ||
        ticket.escalatedToUserId === user.id ||
        ticket.escalatedToTeamId === user.teamId;
      if (!allowed) {
        return reply.code(403).send({ error: "access denied" });
      }
    }

    try {
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          escalatedToUserId: null,
          escalatedToTeamId: null,
          events: {
            create: {
              id: ulid(),
              actorId: user.id,
              type: "RETURNED",
              fromValue: "ESCALATED",
              toValue: "IN_PROGRESS",
              note: note?.trim() ?? null,
            },
          },
        },
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to return ticket", details: err.message });
    }
  }

  static async addNote(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { body: string; isInternal?: boolean };
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const { body: noteBody, isInternal = true } = request.body ?? {};
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    if (!noteBody?.trim()) return reply.code(400).send({ error: "note body is required" });

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });

    if (!canViewTicket(user.role, user.id, user.teamId, ticket)) {
      return reply.code(403).send({ error: "access denied" });
    }

    try {
      const [note] = await prisma.$transaction([
        prisma.ticketNote.create({
          data: {
            id: ulid(),
            ticketId: id,
            authorId: user.id,
            body: noteBody.trim(),
            isInternal,
          },
          include: { author: { select: { id: true, username: true } } },
        }),
        prisma.ticketEvent.create({
          data: {
            id: ulid(),
            ticketId: id,
            actorId: user.id,
            type: "NOTE_ADDED",
            toValue: { isInternal },
          },
        }),
      ]);
      return reply.code(201).send(note);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to add note", details: err.message });
    }
  }

  static async getEvents(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const user = getUser(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { assignedTo: true, teamId: true },
    });
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });

    if (!canViewTicket(user.role, user.id, user.teamId, ticket)) {
      return reply.code(403).send({ error: "access denied" });
    }

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "asc" },
    });
    return reply.send(events);
  }
}
