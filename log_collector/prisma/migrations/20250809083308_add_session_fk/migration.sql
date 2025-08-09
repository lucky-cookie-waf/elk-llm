-- AlterTable
ALTER TABLE "RawLog" ADD COLUMN     "sessionId" INTEGER;

-- CreateIndex
CREATE INDEX "RawLog_sessionId_idx" ON "RawLog"("sessionId");

-- AddForeignKey
ALTER TABLE "RawLog" ADD CONSTRAINT "RawLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
