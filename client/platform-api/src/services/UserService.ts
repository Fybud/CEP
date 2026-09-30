import { ulid } from "ulid";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";

export async function findOrCreateGoogleUser(email: string, googleId: string) {
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || "fiberai.akesh@gmail.com").toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  let user = await prisma.user.findUnique({ where: { username: normalizedEmail } });
  // Also try original casing if older rows used mixed case
  if (!user && normalizedEmail !== email) {
    user = await prisma.user.findUnique({ where: { username: email } });
  }

  const isBootstrapAdmin = normalizedEmail === adminEmail;
  /** Demo / App Review: any Google login not in DB is provisioned as SUPER_ADMIN */
  const allowAutoProvision = isBootstrapAdmin || env.MOCK;

  if (!user) {
    if (!allowAutoProvision) {
      throw new Error("User not found or not invited to this workspace.");
    }
    user = await prisma.user.create({
      data: {
        id: ulid(),
        username: normalizedEmail,
        googleId,
        role: "SUPER_ADMIN" as any,
        isActive: true,
      },
    });
    return user;
  }

  if (!user.googleId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId },
    });
  }

  if (allowAutoProvision && (user.role !== "SUPER_ADMIN" || !user.isActive)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "SUPER_ADMIN" as any, isActive: true },
    });
  }

  return user;
}

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
