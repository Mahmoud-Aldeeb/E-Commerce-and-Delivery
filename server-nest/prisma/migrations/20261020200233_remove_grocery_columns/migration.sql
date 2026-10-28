/*
  Warnings:

  - You are about to drop the column `isOrganic` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "isOrganic",
DROP COLUMN "unit";
