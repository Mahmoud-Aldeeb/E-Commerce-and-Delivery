"use client";

import { useState } from "react";
import { ChevronRightIcon, MapPinIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import AddressFormDialog from "@/components/address/address-form-dialog";
import EmptyState from "@/components/ui/empty-state";
import { formatAddress } from "@/lib/format";
import type { Address } from "@/types";
import PhoneCard from "@/components/checkout/phone-card";

interface AddressStepProps {
  addresses: Address[];
  /** The address in use (already resolved by the parent: the chosen one, the default or the first) */
  selectedId: string | null;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onContinue: () => void;
  /** The customer has a phone number saved: the courier needs it */
  phoneReady: boolean;
}

export default function AddressStep({
  addresses,
  selectedId,
  isPending,
  isError,
  onRetry,
  onSelect,
  onContinue,
}: AddressStepProps) {
  const [adding, setAdding] = useState(false);

  // The address that was not in the list before saving is the new one: select it
  const handleSaved = (updated: Address[]) => {
    const created = updated.find((item) => !addresses.some((known) => known.id === item.id));
    if (created) onSelect(created.id);
  };

  const dialog = adding && (
    <AddressFormDialog
      hasAddresses={addresses.length > 0}
      onClose={() => setAdding(false)}
      onSaved={handleSaved}
    />
  );

  if (isPending) {
    return (
      <div className="card space-y-3 p-6" aria-busy="true">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={TriangleAlertIcon}
        title="We couldn't load your addresses"
        action={
          <button onClick={onRetry} className="btn btn-secondary">
            Try again
          </button>
        }
      />
    );
  }

  if (addresses.length === 0) {
    return (
      <>
        <EmptyState
          icon={MapPinIcon}
          title="Where should we deliver?"
          description="Add a delivery address to continue."
          action={
            <button onClick={() => setAdding(true)} className="btn btn-primary">
              <PlusIcon className="size-4" />
              Add address
            </button>
          }
        />
        {dialog}
      </>
    );
  }

  return (
    <section className="card animate-fade-in p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <MapPinIcon className="size-5 text-primary-700" /> Delivery address
      </h2>

      <fieldset>
        <legend className="sr-only">Choose a delivery address</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => {
            const selected = address.id === selectedId;
            return (
              <label
                key={address.id}
                className={`block cursor-pointer rounded-card border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary-600/30 ${selected
                  ? "border-primary-600 bg-primary-50"
                  : "border-line hover:border-line-strong"
                  }`}
              >
                <input
                  type="radio"
                  name="delivery-address"
                  className="sr-only"
                  checked={selected}
                  onChange={() => onSelect(address.id)}
                />
                <span className="flex items-center gap-2">
                  <MapPinIcon className="size-4 text-primary-700" />
                  <span className="text-sm font-semibold">{address.label}</span>
                  {address.isDefault && <span className="badge badge-primary">Default</span>}
                </span>
                <span className="mt-1 block text-sm text-ink-soft">{formatAddress(address)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <button onClick={() => setAdding(true)} className="btn btn-secondary mt-4">
        <PlusIcon className="size-4" />
        Add a new address
      </button>
      <div className="mt-6">
        <PhoneCard />
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={onContinue} disabled={!selectedId} className="btn btn-primary btn-lg">
          Continue to payment <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {dialog}
    </section>
  );
}