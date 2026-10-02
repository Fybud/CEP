import type { FastifyInstance } from "fastify";
import {
  oauthRedirectHints,
  startGmailOAuth,
  startInstagramOAuth,
} from "../../services/OAuthService.js";
import { startShopifyOAuth } from "../../services/orders/ShopifyOAuth.js";

/**
 * Authenticated OAuth helpers for the Settings UI.
 * Browser never needs CLI — vendor clicks Connect → API returns Google/Meta URL.
 */
export async function oauthConnectRoutes(app: FastifyInstance) {
  app.get("/hints", async () => oauthRedirectHints());

  app.post<{
    Body: {
      inboxId?: string;
    };
  }>("/gmail/start", async (request, reply) => {
    const inboxId = request.body?.inboxId;
    if (!inboxId) return reply.code(400).send({ error: "inboxId required" });
    try {
      const result = await startGmailOAuth(inboxId);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err?.message ?? "failed to start Gmail OAuth" });
    }
  });

  app.post<{
    Body: {
      inboxId?: string;
      instagramAppId?: string;
      instagramAppSecret?: string;
      verifyToken?: string;
    };
  }>("/instagram/start", async (request, reply) => {
    const inboxId = request.body?.inboxId;
    if (!inboxId) return reply.code(400).send({ error: "inboxId required" });
    try {
      const result = await startInstagramOAuth(inboxId, {
        instagramAppId: request.body?.instagramAppId,
        instagramAppSecret: request.body?.instagramAppSecret,
        verifyToken: request.body?.verifyToken,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err?.message ?? "failed to start Instagram OAuth" });
    }
  });

  app.post<{
    Body: {
      shop?: string;
      clientId?: string;
      clientSecret?: string;
    };
  }>("/shopify/start", async (request, reply) => {
    try {
      const result = await startShopifyOAuth({
        shop: request.body?.shop,
        clientId: request.body?.clientId,
        clientSecret: request.body?.clientSecret,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err?.message ?? "failed to start Shopify OAuth" });
    }
  });
}
