"use client";

import { useState } from "react";
import { MapPinIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import AddressCard from "@/components/address/address-card";
import AddressFormDialog from "@/components/address/address-form-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import {
  addressesOptions,
  useDeleteAddress,
  useSaveAddress,
} from "@/lib/queries/addresses";
import type { Address } from "@/types";

export default function AddressesView() {
  const { data, isPending, isError, refetch } = useQuery(addressesOptions());
  const saveAddress = useSaveAddress();
  const deleteAddress = useDeleteAddress();

  // "new" opens the form empty; an address opens it for editing
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  const addresses = data ?? [];
  const busyId = saveAddress.isPending ? saveAddress.variables?.id : undefined;

  function makeDefault(address: Address) {
    saveAddress.mutate(
      {
        id: address.id,
        label: address.label,
        address: address.address,
        city: address.city,
        state: address.state,
        zip: address.zip,
        lat: address.lat,
        lng: address.lng,
        isDefault: true,
      },
      { onSuccess: () => toast.success("Default address updated") },
    );
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteAddress.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Address removed");
        setDeleting(null);
      },
    });
  }

  const addButton = (
    <button onClick={() => setEditing("new")} className="btn btn-primary">
      <PlusIcon className="size-4" />
      Add address
    </button>
  );

  return (
    <div className="container-page max-w-3xl py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My addresses</h1>
          <p className="mt-1 text-sm text-ink-muted">Where should we deliver your orders?</p>
        </div>
        {addresses.length > 0 && addButton}
      </div>

      {isPending ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="card flex gap-4 p-5">
              <div className="skeleton size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-24" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load your addresses"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={MapPinIcon}
          title="No addresses yet"
          description="Save an address to check out faster."
          action={addButton}
        />
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              busy={busyId === address.id}
              onEdit={setEditing}
              onDelete={setDeleting}
              onMakeDefault={makeDefault}
            />
          ))}
        </div>
      )}

      {editing && (
        <AddressFormDialog
          key={editing === "new" ? "new" : editing.id}
          address={editing === "new" ? undefined : editing}
          hasAddresses={addresses.length > 0}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this address?"
          description={`"${deleting.label}" will be removed from your account. Your past orders are not affected.`}
          confirmLabel="Delete"
          isPending={deleteAddress.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}