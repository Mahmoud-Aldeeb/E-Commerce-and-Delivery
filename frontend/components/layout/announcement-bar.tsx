"use client";

import { TruckIcon, XIcon } from "lucide-react";
import { siteConfig } from "@/config/site";
import { createLocalStore, useLocalStore } from "@/lib/local-store";

// Dismissed for the current browser session only
const dismissedStore = createLocalStore<boolean>({
  key: "banner_dismissed",
  fallback: false,
  parse: (raw) => raw === "true",
  serialize: String,
  storage: "session",
});

export default function AnnouncementBar() {
  const dismissed = useLocalStore(dismissedStore);

  if (dismissed) return null;

  return (
    <div className="relative border-b border-primary-100 bg-primary-50 text-primary-800">
      <div className="container-page flex items-center justify-center gap-2 py-2 pr-10 text-xs font-medium sm:text-sm">
        <TruckIcon className="size-4 shrink-0" />
        <span>Free delivery on orders over ${siteConfig.freeDeliveryThreshold}</span>
      </div>
      <button
        onClick={() => dismissedStore.set(true)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-colors hover:bg-primary-100"
        aria-label="Dismiss announcement"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}