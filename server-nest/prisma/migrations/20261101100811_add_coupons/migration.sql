-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "maxDiscount" DOUBLE PRECISION,
    "minSubtotal" DOUBLE PRECISION,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Order_couponId_idx" ON "Order"("couponId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
