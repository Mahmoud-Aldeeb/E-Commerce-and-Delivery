// An estimate of when the courier arrives, from the live location of the courier.
// It is NOT a route: it takes the straight-line distance to the address and scales it up to a
// road distance. The numbers below are assumptions for a city like Tanta or Cairo:
// tune them after real deliveries

const EARTH_RADIUS_KM = 6371;

// Roads are longer than the straight line between two points: a city is usually 30 to 50% longer
export const ROAD_FACTOR = 1.4;
// Average speed in city traffic, by vehicle
export const SPEED_KMH = new Map<string, number>([
  ['bike', 14],
  ['scooter', 24],
  ['car', 22],
]);
const DEFAULT_SPEED_KMH = 20; // a vehicle we do not know
// Parking, walking to the door, and handing the order over
export const HANDOVER_MINUTES = 3;
// A courier closer than this is "arriving now"
export const ARRIVING_WITHIN_KM = 0.15;
// A location older than this is not trusted (the phone of the courier shares every 10 seconds)
export const MAX_LOCATION_AGE_MS = 2 * 60_000;
// The estimate is shown as a range: a quarter less to a quarter more
const RANGE = 0.25;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DeliveryEta {
  /** The best guess, in whole minutes. 0 = the courier is at the door */
  minutes: number;
  minMinutes: number;
  maxMinutes: number;
  /** The straight-line distance, with one decimal */
  distanceKm: number;
  /** When the location of the courier was recorded */
  locationUpdatedAt: string;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};

// A usable coordinate: real numbers in range. (0, 0) is the "no location" placeholder,
// the same rule as the web app
export function toGeoPoint(value: unknown): GeoPoint | null {
  if (typeof value !== 'object' || value === null) return null;

  const lat = toNumber((value as { lat?: unknown }).lat);
  const lng = toNumber((value as { lng?: unknown }).lng);

  const inRange =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  if (!inRange || (lat === 0 && lng === 0)) return null;

  return { lat, lng };
}

// The distance over the surface of the earth between two points, in kilometres
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// `liveLocation` is { lat, lng, updatedAt } as the courier saved it, and `destination` is the
// address of the order ({ lat, lng, ... }). Both are stored as JSON, so nothing is trusted:
// null means "no estimate"
export function estimateDeliveryEta(input: {
  liveLocation: unknown;
  destination: unknown;
  vehicleType: string | null | undefined;
  now: Date;
}): DeliveryEta | null {
  const courier = toGeoPoint(input.liveLocation);
  const destination = toGeoPoint(input.destination);
  if (!courier || !destination) return null;

  const recorded = (input.liveLocation as { updatedAt?: unknown }).updatedAt;
  const recordedAt = typeof recorded === 'string' ? new Date(recorded) : null;
  if (!recordedAt || Number.isNaN(recordedAt.getTime())) return null;
  if (input.now.getTime() - recordedAt.getTime() > MAX_LOCATION_AGE_MS)
    return null;

  const straightKm = haversineKm(courier, destination);
  const base = {
    distanceKm: Math.round(straightKm * 10) / 10,
    locationUpdatedAt: recordedAt.toISOString(),
  };

  if (straightKm <= ARRIVING_WITHIN_KM) {
    return { ...base, minutes: 0, minMinutes: 0, maxMinutes: 0 };
  }

  const speed = SPEED_KMH.get(input.vehicleType ?? '') ?? DEFAULT_SPEED_KMH;
  const minutes = Math.round(
    ((straightKm * ROAD_FACTOR) / speed) * 60 + HANDOVER_MINUTES,
  );

  return {
    ...base,
    minutes,
    minMinutes: Math.floor(minutes * (1 - RANGE)),
    maxMinutes: Math.ceil(minutes * (1 + RANGE)),
  };
}
