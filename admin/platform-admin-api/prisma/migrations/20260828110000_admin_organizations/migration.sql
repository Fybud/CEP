-- Admin registry: client connection details and replay configuration.
CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "websiteUrl" TEXT NOT NULL,
  "dbName" TEXT NOT NULL,
  "db_url" TEXT,
  "openreplayProjectKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_dbName_key"
  ON "Organization"("dbName");
