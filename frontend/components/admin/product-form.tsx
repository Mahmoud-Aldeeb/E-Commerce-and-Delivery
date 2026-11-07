"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PackageIcon, TriangleAlertIcon } from "lucide-react";
import Field from "@/components/admin/field";
import ImageGallery from "@/components/admin/image-gallery";
import PageHeader from "@/components/admin/page-header";
import VariantsEditor from "@/components/admin/variants-editor";
import EmptyState from "@/components/ui/empty-state";
import PageLoader from "@/components/ui/page-loader";
import { getErrorStatus } from "@/lib/api";
import { useSaveProduct } from "@/lib/queries/admin";
import { categoriesOptions } from "@/lib/queries/categories";
import { productDetailOptions } from "@/lib/queries/products";
import {
  checkVariantRows,
  rowsFromVariants,
  toPayload,
  totalStock,
  type VariantCheck,
  type VariantRow,
} from "@/lib/variants";
import type { Product } from "@/types";

type FormField =
  | "name"
  | "description"
  | "category"
  | "price"
  | "originalPrice"
  | "stock"
  | "brand"
  | "material";
type Errors = Partial<Record<FormField | "images", string>>;

function ProductFormBody({ product }: { product?: Product }) {
  const router = useRouter();
  const save = useSaveProduct();

  // The categories come from the API: a category added in the admin panel shows up here at once
  const categoriesQuery = useQuery(categoriesOptions());
  const categories = categoriesQuery.data ?? [];

  // The stock of a product with options is the TOTAL of its options, not a number to start from:
  // if the admin removes every option, the stock must be said again
  const hadVariants = (product?.variantCount ?? 0) > 0;

  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "",
    price: product ? String(product.price) : "",
    originalPrice: product?.originalPrice ? String(product.originalPrice) : "",
    stock: product && !hadVariants && product.stock != null ? String(product.stock) : "",
    brand: product?.brand ?? "",
    material: product?.material ?? "",
  });
  // The main image first, then the others
  const [images, setImages] = useState<string[]>(() =>
    product ? [product.image, ...product.images] : [],
  );
  const [rows, setRows] = useState<VariantRow[]>(() => rowsFromVariants(product?.variants));
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [variantCheck, setVariantCheck] = useState<VariantCheck | null>(null);

  const hasRows = rows.length > 0;

  function setField(name: FormField, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  // Props shared by every text field: value, change handler and the accessible error link
  const inputProps = (name: FormField, id: string) => ({
    id,
    value: form[name],
    className: `input ${errors[name] ? "input-error" : ""}`,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => setField(name, event.target.value),
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${id}-error` : undefined,
  });

  function addImage(url: string) {
    setImages((current) => (current.includes(url) ? current : [...current, url]));
    setErrors((current) => ({ ...current, images: undefined }));
  }

  function makeMain(url: string) {
    setImages((current) => [url, ...current.filter((image) => image !== url)]);
  }

  function removeImage(url: string) {
    setImages((current) => current.filter((image) => image !== url));
    // An option cannot show an image the product no longer has
    setRows((current) => current.map((row) => (row.image === url ? { ...row, image: "" } : row)));
  }

  function changeRows(next: VariantRow[]) {
    setRows(next);
    setVariantCheck(null); // the old messages no longer describe what is on the screen
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const price = Number(form.price);
    const originalPrice = form.originalPrice === "" ? 0 : Number(form.originalPrice);
    const stock = Number(form.stock);

    const found: Errors = {};
    if (!form.name.trim()) found.name = "Enter the product name.";
    if (!form.category) found.category = "Choose a category.";
    if (form.brand.trim().length > 60) found.brand = "60 characters or fewer.";
    if (form.material.trim().length > 100) found.material = "100 characters or fewer.";
    if (form.price === "" || !Number.isFinite(price) || price <= 0) {
      found.price = "Enter a price above 0.";
    }
    if (form.originalPrice !== "" && (!Number.isFinite(originalPrice) || originalPrice <= price)) {
      found.originalPrice = "It must be higher than the price (or leave it empty).";
    }
    // With options the stock is their total: there is nothing to enter
    if (!hasRows && (form.stock === "" || !Number.isInteger(stock) || stock < 0)) {
      found.stock = "Enter a whole number, 0 or more.";
    }
    if (images.length === 0) found.images = "Add at least one product image.";

    const check = checkVariantRows(rows);

    setErrors(found);
    setVariantCheck(check);
    if (Object.keys(found).length > 0 || !check.ok) return;

    save.mutate(
      {
        id: product?.id,
        name: form.name.trim(),
        description: form.description.trim(),
        brand: form.brand.trim(),
        material: form.material.trim(),
        category: form.category,
        price,
        originalPrice,
        image: images[0],
        images: images.slice(1),
        variants: toPayload(rows, images),
        // The API refuses a stock that comes with options
        ...(hasRows ? {} : { stock }),
      },
      { onSuccess: () => router.push("/admin/products") },
    );
  }

  const knownCategory = categories.some((item) => item.name === form.category);

  return (
    <>
      <PageHeader
        title={product ? "Edit product" : "New product"}
        description={product ? product.name : "Add a product to your catalog."}
      />

      <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card space-y-4 p-6">
            <Field id="product-name" label="Name" error={errors.name}>
              <input {...inputProps("name", "product-name")} />
            </Field>

            <Field id="product-category" label="Category" error={errors.category}>
              <select {...inputProps("category", "product-category")} disabled={categoriesQuery.isPending}>
                <option value="">
                  {categoriesQuery.isPending ? "Loading categories..." : "Select a category"}
                </option>
                {!categoriesQuery.isPending && !knownCategory && form.category && (
                  <option value={form.category}>{form.category} (not in the list)</option>
                )}
                {categories.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
              {categoriesQuery.isError && (
                <p role="alert" className="field-error">
                  We couldn&apos;t load the categories.{" "}
                  <button
                    type="button"
                    onClick={() => categoriesQuery.refetch()}
                    className="font-medium underline"
                  >
                    Try again
                  </button>
                </p>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="product-price" label="Price ($)" error={errors.price}>
                <input type="number" step="0.01" min="0" inputMode="decimal" {...inputProps("price", "product-price")} />
              </Field>
              <Field
                id="product-original-price"
                label="Original price ($)"
                error={errors.originalPrice}
                hint="Optional. Shows a discount."
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  {...inputProps("originalPrice", "product-original-price")}
                />
              </Field>
              {hasRows ? (
                <Field id="product-stock" label="Stock" hint="The total of the options below.">
                  <input id="product-stock" className="input" value={totalStock(rows)} readOnly />
                </Field>
              ) : (
                <Field
                  id="product-stock"
                  label="Stock"
                  error={errors.stock}
                  hint={hadVariants ? "You removed every option: enter the stock of the product." : undefined}
                >
                  <input type="number" step="1" min="0" inputMode="numeric" {...inputProps("stock", "product-stock")} />
                </Field>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="product-brand" label="Brand" error={errors.brand} hint="Optional.">
                <input {...inputProps("brand", "product-brand")} maxLength={60} />
              </Field>
              <Field id="product-material" label="Material" error={errors.material} hint="Optional, for example 100% cotton.">
                <input {...inputProps("material", "product-material")} maxLength={100} />
              </Field>
            </div>

            <Field id="product-description" label="Description" error={errors.description}>
              <textarea rows={5} {...inputProps("description", "product-description")} />
            </Field>
          </div>

          <VariantsEditor
            rows={rows}
            onChange={changeRows}
            images={images}
            errors={variantCheck?.rows ?? {}}
            general={variantCheck?.general}
          />
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <p className="field-label">Product images</p>
            <ImageGallery
              images={images}
              onAdd={addImage}
              onMakeMain={makeMain}
              onRemove={removeImage}
              onUploadingChange={setUploading}
              error={errors.images}
            />
          </div>

          <div className="flex gap-3">
            <Link href="/admin/products" className="btn btn-secondary flex-1">
              Cancel
            </Link>
            <button type="submit" disabled={save.isPending || uploading} className="btn btn-primary flex-1">
              {uploading
                ? "Uploading images..."
                : save.isPending
                  ? "Saving..."
                  : product
                    ? "Save changes"
                    : "Create product"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

export default function ProductForm({ productId }: { productId?: string }) {
  const { data: product, isPending, isError, error, refetch } = useQuery({
    ...productDetailOptions(productId ?? ""),
    enabled: Boolean(productId),
  });

  if (!productId) return <ProductFormBody />;
  if (isPending) return <PageLoader />;

  if (isError || !product) {
    const notFound = getErrorStatus(error) === 404;
    return (
      <EmptyState
        icon={notFound ? PackageIcon : TriangleAlertIcon}
        title={notFound ? "Product not found" : "We couldn't load this product"}
        action={
          notFound ? (
            <Link href="/admin/products" className="btn btn-primary">
              Back to products
            </Link>
          ) : (
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          )
        }
      />
    );
  }

  // The key rebuilds the form with this product's values when another product is opened
  return <ProductFormBody key={product.id} product={product} />;
}