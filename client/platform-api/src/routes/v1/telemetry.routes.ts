import { FastifyInstance } from "fastify";
import { TelemetryController } from "../../controllers/TelemetryController.js";

export default async function telemetryRoutes(app: FastifyInstance) {
  // We do not require auth for these endpoints as they are hit from the public client tracking script.
  // In a real prod environment we'd use CORS or a lightweight API key, but for now this is fine.
  app.post("/session", TelemetryController.startSession);
  app.post("/events", TelemetryController.ingestEvents);
}
