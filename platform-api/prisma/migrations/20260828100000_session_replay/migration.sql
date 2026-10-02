-- Store client-side rrweb sessions and events for the platform admin replay viewer.
CREATE TABLE IF NOT EXISTS "FeatureFlag" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "UserSession" (
  "id" TEXT NOT NULL,
  "browser" TEXT,
  "os" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SessionEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SessionEvent_sessionId_idx"
  ON "SessionEvent"("sessionId");
