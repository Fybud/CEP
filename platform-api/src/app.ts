import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes/index.js";
import { mediaConfig } from "./config/media.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.register(multipart, {
    limits: { fileSize: mediaConfig.maxBytes },
  });

  // Always log webhook traffic (Meta/Gmail callbacks)
  app.addHook("onResponse", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (path.startsWith("/webhooks/")) {
      request.log.info(
        { method: request.method, url: request.url, statusCode: reply.statusCode },
        "webhook",
      );
    }
  });

  await registerRoutes(app);
  return app;
}
