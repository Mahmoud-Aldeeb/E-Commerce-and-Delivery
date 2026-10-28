"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { MapPinIcon } from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPoint } from "@/lib/orders";

// Created once, outside the component: the same objects are reused on every render.
// This module only loads in the browser (see live-map.tsx), so using Leaflet here is safe.
const courierIcon = L.divIcon({
  className: "",
  html: '<span class="map-courier"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -14],
});

const destinationIcon = L.divIcon({
  className: "",
  html: '<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 23 15 23s15-12 15-23C30 6.7 23.3 0 15 0z" fill="#111827"/><circle cx="15" cy="15" r="6" fill="#fff"/></svg>',
  iconSize: [30, 38],
  iconAnchor: [15, 38],
  popupAnchor: [0, -38],
});

const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

type Stage = "none" | "single" | "both";

// Frames the map once, then only follows the courier if it leaves the visible area.
// It never fights the user: moving or zooming the map by hand is not undone on updates.
function FitMap({ destination, courier }: { destination: MapPoint | null; courier: MapPoint | null }) {
  const map = useMap();
  const stage = useRef<Stage>("none");

  // The effect depends on plain numbers, not on objects: a new object on every
  // refetch would otherwise re-run it each time
  const destLat = destination?.lat;
  const destLng = destination?.lng;
  const courierLat = courier?.lat;
  const courierLng = courier?.lng;

  useEffect(() => {
    const points: [number, number][] = [];
    if (destLat !== undefined && destLng !== undefined) points.push([destLat, destLng]);
    if (courierLat !== undefined && courierLng !== undefined) points.push([courierLat, courierLng]);

    if (points.length === 2 && stage.current !== "both") {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
      stage.current = "both";
    } else if (points.length === 1 && stage.current === "none") {
      map.setView(points[0], 15);
      stage.current = "single";
    } else if (courierLat !== undefined && courierLng !== undefined && stage.current === "both") {
      if (!map.getBounds().contains([courierLat, courierLng])) {
        map.panTo([courierLat, courierLng]);
      }
    }
  }, [map, destLat, destLng, courierLat, courierLng]);

  return null;
}

export interface LiveMapProps {
  destination: MapPoint | null;
  courier: (MapPoint & { updatedAt?: string }) | null;
}

export default function LiveMapInner({ destination, courier }: LiveMapProps) {
  const start = courier ?? destination;

  if (!start) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-card border border-line bg-canvas text-center">
        <MapPinIcon className="mb-2 size-8 text-ink-muted" />
        <p className="text-sm text-ink-soft">The map will appear once a location is available.</p>
      </div>
    );
  }

  const updated = courier?.updatedAt ? timeFormat.format(new Date(courier.updatedAt)) : null;

  return (
    <div
      role="region"
      aria-label="Delivery map"
      className="relative h-72 overflow-hidden rounded-card border border-line sm:h-80"
    >
      {/* `center` and `zoom` are only the starting view: FitMap does the rest */}
      <MapContainer
        center={[start.lat, start.lng]}
        zoom={15}
        scrollWheelZoom={false}
        className="size-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
            <Popup>Your delivery address</Popup>
          </Marker>
        )}
        {courier && (
          <Marker position={[courier.lat, courier.lng]} icon={courierIcon}>
            <Popup>Your courier</Popup>
          </Marker>
        )}
        <FitMap destination={destination} courier={courier} />
      </MapContainer>

      {/* Leaflet panes use z-index up to 1000, so the label needs a higher one */}
      <div className="absolute left-3 top-3 z-[1000] rounded-full bg-surface px-3 py-1.5 text-xs font-medium shadow-card">
        {courier ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" />
            Live{updated ? ` · updated ${updated}` : ""}
          </span>
        ) : (
          "Waiting for the courier's location"
        )}
      </div>
    </div>
  );
}