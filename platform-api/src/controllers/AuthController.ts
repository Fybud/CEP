import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { findOrCreateGoogleUser, listUsers } from "../services/UserService.js";

export class AuthController {
  static async login(
    request: FastifyRequest<{ Body: { credential?: string } }>,
    reply: FastifyReply,
  ) {
    const { credential } = request.body ?? {};

    // Always require a real Google token. MOCK only auto-provisions new users as SUPER_ADMIN.
    if (!credential) {
      return reply.code(400).send({ error: "Google credential required" });
    }

    try {
      let email: string | undefined;
      let googleId: string | undefined;

      // access_token via userinfo
      try {
        const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${credential}` },
        });
        if (userInfoRes.ok) {
          const info = (await userInfoRes.json()) as { email?: string; sub?: string };
          email = info.email;
          googleId = info.sub;
        }
      } catch {
        /* try id_token below */
      }

      if (!email || !googleId) {
        const { OAuth2Client } = await import("google-auth-library");
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload?.email || !payload?.sub) {
          return reply.code(400).send({ error: "Invalid Google token payload" });
        }
        email = payload.email;
        googleId = payload.sub;
      }

      if (!email || !googleId) {
        return reply.code(401).send({ error: "Could not verify Google identity" });
      }

      const user = await findOrCreateGoogleUser(email, googleId);

      if (!user.isActive) {
        return reply.code(403).send({ error: "Account is deactivated" });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        env.jwtSecret,
        { expiresIn: "14d" },
      );

      return reply.code(200).send({
        ok: true,
        token,
        id: user.id,
        role: user.role,
        username: user.username,
      });
    } catch (err: any) {
      const message = err.message || "Google authentication failed";
      const status = /not found|not invited/i.test(message) ? 403 : 401;
      return reply.code(status).send({ error: message });
    }
  }

  static async listUsers(_request: FastifyRequest, reply: FastifyReply) {
    const users = await listUsers();
    return reply.send(users);
  }
}


