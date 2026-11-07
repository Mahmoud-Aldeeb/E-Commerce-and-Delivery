"use client";

import { useState } from "react";
import { RulerIcon } from "lucide-react";
import Modal from "@/components/ui/modal";
import { sizeGuide } from "@/config/site";

// A link that opens the size chart of the store
export default function SizeGuide() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline"
      >
        <RulerIcon className="size-4" /> Size guide
      </button>

      {open && (
        <Modal title="Size guide" onClose={() => setOpen(false)} maxWidth="max-w-lg">
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-canvas text-xs uppercase text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">Size</th>
                  {sizeGuide.columns.map((column) => (
                    <th key={column} scope="col" className="px-4 py-2 text-right font-semibold">
                      {column} (cm)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sizeGuide.rows.map((row) => (
                  <tr key={row.size}>
                    <th scope="row" className="px-4 py-2 font-semibold">{row.size}</th>
                    {row.values.map((value, index) => (
                      <td key={sizeGuide.columns[index]} className="px-4 py-2 text-right">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-muted">{sizeGuide.note}</p>
        </Modal>
      )}
    </>
  );
}