-- The foreign key goes first, so the update below is allowed
ALTER TABLE "Product" DROP CONSTRAINT "Product_category_fkey";

-- Data: every product now stores the NAME of its category instead of the slug.
-- This must run before the slug column is dropped
UPDATE "Product" AS p
SET "category" = c."name"
FROM "Category" AS c
WHERE p."category" = c."slug";

-- DropIndex
DROP INDEX "Category_slug_key";

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "iconUrl",
DROP COLUMN "slug";

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_category_fkey" FOREIGN KEY ("category") REFERENCES "Category"("name") ON DELETE RESTRICT ON UPDATE CASCADE;