import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

import { prisma } from "../config/db.js";

export interface JwtPayload {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";
  teamId?: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  
  if (!token) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    
    // Check if user is active and get their teamId from the DB
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { isActive: true, teamId: true }
    });

    if (!dbUser || !dbUser.isActive) {
      return reply.code(403).send({ error: "account deactivated or not found" });
    }

    payload.teamId = dbUser.teamId;
    request.user = payload;
  } catch (err) {
    return reply.code(401).send({ error: "invalid token" });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | void> {
  await requireAuth(request, reply);
  if (reply.sent) return reply;

  if (request.user?.role !== "ADMIN" && request.user?.role !== "SUPER_ADMIN") {
    return reply.code(403).send({ error: "forbidden, admin+ only" });
  }
}

export async function requireManager(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | void> {
  await requireAuth(request, reply);
  if (reply.sent) return reply;

  const role = request.user?.role;
  if (role !== "MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return reply.code(403).send({ error: "forbidden, manager+ only" });
  }
}

export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | void> {
  await requireAuth(request, reply);
  if (reply.sent) return reply;

  if (request.user?.role !== "SUPER_ADMIN") {
    return reply.code(403).send({ error: "forbidden, super admin only" });
  }
}

/**
 * Factory that returns a Fastify preHandler enforcing a feature flag.
 * The check is always done server-side against the DB — frontend flag state
 * is irrelevant. Returns 403 with a descriptive JSON error when disabled.
 *
 * @param flagKey  The feature_flags.key value to check.
 * @param label    Human-readable name used in the error message (e.g. "Broadcast").
 * @param defaultValue  What to assume when the flag doesn't exist yet (default: false).
 */
export function requireFeatureEnabled(
  flagKey: string,
  label: string,
  defaultValue = false,
) {
  return async function featureGateHandler(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    const { isFeatureEnabled } = await import("../services/FeatureService.js");
    const enabled = await isFeatureEnabled(flagKey, defaultValue);
    if (!enabled) {
      return reply.code(403).send({
        error: `Feature '${label}' is not enabled for this workspace`,
        code: "FEATURE_DISABLED",
        feature: flagKey,
      });
    }
  };
}
