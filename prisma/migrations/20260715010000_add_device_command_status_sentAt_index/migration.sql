-- CreateIndex
CREATE INDEX "device_commands_status_sentAt_idx"
ON "device_commands"("status", "sentAt");