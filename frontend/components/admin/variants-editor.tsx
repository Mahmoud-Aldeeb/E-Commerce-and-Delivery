"use client";

import { Fragment } from "react";
import Image from "next/image";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { emptyRow, MAX_VARIANTS, totalStock, type RowErrors, type VariantRow } from "@/lib/variants";

interface VariantsEditorProps {
  rows: VariantRow[];
  onChange: (rows: VariantRow[]) => void;
  /** The images of the product, the main one first: an option can show one of them */
  images: string[];
  /** By the key of the row */
  errors: Record<string, RowErrors>;
  general?: string;
}

export default function VariantsEditor({ rows, onChange, images, errors, general }: VariantsEditorProps) {
  const update = (key: string, patch: Partial<VariantRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const inputClass = (error?: string) => `input ${error ? "input-error" : ""}`;

  return (
    <section className="card p-6" aria-labelledby="variants-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="variants-heading" className="font-semibold">
            Options (sizes and colours)
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            For clothes: every option has its own stock. Leave this empty for a product without options.
          </p>
        </div>
        {rows.length > 0 && (
          <p className="text-sm text-ink-soft">
            Total stock: <strong>{totalStock(rows)}</strong>
          </p>
        )}
      </div>

      {general && (
        <p role="alert" className="field-error mb-3">
          {general}
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs uppercase text-ink-muted">
              <tr>
                <th scope="col" className="pb-2 pr-2 font-semibold">Size</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">Colour</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">Stock</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">Image</th>
                <th scope="col" className="pb-2 text-right font-semibold">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowErrors = errors[row.key] ?? {};
                const messages = Object.values(rowErrors);

                return (
                  <Fragment key={row.key}>
                    <tr>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          className={inputClass(rowErrors.size)}
                          value={row.size}
                          onChange={(event) => update(row.key, { size: event.target.value })}
                          maxLength={20}
                          placeholder="M"
                          aria-label={`Size of option ${index + 1}`}
                          aria-invalid={Boolean(rowErrors.size)}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          className={inputClass(rowErrors.color)}
                          value={row.color}
                          onChange={(event) => update(row.key, { color: event.target.value })}
                          maxLength={30}
                          placeholder="Black"
                          aria-label={`Colour of option ${index + 1}`}
                          aria-invalid={Boolean(rowErrors.color)}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          inputMode="numeric"
                          className={inputClass(rowErrors.stock)}
                          value={row.stock}
                          onChange={(event) => update(row.key, { stock: event.target.value })}
                          aria-label={`Stock of option ${index + 1}`}
                          aria-invalid={Boolean(rowErrors.stock)}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <div className="flex items-center gap-2">
                          {row.image && images.includes(row.image) && (
                            <Image
                              src={row.image}
                              alt=""
                              width={32}
                              height={32}
                              className="size-8 shrink-0 rounded-control bg-canvas object-cover"
                            />
                          )}
                          <select
                            className="input"
                            value={row.image}
                            onChange={(event) => update(row.key, { image: event.target.value })}
                            aria-label={`Image of option ${index + 1}`}
                          >
                            <option value="">None</option>
                            {images.map((src, position) => (
                              <option key={src} value={src}>
                                {`Image ${position + 1}${position === 0 ? " (main)" : ""}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="py-1.5 text-right align-top">
                        <button
                          type="button"
                          onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                          className="btn btn-ghost p-2 hover:text-danger"
                          aria-label={`Remove option ${index + 1}`}
                        >
                          <Trash2Icon className="size-4" />
                        </button>
                      </td>
                    </tr>
                    {messages.length > 0 && (
                      <tr>
                        <td colSpan={5} className="pb-2">
                          <p role="alert" className="field-error">
                            Option {index + 1}: {messages.join(" ")}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...rows, emptyRow()])}
        disabled={rows.length >= MAX_VARIANTS}
        className="btn btn-secondary btn-sm mt-4"
      >
        <PlusIcon className="size-4" /> Add an option
      </button>

      {rows.some((row) => row.id) && (
        <p className="mt-3 text-xs text-ink-muted">
          An option you remove is deleted when you save. Orders already placed keep their own copy of it.
        </p>
      )}
    </section>
  );
}