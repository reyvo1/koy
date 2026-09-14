-- AlterTable
ALTER TABLE "users" DROP COLUMN "verificationToken",
DROP COLUMN "resetToken",
ADD COLUMN "verificationTokenHash" TEXT,
ADD COLUMN "resetTokenHash" TEXT;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "lookupKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_verificationTokenHash_key" ON "users"("verificationTokenHash");
CREATE UNIQUE INDEX "users_resetTokenHash_key" ON "users"("resetTokenHash");
CREATE UNIQUE INDEX "refresh_tokens_lookupKey_key" ON "refresh_tokens"("lookupKey");
CREATE INDEX "refresh_tokens_lookupKey_idx" ON "refresh_tokens"("lookupKey");
