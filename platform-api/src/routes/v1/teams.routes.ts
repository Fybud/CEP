import type { FastifyInstance } from "fastify";
import { TeamController } from "../../controllers/TeamController.js";
import { requireAdmin, requireAuth, requireManager } from "../../middleware/auth.js";

export async function teamRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: [requireAdmin] }, TeamController.createTeam as any);
  app.patch("/:id", { preHandler: [requireAdmin] }, TeamController.updateTeam as any);

  // Manager+ can list / view teams (managers scoped to own team in controller)
  app.get("/", { preHandler: [requireAuth] }, TeamController.listTeams as any);
  app.get("/:id", { preHandler: [requireManager] }, TeamController.getTeam as any);
}
