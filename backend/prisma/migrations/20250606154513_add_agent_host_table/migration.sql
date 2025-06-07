-- CreateTable
CREATE TABLE "AgentHost" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "osUsername" TEXT NOT NULL,
    "ipAddress" TEXT,
    "agentVersion" TEXT,
    "osInfo" TEXT,
    "additionalData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "approvedByUserId" INTEGER,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "AgentHost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentHost_status_idx" ON "AgentHost"("status");

-- CreateIndex
CREATE INDEX "AgentHost_hostname_idx" ON "AgentHost"("hostname");

-- CreateIndex
CREATE INDEX "AgentHost_approvedByUserId_idx" ON "AgentHost"("approvedByUserId");

-- AddForeignKey
ALTER TABLE "AgentHost" ADD CONSTRAINT "AgentHost_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
