-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionChecklistResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,

    CONSTRAINT "InspectionChecklistResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_isActive_order_idx" ON "ChecklistItem"("isActive", "order");

-- CreateIndex
CREATE INDEX "InspectionChecklistResult_inspectionId_idx" ON "InspectionChecklistResult"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionChecklistResult_inspectionId_checklistItemId_key" ON "InspectionChecklistResult"("inspectionId", "checklistItemId");

-- AddForeignKey
ALTER TABLE "InspectionChecklistResult" ADD CONSTRAINT "InspectionChecklistResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionChecklistResult" ADD CONSTRAINT "InspectionChecklistResult_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
