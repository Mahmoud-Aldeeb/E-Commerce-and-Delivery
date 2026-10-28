"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import Field from "@/components/admin/field";
import PageHeader from "@/components/admin/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import Modal from "@/components/ui/modal";
import { useDeleteCategory, useSaveCategory } from "@/lib/queries/admin";
import { categoriesOptions } from "@/lib/queries/categories";
import type { StoreCategory } from "@/types";

type Errors = Partial<Record<"name" | "sortOrder", string>>;

function CategoryDialog({
  category,
  onClose,
}: {
  /** Absent = a new category */
  category?: StoreCategory;
  onClose: () => void;
}) {
  const save = useSaveCategory();

  const [name, setName] = useState(category?.name ?? "");
  const [sortOrder, setSortOrder] = useState(category ? String(category.sortOrder) : "");
  const [errors, setErrors] = useState<Errors>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // The same cleaning as the API: spaces around are removed, a run of spaces becomes one
    const cleanName = name.trim().replace(/\s+/g, " ");
    const order = sortOrder.trim() === "" ? undefined : Number(sortOrder);

    const found: Errors = {};
    if (!cleanName) found.name = "Enter the category name.";
    else if (cleanName.length > 60) found.name = "The name must be 60 characters or fewer.";
    else if (cleanName.toLowerCase() === "all") found.name = "This name is reserved. Choose another one.";

    if (order !== undefined && (!Number.isInteger(order) || order < 0 || order > 10000)) {
      found.sortOrder = "Enter a whole number from 0 to 10000.";
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    save.mutate({ id: category?.id, name: cleanName, sortOrder: order }, { onSuccess: onClose });
  }

  // Renaming reaches the products too: say it before the admin does it
  const renameHint =
    category && category.productCount > 0
      ? `Renaming it also changes the category of its ${category.productCount} ${category.productCount === 1 ? "product" : "products"
      }.`
      : undefined;

  return (
    <Modal title={category ? "Edit category" : "New category"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field id="category-name" label="Name" error={errors.name} hint={renameHint}>
          <input
            id="category-name"
            className={`input ${errors.name ? "input-error" : ""}`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            maxLength={60}
            autoFocus
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "category-name-error" : undefined}
          />
        </Field>

        <Field
          id="category-order"
          label="Order"
          error={errors.sortOrder}
          hint={category ? "Lower numbers come first." : "Optional. Left empty, it goes to the end."}
        >
          <input
            id="category-order"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            className={`input ${errors.sortOrder ? "input-error" : ""}`}
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value);
              setErrors((current) => ({ ...current, sortOrder: undefined }));
            }}
            aria-invalid={Boolean(errors.sortOrder)}
            aria-describedby={errors.sortOrder ? "category-order-error" : undefined}
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={save.isPending} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className="btn btn-primary">
            {save.isPending ? "Saving..." : category ? "Save changes" : "Create category"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function CategoriesView() {
  const { data, isPending, isError, refetch } = useQuery(categoriesOptions());
  const deleteCategory = useDeleteCategory();

  // null = closed, "new" = the create form, a category = its edit form
  const [dialog, setDialog] = useState<"new" | StoreCategory | null>(null);
  const [target, setTarget] = useState<StoreCategory | null>(null);

  const categories = data ?? [];

  return (
    <>
      <PageHeader
        title="Categories"
        description={
          data ? `${data.length} ${data.length === 1 ? "category" : "categories"}` : undefined
        }
        action={
          <button onClick={() => setDialog("new")} className="btn btn-primary">
            <PlusIcon className="size-4" /> Add category
          </button>
        }
      />

      {isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the categories"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-canvas text-xs uppercase text-ink-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Products</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Order</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {isPending ? (
                  Array.from({ length: 4 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={4} className="px-5 py-4">
                        <div className="skeleton h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-ink-muted">
                      No categories yet. Add the first one.
                    </td>
                  </tr>
                ) : (
                  categories.map((category) => (
                    <tr key={category.id}>
                      <td className="px-5 py-3 font-medium">{category.name}</td>
                      <td className="px-5 py-3">{category.productCount}</td>
                      <td className="px-5 py-3">{category.sortOrder}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDialog(category)}
                            className="btn btn-ghost p-2"
                            aria-label={`Edit ${category.name}`}
                          >
                            <PencilIcon className="size-4" />
                          </button>
                          <button
                            onClick={() => setTarget(category)}
                            disabled={category.productCount > 0}
                            title={
                              category.productCount > 0
                                ? "Move its products to another category first"
                                : undefined
                            }
                            className="btn btn-ghost p-2 hover:text-danger"
                            aria-label={`Delete ${category.name}`}
                          >
                            <Trash2Icon className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* The key rebuilds the form with the values of the category that was opened */}
      {dialog && (
        <CategoryDialog
          key={dialog === "new" ? "new" : dialog.id}
          category={dialog === "new" ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      )}

      {target && (
        <ConfirmDialog
          title="Delete this category?"
          description={`"${target.name}" has no products and will be removed. This cannot be undone.`}
          confirmLabel="Delete category"
          isPending={deleteCategory.isPending}
          onConfirm={() => deleteCategory.mutate(target.id, { onSuccess: () => setTarget(null) })}
          onCancel={() => setTarget(null)}
        />
      )}
    </>
  );
}