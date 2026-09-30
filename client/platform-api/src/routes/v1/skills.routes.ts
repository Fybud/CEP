import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../config/db.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  getLlmConfigPublic,
  listSkillsWithStatus,
  updateLlmConfig,
} from "../../services/skills/index.js";

export const skillRoutes: FastifyPluginAsync = async (app) => {
  /** Premade catalog + whether each skill flag is on for this tenant. */
  app.get("/", async () => {
    const skills = await listSkillsWithStatus();
    return { skills };
  });

  app.get("/runs", async (req) => {
    const q = req.query as { limit?: string; skillKey?: string };
    const take = Math.min(Number(q.limit) || 50, 200);
    const where = q.skillKey ? { skillKey: q.skillKey } : {};
    const runs = await prisma.agentSkillRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
    });
    return { runs };
  });

  app.get("/llm-config", { preHandler: requireAdmin }, async () => {
    return getLlmConfigPublic();
  });

  app.patch<{
    Body: {
      provider?: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      clearKey?: boolean;
    };
  }>("/llm-config", { preHandler: requireAdmin }, async (req) => {
    return updateLlmConfig(req.body ?? {});
  });
};
