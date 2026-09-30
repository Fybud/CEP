import type { FastifyInstance } from "fastify";
import { TicketController } from "../../controllers/TicketController.js";

export async function ticketRoutes(app: FastifyInstance) {
  app.get("/", TicketController.listTickets as any);
  app.post("/", TicketController.createTicket as any);
  app.get("/:id", TicketController.getTicket as any);
  app.patch("/:id", TicketController.updateTicket as any);
  app.patch("/:id/status", TicketController.updateStatus as any);
  app.post("/:id/assign", TicketController.assignTicket as any);
  app.post("/:id/escalate", TicketController.escalateTicket as any);
  app.post("/:id/return", TicketController.returnTicket as any);
  app.post("/:id/notes", TicketController.addNote as any);
  app.get("/:id/events", TicketController.getEvents as any);
}
