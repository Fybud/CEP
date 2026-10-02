import type { FastifyPluginAsync } from "fastify";
import { ConversationController } from "../../controllers/ConversationController.js";

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", ConversationController.searchMessages);
};
