import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { prisma } from "../../config/db.js";

export const cannedReplyRoutes: FastifyPluginAsync = async (app) => {
  // Get all canned replies
  app.get("/", async (req, reply) => {
    const replies = await prisma.cannedReply.findMany({
      orderBy: { name: "asc" },
    });
    return replies;
  });

  // Create a canned reply
  app.post<{ Body: { name: string; shortcut: string; body: string } }>(
    "/",
    async (req, reply) => {
      const { name, shortcut, body } = req.body;

      if (!name || !shortcut || !body) {
        return reply.code(400).send({ error: "Missing required fields" });
      }

      // Ensure shortcut doesn't start with / internally, we handle that in UI
      const cleanShortcut = shortcut.startsWith("/") ? shortcut.slice(1) : shortcut;

      try {
        const replyRecord = await prisma.cannedReply.create({
          data: {
            name,
            shortcut: cleanShortcut,
            body,
          },
        });
        return reply.code(201).send(replyRecord);
      } catch (err: any) {
        if (err.code === "P2002") {
          return reply.code(400).send({ error: "Shortcut must be unique" });
        }
        throw err;
      }
    }
  );

  // Update a canned reply
  app.patch<{ Params: { id: string }; Body: { name?: string; shortcut?: string; body?: string } }>(
    "/:id",
    async (req, reply) => {
      const { id } = req.params;
      const { name, shortcut, body } = req.body;

      const data: any = {};
      if (name) data.name = name;
      if (shortcut) data.shortcut = shortcut.startsWith("/") ? shortcut.slice(1) : shortcut;
      if (body) data.body = body;

      try {
        const replyRecord = await prisma.cannedReply.update({
          where: { id },
          data,
        });
        return replyRecord;
      } catch (err: any) {
        if (err.code === "P2002") {
          return reply.code(400).send({ error: "Shortcut must be unique" });
        }
        if (err.code === "P2025") {
          return reply.code(404).send({ error: "Canned reply not found" });
        }
        throw err;
      }
    }
  );

  // Delete a canned reply
  app.delete<{ Params: { id: string } }>(
    "/:id",
    async (req, reply) => {
      const { id } = req.params;
      try {
        await prisma.cannedReply.delete({ where: { id } });
        return { success: true };
      } catch (err: any) {
        if (err.code === "P2025") {
          return reply.code(404).send({ error: "Canned reply not found" });
        }
        throw err;
      }
    }
  );
};
