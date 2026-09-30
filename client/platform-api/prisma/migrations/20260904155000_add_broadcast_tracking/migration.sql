-- CreateTable
CREATE TABLE "broadcast_jobs" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "total" INTEGER NOT NULL,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_recipients" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "message_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcast_recipients_job_id_idx" ON "broadcast_recipients"("job_id");

-- CreateIndex
CREATE INDEX "broadcast_recipients_message_id_idx" ON "broadcast_recipients"("message_id");

-- AddForeignKey
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "broadcast_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
