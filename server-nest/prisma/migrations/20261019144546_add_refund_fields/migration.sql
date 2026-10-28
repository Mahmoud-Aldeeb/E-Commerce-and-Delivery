-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentIntentId" TEXT,
ADD COLUMN     "refundId" TEXT,
ADD COLUMN     "refundStatus" TEXT;
