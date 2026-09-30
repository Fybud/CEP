import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { accountRoutes } from "./v1/accounts.routes.js";
import { inboxRoutes } from "./v1/inboxes.routes.js";
import {
  messageMediaRoutes,
  conversationRoutes,
} from "./v1/conversations.routes.js";
import { webhookRoutes } from "./v1/webhooks.routes.js";
import { contactsRoutes } from "./v1/contacts.routes.js";
import { webChatRoutes } from "./v1/web-chat.routes.js";
import { searchRoutes } from "./v1/search.routes.js";
import { emailRoutes } from "./v1/email.routes.js";
import { authRoutes } from "./v1/auth.routes.js";

import { dashboardRoutes } from "./v1/dashboard.routes.js";
import { orderRoutes } from "./v1/orders.routes.js";
import { shopifyConfigRoutes } from "./v1/shopify.routes.js";
import { publicOAuthRoutes } from "./v1/oauth.routes.js";
import { oauthConnectRoutes } from "./v1/oauth-connect.routes.js";
import { ticketRoutes } from "./v1/ticket.routes.js";
import { mediaRoutes } from "./v1/media.routes.js";
import { mediaAssetRoutes } from "./v1/media-assets.routes.js";
// import { cannedReplyRoutes } from "./v1/canned-replies.routes.js"; // disabled
import { blockedContactRoutes } from "./v1/blocked-contacts.routes.js";
import { teamRoutes } from "./v1/teams.routes.js";
import { userRoutes } from "./v1/users.routes.js";
import { healthRoutes } from "./v1/health.routes.js";
import handoverRoutes from "./v1/handover.routes.js";
import { whatsAppTemplateRoutes } from "../controllers/WhatsAppTemplateController.js";
import { broadcastRoutes } from "../controllers/BroadcastController.js";
import { requireAuth, requireFeatureEnabled } from "../middleware/auth.js";
import { prisma } from "../config/db.js";
import { ulid } from "ulid";
import { ingestInboundMessages } from "../services/MessagingService.js";


