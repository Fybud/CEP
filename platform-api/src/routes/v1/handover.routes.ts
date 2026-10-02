import type { FastifyInstance } from "fastify";
import { HandoverController } from "../../controllers/HandoverController.js";

/**
 * Frontend uses contactId as the handover scope key:
 *   GET/POST /api/v1/handover/:contactId
 *   DELETE   /api/v1/handover/:noteId
 */
export default async function handoverRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { contactId: string } }>(
    "/api/v1/handover/:contactId",
    HandoverController.listNotes,
  );

  fastify.post<{ Params: { contactId: string }; Body: { content?: string; note?: string; body?: string } }>(
    "/api/v1/handover/:contactId",
    HandoverController.addNote,
  );

  fastify.delete<{ Params: { noteId: string } }>(
    "/api/v1/handover/:noteId",
    HandoverController.deleteNote,
  );
}
