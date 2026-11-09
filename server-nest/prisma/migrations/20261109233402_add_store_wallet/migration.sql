-- CreateEnum
CREATE TYPE "ReturnRefundMethod" AS ENUM ('ORIGINAL_PAYMENT', 'STORE_WALLET', 'MOBILE_WALLET', 'INSTAPAY');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('RETURN_REFUND', 'ORDER_PAYMENT', 'ORDER_REFUND');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "finalAmountPaid" DOUBLE PRECISION,
ADD COLUMN "walletAmountUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN "refundDestinationDetails" TEXT,
ADD COLUMN "refundMethod" "ReturnRefundMethod" NOT NULL DEFAULT 'ORIGINAL_PAYMENT',
ADD COLUMN "walletRefundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "walletBalanceCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "orderId" TEXT,
    "returnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_reference_key" ON "WalletTransaction"("reference");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add Check Constraint
ALTER TABLE "User" ADD CONSTRAINT "User_walletBalanceCents_not_negative" CHECK ("walletBalanceCents" >= 0);