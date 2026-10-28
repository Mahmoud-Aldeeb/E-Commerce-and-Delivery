"use client";

import { useEffect, useRef, useState } from "react";
import deliveryApi from "@/lib/delivery-api";

// How often the position is sent. Several orders are updated at the same time
const SEND_EVERY_MS = 10_000;

interface LocationSharingOptions {
  enabled: boolean;
  orderIds: string[];
  /** Called when sharing cannot continue (the permission was refused) */
  onStop: (message: string) => void;
}

export function useLocationSharing({
  enabled,
  orderIds,
  onStop,
}: LocationSharingOptions) {
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);

  // Always call the latest onStop without restarting the GPS watch on every render
  const onStopRef = useRef(onStop);
  useEffect(() => {
    onStopRef.current = onStop;
  });

  // The effect depends on this text, not on the array (a new array on every render)
  const idsKey = orderIds.join(",");

  useEffect(() => {
    if (!enabled || !idsKey || !navigator.geolocation) return;

    const ids = idsKey.split(",");
    let latest: { lat: number; lng: number } | null = null;
    let hasNewPosition = false;
    let firstSent = false;

    const send = async () => {
      if (!latest) return;
      const position = latest;
      hasNewPosition = false;

      // A failed order (for example one that was just delivered) must not block the others
      await Promise.allSettled(
        ids.map((id) =>
          deliveryApi.put(`/delivery/my-deliveries/${id}/location`, position),
        ),
      );
      setLastSentAt(new Date());
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latest = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        hasNewPosition = true;

        // The first position goes out at once, so the customer sees the courier quickly
        if (!firstSent) {
          firstSent = true;
          void send();
        }
      },
      (error) => {
        // Only a refused permission ends the sharing. A timeout or a weak signal passes by itself
        if (error.code === error.PERMISSION_DENIED) {
          onStopRef.current(
            "Location access is blocked. Allow it in your browser settings.",
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );

    const timer = window.setInterval(() => {
      if (hasNewPosition) void send();
    }, SEND_EVERY_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(timer);
      setLastSentAt(null);
    };
  }, [enabled, idsKey]);

  return { lastSentAt };
}
