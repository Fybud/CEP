import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { ulid } from "ulid";

export class HandoverController {
  static async listNotes(
    request: FastifyRequest<{ Params: { contactId: string } }>,
    reply: FastifyReply,
  ) {
    const { contactId } = request.params;
    const notes = await prisma.handoverNote.findMany({
      where: { conversationId: contactId },
      include: {
        author: { select: { id: true, username: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(notes);
  }

  static async addNote(
    request: FastifyRequest<{
      Params: { contactId: string };
      Body: { content?: string; note?: string; body?: string };
    }>,
    reply: FastifyReply,
  ) {
    const { contactId } = request.params;
    const raw = request.body?.content ?? request.body?.note ?? request.body?.body;
    const user = (request as { user?: { id: string } }).user;

    if (!user?.id) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    if (!raw?.trim()) {
      return reply.code(400).send({ error: "Note content is required" });
    }

    const newNote = await prisma.handoverNote.create({
      data: {
        id: ulid(),
        conversationId: contactId,
        authorId: user.id,
        body: raw.trim(),
      },
      include: {
        author: { select: { id: true, username: true, name: true } },
      },
    });

    return reply.send(newNote);
  }

  static async deleteNote(
    request: FastifyRequest<{ Params: { noteId: string } }>,
    reply: FastifyReply,
  ) {
    const { noteId } = request.params;
    const user = (request as { user?: { id: string; role?: string } }).user;

    if (!user?.id) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const note = await prisma.handoverNote.findUnique({ where: { id: noteId } });
    if (!note) {
      return reply.code(404).send({ error: "Note not found" });
    }

    if (
      note.authorId !== user.id &&
      user.role !== "ADMIN" &&
      user.role !== "SUPER_ADMIN"
    ) {
      return reply.code(403).send({ error: "Only the author or an admin can delete this note" });
    }

    await prisma.handoverNote.delete({ where: { id: noteId } });
    return reply.send({ success: true });
  }
}
