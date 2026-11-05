-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CashSettlement" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashSettlement_partnerId_settledAt_idx" ON "CashSettlement"("partnerId", "settledAt");

-- CreateIndex
CREATE INDEX "Order_deliveredAt_idx" ON "Order"("deliveredAt");

-- AddForeignKey
ALTER TABLE "CashSettlement" ADD CONSTRAINT "CashSettlement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSettlement" ADD CONSTRAINT "CashSettlement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: orders delivered before this column existed. The moment comes from the status history
-- (its last "Delivered" entry), or from the last change of the order when there is none.
-- AT TIME ZONE 'UTC' keeps the value in UTC, which is how Prisma reads this column
UPDATE "Order" AS o
SET "deliveredAt" = COALESCE(
  (
    SELECT ((entry ->> 'timestamp')::timestamptz AT TIME ZONE 'UTC')
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(o."statusHistory") = 'array' THEN o."statusHistory" ELSE '[]'::jsonb END
    ) AS entry
    WHERE entry ->> 'status' = 'Delivered'
    ORDER BY (entry ->> 'timestamp')::timestamptz DESC
    LIMIT 1
  ),
  o."updatedAt"
)
WHERE o."status" = 'Delivered' AND o."deliveredAt" IS NULL;
