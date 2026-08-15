-- AlterTable
ALTER TABLE "SaleRequest" ADD COLUMN     "assignedAgentId" TEXT;

-- CreateIndex
CREATE INDEX "SaleRequest_assignedAgentId_idx" ON "SaleRequest"("assignedAgentId");

-- AddForeignKey
ALTER TABLE "SaleRequest" ADD CONSTRAINT "SaleRequest_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
