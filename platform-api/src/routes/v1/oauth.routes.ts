import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import {
  completeGmailOAuth,
  completeInstagramOAuth,
  settingsReturnUrl,
} from "../../services/OAuthService.js";
import { completeShopifyOAuth } from "../../services/orders/ShopifyOAuth.js";

function htmlPage(title: string, body: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:2rem;max-width:720px;line-height:1.5;color:#111}
  .ok{color:#047857}.err{color:#b91c1c}
  a{color:#1d4ed8}
  code,pre{background:#111;color:#eee;padding:.2rem .4rem;border-radius:4px}
  pre{padding:1rem;overflow:auto}
</style></head><body>${body}</body></html>`;
}

/**
 * Public OAuth callbacks (no JWT). Token exchange persists to the inbox
 * identified by signed `state` from Settings → Connect.
 */
export async function publicOAuthRoutes(app: FastifyInstance) {
  app.get("/gmail/callback", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    if (q.error) {
      const returnUrl = settingsReturnUrl({
        oauth: "gmail",
        status: "error",
        message: q.error_description || q.error,
      });
      return reply.redirect(returnUrl);
    }
    if (!q.code || !q.state) {
      return reply.code(400).type("text/html").send(
        htmlPage("Gmail OAuth", `<h2 class="err">Missing code or state</h2>`),
      );
    }

    try {
      const result = await completeGmailOAuth({ code: q.code, state: q.state });
      return reply.redirect(result.returnUrl);
    } catch (err: any) {
      request.log.error(err, "gmail oauth callback failed");
      return reply.redirect(
        settingsReturnUrl({
          oauth: "gmail",
          status: "error",
          message: err?.message ?? "oauth failed",
        }),
      );
    }
  });

  app.get("/instagram/callback", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    if (q.error) {
      return reply.redirect(
        settingsReturnUrl({
          oauth: "instagram",
          status: "error",
          message: q.error_description || q.error,
        }),
      );
    }
    const code = q.code;
    if (!code) {
      return reply.code(400).type("text/html").send(
        htmlPage("Instagram OAuth", `<h2 class="err">Missing code</h2>`),
      );
    }

    try {
      const result = await completeInstagramOAuth({ code, state: q.state });
      return reply.redirect(result.returnUrl);
    } catch (err: any) {
      request.log.error(err, "instagram oauth callback failed");
      return reply
        .code(500)
        .type("text/html")
        .send(
          htmlPage(
            "Instagram OAuth",
            `<h2 class="err">OAuth failed</h2><pre>${err?.message ?? err}</pre>
             <p>Ensure App ID / Secret are saved in Settings and the redirect URI matches Meta.</p>`,
          ),
        );
    }
  });

  app.get("/shopify/callback", async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const errVal = q.error;
    if (typeof errVal === "string" && errVal) {
      return reply.redirect(
        settingsReturnUrl({
          oauth: "shopify",
          status: "error",
          message: String(q.error_description || errVal),
        }),
      );
    }
    try {
      const result = await completeShopifyOAuth(q);
      return reply.redirect(result.returnUrl);
    } catch (err: any) {
      request.log.error(err, "shopify oauth callback failed");
      return reply.redirect(
        settingsReturnUrl({
          oauth: "shopify",
          status: "error",
          message: err?.message ?? "oauth failed",
        }),
      );
    }
  });

  /** Meta deauthorize callback */
  app.post("/instagram/deauthorize", async (request, reply) => {
    request.log.info({ body: request.body }, "instagram deauthorize");
    return reply.code(200).send({ ok: true });
  });

  /** Meta data deletion request callback */
  app.all("/instagram/data-deletion", async (request, reply) => {
    const confirmationCode = `cep_${Date.now()}`;
    request.log.info({ body: request.body, query: request.query }, "instagram data deletion");
    return reply.code(200).send({
      url: `${env.apiBaseUrl.replace(/\/$/, "")}/privacy`,
      confirmation_code: confirmationCode,
    });
  });
}

/** @deprecated use publicOAuthRoutes */
export const instagramOAuthRoutes = publicOAuthRoutes;
