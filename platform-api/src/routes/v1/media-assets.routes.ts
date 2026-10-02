import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { prisma } from "../../config/db.js";
import multipart from "@fastify/multipart";
import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";

// Note: Ensure @fastify/multipart is registered in server setup, but for safety we export routes
export const mediaAssetRoutes: FastifyPluginAsync = async (app) => {
  // Get all assets
  app.get<{ Querystring: { type?: "image" | "pdf" | "all" } }>(
    "/",
    async (req, reply) => {
      const { type } = req.query;

      let mimeTypeFilter;
      if (type === "image") {
        mimeTypeFilter = { startsWith: "image/" };
      } else if (type === "pdf") {
        mimeTypeFilter = { equals: "application/pdf" };
      }

      const assets = await prisma.mediaAsset.findMany({
        where: mimeTypeFilter ? { mimeType: mimeTypeFilter } : undefined,
        orderBy: { createdAt: "desc" },
      });

      return assets;
    }
  );

  // Upload an asset
  // Requires multipart config. It uses the same upload logic as attachments.
  app.post(
    "/upload",
    async (req, reply) => {
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ error: "No file uploaded" });
      }

      const userId = req.user?.id; // Assuming req.user is set by auth middleware
      const mimeType = data.mimetype;
      const originalName = data.filename;
      const extension = path.extname(originalName) || `.${mime.extension(mimeType) || "bin"}`;
      
      const fileKey = `${uuidv4()}${extension}`;
      const uploadDir = path.join(process.cwd(), "uploads", "assets");
      const filePath = path.join(uploadDir, fileKey);

      await fs.mkdir(uploadDir, { recursive: true });

      const buffer = await data.toBuffer();
      await fs.writeFile(filePath, buffer);

      // We'll serve these from /uploads/assets/
      const url = `/uploads/assets/${fileKey}`;

      const asset = await prisma.mediaAsset.create({
        data: {
          name: originalName,
          url,
          mimeType,
          size: buffer.length,
          uploadedBy: userId,
        },
      });

      return asset;
    }
  );

  // Delete an asset
  app.delete<{ Params: { id: string } }>(
    "/:id",
    async (req, reply) => {
      const { id } = req.params;

      const asset = await prisma.mediaAsset.findUnique({ where: { id } });
      if (!asset) {
        return reply.code(404).send({ error: "Asset not found" });
      }

      // Delete file if it's local
      if (asset.url.startsWith("/uploads/assets/")) {
        const fileKey = asset.url.replace("/uploads/assets/", "");
        const filePath = path.join(process.cwd(), "uploads", "assets", fileKey);
        try {
          await fs.unlink(filePath);
        } catch (err: any) {
          if (err.code !== "ENOENT") {
            req.log.error(`Failed to delete file ${filePath}: ${err.message}`);
          }
        }
      }

      await prisma.mediaAsset.delete({ where: { id } });

      return { success: true };
    }
  );
};
