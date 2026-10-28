import { CheckIcon, MapPinIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { formatAddress } from "@/lib/format";
import type { Address } from "@/types";

interface AddressCardProps {
  address: Address;
  /** True while "Make default" is being saved for this address */
  busy?: boolean;
  onEdit: (address: Address) => void;
  onDelete: (address: Address) => void;
  onMakeDefault: (address: Address) => void;
}

export default function AddressCard({
  address,
  busy = false,
  onEdit,
  onDelete,
  onMakeDefault,
}: AddressCardProps) {
  return (
    <article className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <MapPinIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{address.label}</h2>
            {address.isDefault && (
              <span className="badge badge-primary">
                <CheckIcon className="size-3" /> Default
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{formatAddress(address)}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!address.isDefault && (
          <button
            onClick={() => onMakeDefault(address)}
            disabled={busy}
            className="btn btn-ghost btn-sm"
          >
            {busy ? "Saving..." : "Make default"}
          </button>
        )}
        <button
          onClick={() => onEdit(address)}
          className="btn btn-ghost p-2"
          aria-label={`Edit ${address.label}`}
        >
          <PencilIcon className="size-4" />
        </button>
        <button
          onClick={() => onDelete(address)}
          className="btn btn-ghost p-2 hover:text-danger"
          aria-label={`Delete ${address.label}`}
        >
          <Trash2Icon className="size-4" />
        </button>
      </div>
    </article>
  );
}