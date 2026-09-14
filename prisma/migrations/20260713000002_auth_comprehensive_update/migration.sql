-- AlterTable
ALTER TABLE "users" DROP COLUMN "verificationTokenHash",
DROP COLUMN "resetTokenHash",
ADD COLUMN "verificationTokenHash" TEXT,
ADD COLUMN "verificationTokenLookup" TEXT,
ADD COLUMN "resetTokenHash" TEXT,
ADD COLUMN "resetTokenLookup" TEXT;

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "lookupKey",
ADD COLUMN "tokenLookup" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_verificationTokenHash_key" ON "users"("verificationTokenHash");
CREATE UNIQUE INDEX "users_verificationTokenLookup_key" ON "users"("verificationTokenLookup");
CREATE UNIQUE INDEX "users_resetTokenHash_key" ON "users"("resetTokenHash");
CREATE UNIQUE INDEX "users_resetTokenLookup_key" ON "users"("resetTokenLookup");
CREATE UNIQUE INDEX "refresh_tokens_tokenLookup_key" ON "refresh_tokens"("tokenLookup");
CREATE INDEX "refresh_tokens_tokenLookup_idx" ON "refresh_tokens"("tokenLookup");
