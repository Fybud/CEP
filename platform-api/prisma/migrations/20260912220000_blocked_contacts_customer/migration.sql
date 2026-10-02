-- CreateTable
CREATE TABLE "blocked_contacts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "reason" TEXT,
    "blocked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blocked_contacts_customer_id_key" ON "blocked_contacts"("customer_id");

-- AddForeignKey
ALTER TABLE "blocked_contacts" ADD CONSTRAINT "blocked_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
