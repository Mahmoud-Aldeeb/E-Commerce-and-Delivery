"use client";

import { useState } from "react";
import { CheckIcon, Loader2Icon, MapPinIcon } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/modal";
import { getCurrentLocation, type Coordinates } from "@/lib/geolocation";
import { useSaveAddress } from "@/lib/queries/addresses";
import type { Address } from "@/types";

interface AddressFormDialogProps {
  /** The address being edited. Leave it out to add a new one */
  address?: Address;
  /** The first address of a user becomes the default automatically */
  hasAddresses: boolean;
  onClose: () => void;
  onSaved?: (addresses: Address[]) => void;
}

interface FormState {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
}

type FieldName = "label" | "address" | "city" | "state" | "zip";
type FieldErrors = Partial<Record<FieldName | "location", string>>;

const LABEL_SUGGESTIONS = ["Home", "Work", "Other"];

const FIELDS = [
  { name: "address", label: "Street address", autoComplete: "street-address", placeholder: "12 Tahrir St, Apt 4", wide: true },
  { name: "city", label: "City", autoComplete: "address-level2", placeholder: "", wide: false },
  { name: "state", label: "State / Governorate", autoComplete: "address-level1", placeholder: "", wide: false },
  { name: "zip", label: "ZIP / Postal code", autoComplete: "postal-code", placeholder: "", wide: false },
] as const;

function validate(values: Omit<FormState, "isDefault">, coords: Coordinates | null): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.label) errors.label = "Give this address a name, like Home or Work.";
  if (!values.address) errors.address = "Enter the street address.";
  if (!values.city) errors.city = "Enter the city.";
  if (!values.state) errors.state = "Enter the state or governorate.";
  if (!values.zip) errors.zip = "Enter the postal code.";
  if (!coords) errors.location = "Add your location so the courier can find you.";
  return errors;
}

export default function AddressFormDialog({
  address,
  hasAddresses,
  onClose,
  onSaved,
}: AddressFormDialogProps) {
  const save = useSaveAddress();

  const [form, setForm] = useState<FormState>({
    label: address?.label ?? "",
    address: address?.address ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    zip: address?.zip ?? "",
    isDefault: address?.isDefault ?? false,
  });
  // Editing keeps the saved coordinates: they only change if the user asks for it
  const [coords, setCoords] = useState<Coordinates | null>(
    address ? { lat: address.lat, lng: address.lng } : null,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [locating, setLocating] = useState(false);

  const setField = (name: FieldName, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  async function detectLocation() {
    setLocating(true);
    setErrors((current) => ({ ...current, location: undefined }));
    try {
      setCoords(await getCurrentLocation());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not get your location.";
      setErrors((current) => ({ ...current, location: message }));
    } finally {
      setLocating(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const values = {
      label: form.label.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
    };
    const found = validate(values, coords);
    setErrors(found);
    if (Object.keys(found).length > 0 || !coords) return;

    save.mutate(
      {
        id: address?.id,
        ...values,
        // An address that is already the default stays the default
        isDefault: Boolean(address?.isDefault) || form.isDefault,
        lat: coords.lat,
        lng: coords.lng,
      },
      {
        onSuccess: (addresses) => {
          toast.success(address ? "Address updated" : "Address saved");
          onSaved?.(addresses);
          onClose();
        },
      },
    );
  }

  const showDefaultOption = !address?.isDefault && (address || hasAddresses);

  return (
    <Modal title={address ? "Edit address" : "Add a new address"} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Label with quick suggestions */}
        <div>
          <label htmlFor="address-label" className="field-label">
            Name this address
          </label>
          <input
            id="address-label"
            className={`input ${errors.label ? "input-error" : ""}`}
            value={form.label}
            onChange={(event) => setField("label", event.target.value)}
            placeholder="Home, Work..."
            aria-invalid={Boolean(errors.label)}
            aria-describedby={errors.label ? "address-label-error" : undefined}
            autoFocus
          />
          {errors.label && (
            <p id="address-label-error" className="field-error">
              {errors.label}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {LABEL_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setField("label", suggestion)}
                aria-pressed={form.label === suggestion}
                className={`badge cursor-pointer ${form.label === suggestion ? "badge-primary" : "badge-neutral hover:bg-gray-200"
                  }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Street, city, state, zip */}
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((field) => (
            <div key={field.name} className={field.wide ? "col-span-2" : ""}>
              <label htmlFor={`address-${field.name}`} className="field-label">
                {field.label}
              </label>
              <input
                id={`address-${field.name}`}
                className={`input ${errors[field.name] ? "input-error" : ""}`}
                value={form[field.name]}
                onChange={(event) => setField(field.name, event.target.value)}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={errors[field.name] ? `address-${field.name}-error` : undefined}
              />
              {errors[field.name] && (
                <p id={`address-${field.name}-error`} className="field-error">
                  {errors[field.name]}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Location */}
        <div className="rounded-card border border-line bg-canvas p-4">
          <div className="flex items-start gap-3">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-full ${coords ? "bg-success-soft text-success" : "bg-surface text-ink-muted"
                }`}
            >
              {coords ? <CheckIcon className="size-4" /> : <MapPinIcon className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {coords ? "Location saved" : "Location needed"}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {coords
                  ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                  : "The courier uses it to find you, and you can follow the delivery on the map."}
              </p>
            </div>
            <button
              type="button"
              onClick={detectLocation}
              disabled={locating}
              className={`btn btn-sm shrink-0 ${coords ? "btn-secondary" : "btn-primary"}`}
            >
              {locating && <Loader2Icon className="size-3.5 animate-spin" />}
              {coords ? "Update" : "Use my location"}
            </button>
          </div>
          {errors.location && (
            <p role="alert" className="field-error mt-3">
              {errors.location}
            </p>
          )}
        </div>

        {/* Default */}
        {showDefaultOption && (
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) =>
                setForm((current) => ({ ...current, isDefault: event.target.checked }))
              }
              className="size-4 accent-primary-700"
            />
            Use as my default address
          </label>
        )}
        {!address && !hasAddresses && (
          <p className="text-xs text-ink-muted">
            This will be your default address, since it is the first one.
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className="btn btn-primary">
            {save.isPending ? "Saving..." : address ? "Save changes" : "Save address"}
          </button>
        </div>
      </form>
    </Modal>
  );
}