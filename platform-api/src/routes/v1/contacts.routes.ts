import type { FastifyInstance } from "fastify";
import { ContactController } from "../../controllers/ContactController.js";

export async function contactsRoutes(app: FastifyInstance) {
  app.get("/", ContactController.listContacts);
  app.post("/", ContactController.createContact);
  app.post("/import", ContactController.bulkImport);
  app.post("/merge", ContactController.merge);
  app.get("/tags", ContactController.listTags);
  app.get("/:id", ContactController.getOne);
  app.patch("/:id", ContactController.updateContact);
  app.patch("/:id/tag", ContactController.setTag);
  app.delete("/:id", ContactController.deleteContact);
  app.get("/:id/timeline", ContactController.getTimeline);
  app.patch("/:id/custom-fields", ContactController.updateCustomFields);
}
