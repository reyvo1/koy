-- AlterTable
ALTER TABLE "users" ADD COLUMN "name" TEXT;

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_tenantId_key" ON "memberships"("userId", "tenantId");
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");
CREATE INDEX "memberships_tenantId_idx" ON "memberships"("tenantId");

-- Backfill: Create membership for existing users
INSERT INTO "memberships" ("id", "userId", "tenantId", "role", "status", "updatedAt")
SELECT 
  -- Deterministically generate an ID based on the user ID for consistency.
  -- This approach provides a deterministic ID mapping; it is not collision-free.
  md5('membership:' || "id"),
  "id", 
  "tenantId", 
  'ADMIN', 
  'ACTIVE', 
  CURRENT_TIMESTAMP
FROM "users";

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
