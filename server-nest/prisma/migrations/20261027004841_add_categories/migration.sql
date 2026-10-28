-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- Data: the six categories that were hard-coded in the frontend (config/site.ts).
-- They must exist BEFORE the foreign key, because the existing products already use these slugs.
INSERT INTO "Category" ("id", "slug", "name", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, 'electronics', 'Electronics', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'fashion', 'Fashion', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'home-kitchen', 'Home & Kitchen', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'beauty-health', 'Beauty & Health', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'sports-outdoors', 'Sports & Outdoors', 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'toys-games', 'Toys & Games', 6, CURRENT_TIMESTAMP);

-- Data: any other category name a product already uses (for example one typed by hand
-- in the admin form), so the foreign key below can never fail. The admin can rename it later.
INSERT INTO "Category" ("id", "slug", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, p."category", p."category", 100, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" FROM "Product") AS p
WHERE NOT EXISTS (SELECT 1 FROM "Category" AS c WHERE c."slug" = p."category");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_category_fkey" FOREIGN KEY ("category") REFERENCES "Category"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;