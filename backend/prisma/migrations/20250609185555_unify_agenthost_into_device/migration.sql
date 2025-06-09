/*
  Warnings:

  - You are about to drop the `AgentHost` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[agentId]` on the table `Device` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "AgentHost" DROP CONSTRAINT "AgentHost_approvedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_userId_fkey";

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "additionalData" JSONB,
ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "agentVersion" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "firstSeenAt" TIMESTAMP(3),
ADD COLUMN     "hostname" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "osInfo" TEXT,
ADD COLUMN     "osUsername" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ALTER COLUMN "userId" DROP NOT NULL;

-- DropTable
DROP TABLE "AgentHost";

-- CreateIndex
CREATE UNIQUE INDEX "Device_agentId_key" ON "Device"("agentId");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "Device_hostname_idx" ON "Device"("hostname");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "Device_agentId_idx" ON "Device"("agentId");

-- CreateIndex
CREATE INDEX "Device_source_idx" ON "Device"("source");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
