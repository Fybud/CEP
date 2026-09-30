-- AlterTable
ALTER TABLE "messages" ADD COLUMN "reactions" JSONB,
ADD COLUMN "quoted_message" JSONB;

-- AlterTable
ALTER TABLE "broadcast_jobs" ADD COLUMN "recurrence" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "suppression_days" INTEGER,
ADD COLUMN "parent_job_id" TEXT;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_replies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canned_replies_shortcut_key" ON "canned_replies"("shortcut");
