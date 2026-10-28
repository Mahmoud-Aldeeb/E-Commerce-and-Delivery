"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MailIcon, PhoneIcon, PlusIcon, TriangleAlertIcon, TruckIcon } from "lucide-react";
import Field from "@/components/admin/field";
import PageHeader from "@/components/admin/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import Modal from "@/components/ui/modal";
import { partnersOptions, useCreatePartner, useTogglePartner } from "@/lib/queries/admin";
import type { DeliveryPartner } from "@/types";

const VEHICLES: { value: DeliveryPartner["vehicleType"]; label: string }[] = [
  { value: "bike", label: "Bike" },
  { value: "scooter", label: "Scooter" },
  { value: "car", label: "Car" },
];

type PartnerField = "name" | "email" | "password" | "phone";

function NewPartnerDialog({ onClose }: { onClose: () => void }) {
  const create = useCreatePartner();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    vehicleType: "bike" as DeliveryPartner["vehicleType"],
  });
  const [errors, setErrors] = useState<Partial<Record<PartnerField, string>>>({});

  function setField(name: PartnerField, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  const inputClass = (name: PartnerField) => `input ${errors[name] ? "input-error" : ""}`;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const values = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };

    const found: Partial<Record<PartnerField, string>> = {};
    if (!values.name) found.name = "Enter the full name.";
    if (!/^\S+@\S+\.\S+$/.test(values.email)) found.email = "Enter a valid email.";
    if (values.password.length < 6) found.password = "At least 6 characters.";
    if (!values.phone) found.phone = "Enter a phone number.";

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    create.mutate(values, { onSuccess: onClose });
  }

  return (
    <Modal title="Add a delivery partner" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field id="partner-name" label="Full name" error={errors.name}>
          <input
            id="partner-name"
            className={inputClass("name")}
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            autoComplete="off"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="partner-email" label="Email" error={errors.email}>
            <input
              id="partner-email"
              type="email"
              className={inputClass("email")}
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field id="partner-password" label="Password" error={errors.password} hint="They sign in with it.">
            <input
              id="partner-password"
              type="password"
              className={inputClass("password")}
              value={form.password}
              onChange={(event) => setField("password", event.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="partner-phone" label="Phone" error={errors.phone}>
            <input
              id="partner-phone"
              type="tel"
              className={inputClass("phone")}
              value={form.phone}
              onChange={(event) => setField("phone", event.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field id="partner-vehicle" label="Vehicle">
            <select
              id="partner-vehicle"
              className="input"
              value={form.vehicleType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  vehicleType: event.target.value as DeliveryPartner["vehicleType"],
                }))
              }
            >
              {VEHICLES.map((vehicle) => (
                <option key={vehicle.value} value={vehicle.value}>
                  {vehicle.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={create.isPending} className="btn btn-primary">
            {create.isPending ? "Creating..." : "Create partner"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PartnersView() {
  const { data, isPending, isError, refetch } = useQuery(partnersOptions());
  const toggle = useTogglePartner();

  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<DeliveryPartner | null>(null);

  const partners = data ?? [];
  const addButton = (
    <button onClick={() => setAdding(true)} className="btn btn-primary">
      <PlusIcon className="size-4" /> Add partner
    </button>
  );

  return (
    <>
      <PageHeader
        title="Delivery partners"
        description="The couriers who deliver your orders."
        action={partners.length > 0 ? addButton : undefined}
      />

      {isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the partners"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="skeleton h-40" />
          ))}
        </div>
      ) : partners.length === 0 ? (
        <EmptyState
          icon={TruckIcon}
          title="No delivery partners yet"
          description="Add your first courier to start assigning orders."
          action={addButton}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {partners.map((partner) => {
            const busy = toggle.isPending && toggle.variables?.id === partner.id;

            return (
              <article key={partner.id} className="card space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white">
                      {partner.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold">{partner.name}</h2>
                      <p className="text-xs capitalize text-ink-muted">{partner.vehicleType}</p>
                    </div>
                  </div>
                  <span className={`badge ${partner.isActive ? "badge-success" : "badge-neutral"}`}>
                    {partner.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="space-y-1.5 text-sm text-ink-soft">
                  <p className="flex items-center gap-2">
                    <MailIcon className="size-3.5 text-ink-muted" /> {partner.email}
                  </p>
                  <p className="flex items-center gap-2">
                    <PhoneIcon className="size-3.5 text-ink-muted" /> {partner.phone}
                  </p>
                </div>

                {partner.isActive ? (
                  <button
                    onClick={() => setDeactivating(partner)}
                    disabled={busy}
                    className="btn btn-secondary btn-sm w-full hover:text-danger"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => toggle.mutate({ id: partner.id, isActive: true })}
                    disabled={busy}
                    className="btn btn-secondary btn-sm w-full"
                  >
                    {busy ? "Working..." : "Activate"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {adding && <NewPartnerDialog onClose={() => setAdding(false)} />}

      {deactivating && (
        <ConfirmDialog
          title={`Deactivate ${deactivating.name}?`}
          description="They are blocked right away and cannot update their deliveries. Orders already assigned to them stay assigned, so reassign them from the Orders page."
          confirmLabel="Deactivate"
          isPending={toggle.isPending}
          onConfirm={() =>
            toggle.mutate({ id: deactivating.id, isActive: false }, { onSuccess: () => setDeactivating(null) })
          }
          onCancel={() => setDeactivating(null)}
        />
      )}
    </>
  );
}