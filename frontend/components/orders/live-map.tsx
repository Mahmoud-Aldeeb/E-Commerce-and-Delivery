"use client";

import dynamic from "next/dynamic";

// Leaflet reads `window` when it loads, so it must never run on the server.
// ssr: false is allowed here because this file is a Client Component.
const LiveMap = dynamic(() => import("@/components/orders/live-map-inner"), {
  ssr: false,
  loading: () => <div className="skeleton h-72 w-full rounded-card sm:h-80" />,
});

export default LiveMap;