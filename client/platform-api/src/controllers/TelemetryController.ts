import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";

export class TelemetryController {
  // Start a new session
  static async startSession(request: FastifyRequest<{ Body: { browser: string; os: string; userName?: string; userEmail?: string } }>, reply: FastifyReply) {
    const { browser, os, userName, userEmail } = request.body;
    try {
      const { isFeatureEnabled } = await import("../services/FeatureService.js");
      const enabled = await isFeatureEnabled("rrweb");
      if (!enabled) {
        return reply.status(403).send({ error: "rrweb feature is disabled" });
      }

      const session = await prisma.userSession.create({
        data: {
          browser,
          os,
          userName,
          userEmail,
        },
      });
      return reply.send({ sessionId: session.id });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ error: "Could not create session" });
    }
  }

  // Ingest batched events
  static async ingestEvents(request: FastifyRequest<{ Body: { sessionId: string; events: any[] } }>, reply: FastifyReply) {
    const { sessionId, events } = request.body;
    if (!sessionId || !events || !events.length) {
      return reply.send({ success: true });
    }
    try {
      const { isFeatureEnabled } = await import("../services/FeatureService.js");
      const enabled = await isFeatureEnabled("rrweb");
      if (!enabled) {
        // Return success so the client drops the events and stops retrying
        return reply.send({ success: true, ignored: true });
      }

      // Validate session exists
      const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
      if (!session) return reply.status(404).send({ error: "Session not found" });

      await prisma.sessionEvent.createMany({
        data: events.map((event) => ({
          sessionId,
          data: event,
        })),
      });

      return reply.send({ success: true });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ error: "Could not save events" });
    }
  }
}
