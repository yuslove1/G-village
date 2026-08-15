-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyMarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyOrderUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyPriceAlerts" BOOLEAN NOT NULL DEFAULT true;
