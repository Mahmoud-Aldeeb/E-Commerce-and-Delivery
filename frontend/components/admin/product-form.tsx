"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, PackageIcon, TriangleAlertIcon } from "lucide-react";
import Field from "@/components/admin/field";
import PageHeader from "@/components/admin/page-header";
import EmptyState from "@/components/ui/empty-state";
import PageLoader from "@/components/ui/page-loader";
import { getErrorStatus } from "@/lib/api";
import { useSaveProduct } from "@/lib/queries/admin";
import { categoriesOptions } from "@/lib/queries/categories";
import { productDetailOptions } from "@/lib/queries/products";
import type { Product } from "@/types";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // the API refuses bigger uploads
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

type FormField = "name" | "description" | "category" | "price" | "originalPrice" | "stock";
type Errors = Partial<Record<FormField | "image", string>>;

function ProductFormBody({ product }: { product?: Product }) {
  const router = useRouter();
  const save = useSaveProduct();

  // The categories come from the API: a category added in the admin panel shows up here at once
  const categoriesQuery = useQuery(categoriesOptions());
  const categories = categoriesQuery.data ?? [];

  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "",
    price: product ? String(product.price) : "",
    originalPrice: product?.originalPrice ? String(product.originalPrice) : "",
    stock: product?.stock != null ? String(product.stock) : "",
  });
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  // Release the temporary preview address when the image changes or the form closes
  useEffect(() => {
    return () => {
      if (picked) URL.revokeObjectURL(picked.url);
    };
  }, [picked]);

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

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!IMAGE_TYPES.includes(file.type)) {
      setErrors((current) => ({ ...current, image: "Use a JPEG, PNG, WebP, GIF or AVIF image." }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((current) => ({ ...current, image: "The image must be 4 MB or smaller." }));
      return;
    }
    setErrors((current) => ({ ...current, image: undefined }));
    setPicked({ file, url: URL.createObjectURL(file) });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const price = Number(form.price);
    const originalPrice = form.originalPrice === "" ? 0 : Number(form.originalPrice);
    const stock = Number(form.stock);

    const found: Errors = {};
    if (!form.name.trim()) found.name = "Enter the product name.";
    if (!form.category) found.category = "Choose a category.";
    if (form.price === "" || !Number.isFinite(price) || price <= 0) {
      found.price = "Enter a price above 0.";
    }
    if (form.originalPrice !== "" && (!Number.isFinite(originalPrice) || originalPrice <= price)) {
      found.originalPrice = "It must be higher than the price (or leave it empty).";
    }
    if (form.stock === "" || !Number.isInteger(stock) || stock < 0) {
      found.stock = "Enter a whole number, 0 or more.";
    }
    if (!picked && !product?.image) found.image = "Add a product image.";

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    save.mutate(
      {
        id: product?.id,
        imageFile: picked?.file,
        image: product?.image ?? "",
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        price,
        originalPrice,
        stock,
      },
      { onSuccess: () => router.push("/admin/products") },
    );
  }

  const knownCategory = categories.some((item) => item.name === form.category);
  const previewSrc = picked?.url ?? product?.image;

  return (
    <>
      <PageHeader
        title={product ? "Edit product" : "New product"}
        description={product ? product.name : "Add a product to your catalog."}
      />

      <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-4 p-6 lg:col-span-2">
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
            <Field id="product-stock" label="Stock" error={errors.stock}>
              <input type="number" step="1" min="0" inputMode="numeric" {...inputProps("stock", "product-stock")} />
            </Field>
          </div>

          <Field id="product-description" label="Description" error={errors.description}>
            <textarea rows={5} {...inputProps("description", "product-description")} />
          </Field>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <p className="field-label">Product image</p>
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-card border border-line bg-canvas text-line-strong">
              {previewSrc ? (
                <Image
                  src={previewSrc}
                  alt="Product preview"
                  fill
                  sizes="320px"
                  unoptimized={Boolean(picked)}
                  className="object-contain p-2"
                />
              ) : (
                <ImageIcon className="size-12" />
              )}
            </div>
            <input
              type="file"
              accept={IMAGE_TYPES.join(",")}
              onChange={handleFile}
              aria-label="Choose a product image"
              aria-invalid={Boolean(errors.image)}
              className="mt-3 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-800 hover:file:bg-primary-100"
            />
            {errors.image ? (
              <p role="alert" className="field-error">
                {errors.image}
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-muted">JPEG, PNG, WebP, GIF or AVIF. Up to 4 MB.</p>
            )}
          </div>

          <div className="flex gap-3">
            <Link href="/admin/products" className="btn btn-secondary flex-1">
              Cancel
            </Link>
            <button type="submit" disabled={save.isPending} className="btn btn-primary flex-1">
              {save.isPending ? "Saving..." : product ? "Save changes" : "Create product"}
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