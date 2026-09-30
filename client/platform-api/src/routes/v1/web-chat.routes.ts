import type { FastifyPluginAsync } from "fastify";
import { WebChatController } from "../../controllers/WebChatController.js";
import { assertWebChatWidgetAccess } from "../../services/WebChatWidgetService.js";
import { requireAdmin } from "../../middleware/auth.js";

export const webChatRoutes: FastifyPluginAsync = async (app) => {
  // Agent settings (auth required — not in public skip list)
  app.get("/settings", { preHandler: requireAdmin }, WebChatController.getSettings);
  app.patch("/settings", { preHandler: requireAdmin }, WebChatController.patchSettings);

  // Public embed endpoints — require widget key (+ origin allowlist when set)
  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (path.endsWith("/settings") || path === "/settings") return;
    const ok = await assertWebChatWidgetAccess(request, reply);
    if (!ok) return reply;
  });

  app.get("/config", WebChatController.getEmbedConfig);
  // Widget / embed posts to /api/v1/web-chat (session create)
  app.post("/", WebChatController.createSession);
  app.post("/session", WebChatController.createSession);
  app.post("/messages", WebChatController.sendMessage);
  app.get("/messages", WebChatController.getMessages);
};
