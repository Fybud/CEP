import type { FastifyInstance } from "fastify";
import { ulid } from "ulid";
import { putObject, channelMediaKey } from "../../services/MediaService.js";

export async function mediaRoutes(app: FastifyInstance) {
  app.post("/upload", async (request, reply) => {
    // Requires auth
    const user = request.user;
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    const buffer = await data.toBuffer();
    const key = channelMediaKey("outbound", user.id, data.filename);

    try {
      await putObject({
        key,
        body: buffer,
        contentType: data.mimetype,
      });

      return reply.send({
        mediaKey: key,
        mimeType: data.mimetype,
        filename: data.filename,
      });
    } catch (err: any) {
      request.log.error(err, "Failed to upload media to S3");
      return reply.code(500).send({ error: "Failed to upload media" });
    }
  });
}
