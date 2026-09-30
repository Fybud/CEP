/*
  Warnings:

  - You are about to drop the column `password_hash` on the `users` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ContentType" ADD VALUE 'template';

-- DropIndex
DROP INDEX "SessionEvent_sessionId_idx";

-- DropIndex
DROP INDEX "instagram_channel_last_customer_message_at_idx";

-- DropIndex
DROP INDEX "whatsapp_channel_last_customer_message_at_idx";

-- DropIndex
DROP INDEX "whatsapp_templates_status_idx";

-- AlterTable
ALTER TABLE "channels_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "email_channel" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "instagram_channel" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "shopify_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tickets" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password_hash",
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "whatsapp_channel" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "whatsapp_templates" ADD COLUMN     "quality_score" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "messages_customer_id_channel_type_external_thread_id_created_at" RENAME TO "messages_customer_id_channel_type_external_thread_id_create_idx";