export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "platform-api" }));

  app.get("/privacy", async (_request, reply) => {
    return reply.type("text/html").send(PRIVACY_POLICY_HTML);
  });

  // Static setup PDF (public) — generated via `npm run docs:pdf`
  app.get("/docs/channel-setup-guide.pdf", async (_request, reply) => {
    const here = nodePath.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      // runtime Docker layout: /app/dist/routes → /app/public/docs
      nodePath.resolve(here, "../../public/docs/channel-setup-guide.pdf"),
      // cwd fallback
      nodePath.resolve(process.cwd(), "public/docs/channel-setup-guide.pdf"),
    ];
    for (const pdfPath of candidates) {
      try {
        const buf = await fs.readFile(pdfPath);
        return reply
          .header("Content-Type", "application/pdf")
          .header("Content-Disposition", 'attachment; filename="CEP-Channel-Setup-Guide.pdf"')
          .send(buf);
      } catch {
        /* try next */
      }
    }
    return reply.code(404).send({
      error: "Setup guide PDF not found. Rebuild API image (public/docs) or run: npm run docs:pdf",
    });
  });

  app.get("/", async () => ({
    service: "platform-api",
    message: "This is the CEP API. Open the agent UI at http://localhost:5173",
    health: "/health",
    privacy: "/privacy",
    docsPdf: "/docs/channel-setup-guide.pdf",
    docs: "See docs/PLATFORM.md",
  }));

  // Public OAuth callbacks (Gmail + Instagram) — skip auth hook below
  app.register(publicOAuthRoutes, { prefix: "/oauth" });

  app.addHook("preHandler", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    
    const reqPath = request.url.split("?")[0] ?? request.url;
    if (
      reqPath === "/" ||
      reqPath === "/health" ||
      reqPath === "/privacy" ||
      reqPath === "/docs/channel-setup-guide.pdf" ||
      reqPath.startsWith("/webhooks/") ||
      reqPath.startsWith("/oauth/") ||
      reqPath === "/api/v1/auth/google" ||
      reqPath.includes("/telemetry") ||
      reqPath === "/api/v1/features" ||
      // Public web-chat embed APIs only — /settings stays authenticated
      reqPath === "/api/v1/web-chat" ||
      reqPath === "/api/v1/web-chat/session" ||
      reqPath === "/api/v1/web-chat/config" ||
      reqPath === "/api/v1/web-chat/messages" ||
      reqPath.startsWith("/uploads/assets/") ||
      reqPath.startsWith("/embed/")
    ) {
      return;
    }
    await requireAuth(request, reply);
    if (reply.sent) return reply;
  });

  app.register(authRoutes, { prefix: "/api/v1/auth" });
  app.register(accountRoutes, { prefix: "/api/v1/accounts" });
  app.register(inboxRoutes, { prefix: "/api/v1/inboxes" });
  app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
  app.register(messageMediaRoutes, { prefix: "/api/v1/messages" });
  app.register(contactsRoutes, { prefix: "/api/v1/contacts" });
  app.register(webChatRoutes, { prefix: "/api/v1/web-chat" });
  app.register(searchRoutes, { prefix: "/api/v1/search" });
  // Dashboard is always available — no feature flag.
  app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  // Shopify is always available when shopify_config has credentials — no feature flag.
  app.register(orderRoutes, { prefix: "/api/v1/orders" });
  app.register(emailRoutes, { prefix: "/api/v1/email" });
  app.register(shopifyConfigRoutes, { prefix: "/api/v1/shopify" });
  app.register(ticketRoutes, { prefix: "/api/v1/tickets" });
  app.register(mediaRoutes, { prefix: "/api/v1/media" });
  app.register(mediaAssetRoutes, { prefix: "/api/v1/media-assets" });
  // app.register(cannedReplyRoutes, { prefix: "/api/v1/canned-replies" }); // disabled
  app.register(blockedContactRoutes, { prefix: "/api/v1/blocked-contacts" });
  app.register(teamRoutes, { prefix: "/api/v1/teams" });
  app.register(userRoutes, { prefix: "/api/v1/users" });
  app.register(healthRoutes, { prefix: "/api/v1/health" });
  app.register(handoverRoutes);
  // Feature-gated route groups — backend enforces the flag regardless of frontend state
  app.register(
    async (sub) => {
      sub.addHook("preHandler", requireFeatureEnabled("whatsapp_templates_enabled", "WhatsApp Templates"));
      sub.register(whatsAppTemplateRoutes);
    },
    { prefix: "/api/v1/whatsapp-templates" },
  );
  app.register(
    async (sub) => {
      sub.addHook("preHandler", requireFeatureEnabled("broadcast_enabled", "Broadcast"));
      sub.register(broadcastRoutes);
    },
    { prefix: "/api/v1/broadcasts" },
  );
  
  app.get<{ Querystring: { key: string } }>("/api/v1/features", async (request, reply) => {
    const key = request.query.key;
    if (!key) return reply.code(400).send({ error: "Missing feature key" });
    const { isFeatureEnabled } = await import("../services/FeatureService.js");
    const enabled = await isFeatureEnabled(key);
    return reply.send({ enabled });
  });

  app.post<{ Body: { key: string; enabled: boolean; description?: string } }>("/api/v1/features", async (request, reply) => {
    const { key, enabled, description } = request.body;
    if (typeof key !== "string" || typeof enabled !== "boolean") {
      return reply.code(400).send({ error: "Invalid payload" });
    }
    const { setFeatureEnabled } = await import("../services/FeatureService.js");
    const newEnabled = await setFeatureEnabled(key, enabled, description);
    return reply.send({ enabled: newEnabled });
  });
  // Back-compat alias
  app.register(emailRoutes, { prefix: "/api/v1/gmail" });
  app.register(oauthConnectRoutes, { prefix: "/api/v1/oauth" });
  app.register(webhookRoutes, { prefix: "/webhooks" });

  // Local media asset library files (public read; upload still requires auth)
  app.get<{ Params: { file: string } }>("/uploads/assets/:file", async (request, reply) => {
    const file = request.params.file;
    if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) {
      return reply.code(400).send({ error: "Invalid file" });
    }
    const here = nodePath.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      nodePath.resolve(process.cwd(), "uploads", "assets", file),
      nodePath.resolve(here, "../../uploads/assets", file),
    ];
    for (const filePath of candidates) {
      try {
        const buf = await fs.readFile(filePath);
        const ext = nodePath.extname(filePath).toLowerCase();
        const type =
          ext === ".png"
            ? "image/png"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : ext === ".gif"
                ? "image/gif"
                : ext === ".webp"
                  ? "image/webp"
                  : ext === ".pdf"
                    ? "application/pdf"
                    : "application/octet-stream";
        return reply.header("Content-Type", type).send(buf);
      } catch {
        /* try next */
      }
    }
    return reply.code(404).send({ error: "Asset not found" });
  });

  // Third-party web chat embed script (IIFE). Hosted on the API origin so
  // <script src="https://api.cep-*.fybud.com/embed/webchat.js"> auto-binds that tenant.
  app.get("/embed/webchat.js", async (_request, reply) => {
    const here = nodePath.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      nodePath.resolve(process.cwd(), "public/embed/webchat.js"),
      nodePath.resolve(here, "../../public/embed/webchat.js"),
    ];
    for (const filePath of candidates) {
      try {
        const buf = await fs.readFile(filePath);
        return reply
          .header("Content-Type", "application/javascript; charset=utf-8")
          .header("Cache-Control", "public, max-age=300")
          .header("Access-Control-Allow-Origin", "*")
          .send(buf);
      } catch {
        /* try next */
      }
    }
    return reply.code(404).send({
      error:
        "webchat.js not found. Build the embed: cd platform-web && npm run build:embed",
    });
  });

  const { default: telemetryRoutes } = await import('./v1/telemetry.routes.js');
  app.register(telemetryRoutes, { prefix: "/api/v1/telemetry" });

  if (process.env.NODE_ENV !== "production") {
    app.post<{
      Body: {
        inboxId?: string;
        from?: string;
        name?: string;
        content?: string;
        subject?: string;
      };
    }>("/api/v1/dev/simulate-inbound", async (request, reply) => {
      const { inboxId, from, name, content, subject } = request.body ?? {};
      if (!inboxId || !from || !content) {
        return reply.code(400).send({ error: "inboxId, from, content required" });
      }

      const inbox = await prisma.channelConfig.findUnique({ where: { id: inboxId } });
      if (!inbox) return reply.code(404).send({ error: "channel config not found" });

      let payload: unknown;
      if (inbox.channelType === "whatsapp") {
        const waFrom = from.replace(/^\+/, "");
        payload = {
          entry: [
            {
              changes: [
                {
                  value: {
                    contacts: [
                      { wa_id: waFrom, profile: { name: name ?? "Simulated" } },
                    ],
                    messages: [
                      {
                        id: `wamid.sim.${ulid()}`,
                        from: waFrom,
                        timestamp: String(Math.floor(Date.now() / 1000)),
                        type: "text",
                        text: { body: content },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };
      } else if (inbox.channelType === "instagram") {
        payload = {
          entry: [
            {
              messaging: [
                {
                  sender: { id: from },
                  timestamp: Date.now(),
                  message: { mid: `mid.sim.${ulid()}`, text: content },
                },
              ],
            },
          ],
        };
      } else if (inbox.channelType === "facebook") {
        payload = {
          object: "page",
          entry: [
            {
              messaging: [
                {
                  sender: { id: from },
                  recipient: { id: "page_sim" },
                  timestamp: Date.now(),
                  message: { mid: `mid.sim.fb.${ulid()}`, text: content },
                },
              ],
            },
          ],
        };
      } else {
        payload = {
          id: `email.sim.${ulid()}`,
          from,
          fromName: name,
          subject: subject ?? "Simulated email",
          text: content,
        };
      }

      const result = await ingestInboundMessages({
        channelConfigId: inbox.id,
        payload,
      });
      return reply.code(201).send(result);
    });
  }
}

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FyBud CEP — Privacy Policy</title>
  <style>
    body{font-family:Georgia,serif;max-width:42rem;margin:2rem auto;padding:0 1.25rem 3rem;line-height:1.55;color:#1a1a1a}
    h1{font-size:1.75rem;margin-bottom:.25rem} h2{font-size:1.15rem;margin-top:1.75rem}
    .meta{color:#555;font-size:.95rem;margin-bottom:1.5rem}
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="meta">FyBud Customer Engagement Platform (CEP)<br/>Last updated: August 6, 2026</p>
  <p>This Privacy Policy describes how FyBud (“we”, “us”) collects, uses, and shares information when you use our Customer Engagement Platform and related messaging integrations (WhatsApp, Instagram, Email/Gmail).</p>
  <h2>1. Information we collect</h2>
  <ul>
    <li>Account information you provide (such as admin credentials for our dashboard).</li>
    <li>Customer communication data processed on your behalf, including message content, sender identifiers (phone numbers, Instagram IDs, email addresses), and related metadata needed for inbox functionality.</li>
    <li>Technical logs used to operate and secure the service.</li>
  </ul>
  <h2>2. How we use information</h2>
  <ul>
    <li>To provide omnichannel inbox, reply, and customer-context features.</li>
    <li>To connect to messaging providers you authorize (Meta, Google).</li>
    <li>To maintain security, troubleshooting, and service reliability.</li>
  </ul>
  <h2>3. Sharing</h2>
  <p>We process messages through the third-party platforms you connect (for example Meta WhatsApp/Instagram APIs and Google Gmail APIs). We do not sell personal information. Infrastructure providers may process data solely to run the service.</p>
  <h2>4. Data retention</h2>
  <p>Message and contact data are retained while needed to provide the service to the business customer, or until deleted by that administrator, subject to legal obligations.</p>
  <h2>5. Security</h2>
  <p>We use reasonable administrative and technical safeguards. No method of transmission over the Internet is 100% secure.</p>
  <h2>6. Your choices</h2>
  <p>Business administrators may disconnect integrations and request deletion of workspace data by contacting us. End customers should contact the business they messaged.</p>
  <h2>7. Children’s privacy</h2>
  <p>The service is not directed to children under 13, and we do not knowingly collect personal information from children.</p>
  <h2>8. Contact</h2>
  <p>Questions about this policy: <strong>fiberai.akesh@gmail.com</strong></p>
  <h2>9. Changes</h2>
  <p>We may update this Privacy Policy from time to time. The “Last updated” date above will change when we do.</p>
</body>
</html>`;

