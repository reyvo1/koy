-- CreateTable
CREATE TABLE "refresh_token_families" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_token_families_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refresh_token_families_userId_idx" ON "refresh_token_families"("userId");

-- Step 1: Add nullable familyId
ALTER TABLE "refresh_tokens" ADD COLUMN "familyId" TEXT;

-- Step 2: Create a family for each unique user/tenant combination found in existing tokens
INSERT INTO "refresh_token_families" ("id", "userId", "tenantId")
SELECT gen_random_uuid(), "userId", "tenantId"
FROM (SELECT DISTINCT "userId", "tenantId" FROM "refresh_tokens") AS unique_sessions;

-- Step 3: Populate familyId
UPDATE "refresh_tokens" rt
SET "familyId" = rf.id
FROM "refresh_token_families" rf
WHERE rt."userId" = rf."userId" AND rt."tenantId" = rf."tenantId";

-- Step 4: Set familyId to NOT NULL
ALTER TABLE "refresh_tokens" ALTER COLUMN "familyId" SET NOT NULL;

-- Step 5: Add constraint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "refresh_token_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 6: Create index
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");
