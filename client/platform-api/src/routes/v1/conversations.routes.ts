import type { FastifyInstance } from "fastify";
import { ConversationController } from "../../controllers/ConversationController.js";
import { MediaController } from "../../controllers/MediaController.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/", ConversationController.listConversations);
  // Must be registered before /:id so "search" is not treated as an id
  app.get("/search", ConversationController.searchMessages);
  app.get("/:id", ConversationController.getConversation);
  app.patch("/:id", ConversationController.updateStatus);
  app.post("/:id/suppress", ConversationController.suppress);
  app.post("/:id/messages/delete", ConversationController.suppressMessages);
  app.post("/:id/read", ConversationController.markRead);
  app.post("/:id/attachments", MediaController.uploadAttachment);
  app.get("/:id/messages", ConversationController.getMessages);
  app.post("/:id/messages", ConversationController.sendMessage);
  app.post("/:id/templates/send", ConversationController.sendWhatsAppTemplate);
  app.post("/:id/messages/:messageId/react", ConversationController.reactToMessage);
  app.post("/:id/messages/:messageId/pin", ConversationController.togglePin);
  app.post("/:id/star", ConversationController.toggleStar);
  app.get("/:id/transcript.pdf", ConversationController.downloadTranscript);
}


export async function messageMediaRoutes(app: FastifyInstance) {
  app.get("/:messageId/media", MediaController.streamMessageMedia);
}
