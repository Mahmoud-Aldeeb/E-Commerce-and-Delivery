import { describe, expect, it } from 'vitest';
import {
  ARRIVING_WITHIN_KM,
  estimateDeliveryEta,
  HANDOVER_MINUTES,
  haversineKm,
  MAX_LOCATION_AGE_MS,
  ROAD_FACTOR,
  SPEED_KMH,
  toGeoPoint,
  type GeoPoint,
} from './delivery-eta.js';

const NOW = new Date('2026-11-01T10:00:00.000Z');
const HOME: GeoPoint = { lat: 30, lng: 31 };

// One degree of latitude is this many kilometres (the earth is a sphere of 6371 km here)
const KM_PER_DEGREE = (Math.PI / 180) * 6371;
const northOf = (point: GeoPoint, km: number): GeoPoint => ({
  lat: point.lat + km / KM_PER_DEGREE,
  lng: point.lng,
});

// What the courier saves: a position and the moment it was recorded
const location = (point: GeoPoint, ageMs = 10_000) => ({
  ...point,
  updatedAt: new Date(NOW.getTime() - ageMs).toISOString(),
});

// Six kilometres away, on a scooter, 10 seconds ago: each test changes only what it is about
const estimate = (
  overrides: Partial<Parameters<typeof estimateDeliveryEta>[0]> = {},
) =>
  estimateDeliveryEta({
    liveLocation: location(northOf(HOME, 6)),
    destination: HOME,
    vehicleType: 'scooter',
    now: NOW,
    ...overrides,
  });

describe('the agreed numbers', () => {
  // An alarm: if someone changes an assumption by mistake, this fails and says which one
  it('are the ones in the docs of the file', () => {
    expect(ROAD_FACTOR).toBe(1.4);
    expect([...SPEED_KMH]).toEqual([
      ['bike', 14],
      ['scooter', 24],
      ['car', 22],
    ]);
    expect(HANDOVER_MINUTES).toBe(3);
    expect(ARRIVING_WITHIN_KM).toBe(0.15);
    expect(MAX_LOCATION_AGE_MS).toBe(120_000);
  });
});

describe('haversineKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineKm(HOME, HOME)).toBe(0);
  });

  it('gives 111.19 km for one degree of latitude', () => {
    expect(haversineKm({ lat: 30, lng: 31 }, { lat: 31, lng: 31 })).toBeCloseTo(
      111.19,
      1,
    );
  });

  it('gives a shorter distance for a degree of longitude away from the equator', () => {
    // At 30 degrees north a degree of longitude is cos(30) = 0.866 of a degree of latitude
    expect(haversineKm({ lat: 30, lng: 31 }, { lat: 30, lng: 32 })).toBeCloseTo(
      96.3,
      0,
    );
  });

  it('is the same in both directions', () => {
    const a = { lat: 30.79, lng: 31.0 };
    const b = { lat: 30.05, lng: 31.24 };

    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });
});

describe('toGeoPoint', () => {
  it('accepts numbers and numbers written as text', () => {
    expect(toGeoPoint({ lat: 30.1, lng: 31.2 })).toEqual({
      lat: 30.1,
      lng: 31.2,
    });
    expect(toGeoPoint({ lat: '30.1', lng: '31.2' })).toEqual({
      lat: 30.1,
      lng: 31.2,
    });
  });

  it.each([
    ['nothing', null],
    ['a number', 5],
    ['a text', '30,31'],
    ['an empty object', {}],
    ['a missing longitude', { lat: 30 }],
    ['an empty text', { lat: '', lng: '' }],
    ['text that is not a number', { lat: 'north', lng: 'east' }],
    ['the (0, 0) placeholder', { lat: 0, lng: 0 }],
    ['a latitude above 90', { lat: 91, lng: 31 }],
    ['a longitude above 180', { lat: 30, lng: 181 }],
    ['not a number values', { lat: Number.NaN, lng: 31 }],
  ])('refuses %s', (_label, value) => {
    expect(toGeoPoint(value)).toBeNull();
  });

  it('accepts a point on the equator or on the prime meridian (only (0, 0) is the placeholder)', () => {
    expect(toGeoPoint({ lat: 0, lng: 31 })).toEqual({ lat: 0, lng: 31 });
    expect(toGeoPoint({ lat: 30, lng: 0 })).toEqual({ lat: 30, lng: 0 });
  });
});

describe('estimateDeliveryEta', () => {
  it('estimates a scooter 6 km away: 8.4 road km at 24 km/h is 21 min, plus 3 at the door', () => {
    expect(estimate()).toEqual({
      minutes: 24,
      minMinutes: 18,
      maxMinutes: 30,
      distanceKm: 6,
      locationUpdatedAt: new Date(NOW.getTime() - 10_000).toISOString(),
    });
  });

  it('is slower for a bike: 8.4 km at 14 km/h is 36 min, plus 3', () => {
    expect(estimate({ vehicleType: 'bike' })).toMatchObject({
      minutes: 39,
      minMinutes: 29,
      maxMinutes: 49,
    });
  });

  it('is in between for a car: 8.4 km at 22 km/h is 22.9 min, plus 3', () => {
    expect(estimate({ vehicleType: 'car' })).toMatchObject({
      minutes: 26,
      minMinutes: 19,
      maxMinutes: 33,
    });
  });

  it.each([['plane'], [null], [undefined], ['constructor']])(
    'uses 20 km/h for the vehicle %s: 8.4 km is 25.2 min, plus 3',
    (vehicleType) => {
      expect(estimate({ vehicleType })).toMatchObject({
        minutes: 28,
        minMinutes: 21,
        maxMinutes: 35,
      });
    },
  );

  it('says the courier is about to arrive when he is very close', () => {
    expect(
      estimate({ liveLocation: location(northOf(HOME, 0.1)) }),
    ).toMatchObject({
      minutes: 0,
      minMinutes: 0,
      maxMinutes: 0,
      distanceKm: 0.1,
    });
  });

  it('counts the minutes again just beyond that distance', () => {
    // 0.2 km: 0.28 road km at 24 km/h is 0.7 min, plus 3
    expect(
      estimate({ liveLocation: location(northOf(HOME, 0.2)) }),
    ).toMatchObject({
      minutes: 4,
      minMinutes: 3,
      maxMinutes: 5,
      distanceKm: 0.2,
    });
  });

  it('keeps the best guess inside its range, and never below the time at the door', () => {
    for (const km of [0.3, 1, 2.5, 6, 15, 40]) {
      const result = estimate({ liveLocation: location(northOf(HOME, km)) });

      expect(result).not.toBeNull();
      expect(result!.minMinutes).toBeLessThanOrEqual(result!.minutes);
      expect(result!.minutes).toBeLessThanOrEqual(result!.maxMinutes);
      expect(result!.minutes).toBeGreaterThanOrEqual(HANDOVER_MINUTES);
    }
  });

  it('reads the position from numbers written as text, as JSON may hold them', () => {
    const courier = northOf(HOME, 6);
    const result = estimate({
      liveLocation: {
        lat: String(courier.lat),
        lng: String(courier.lng),
        updatedAt: new Date(NOW.getTime() - 10_000).toISOString(),
      },
      destination: { lat: '30', lng: '31' },
    });

    expect(result?.minutes).toBe(24);
  });

  it('trusts a location that is exactly at the limit, and not one a millisecond older', () => {
    expect(
      estimate({
        liveLocation: location(northOf(HOME, 6), MAX_LOCATION_AGE_MS),
      }),
    ).not.toBeNull();
    expect(
      estimate({
        liveLocation: location(northOf(HOME, 6), MAX_LOCATION_AGE_MS + 1),
      }),
    ).toBeNull();
  });

  it('trusts a location a few seconds "in the future" (two clocks never agree exactly)', () => {
    expect(
      estimate({ liveLocation: location(northOf(HOME, 6), -5_000) }),
    ).not.toBeNull();
  });

  it.each([
    ['no moment', {}],
    ['a moment that is not a date', { updatedAt: 'yesterday' }],
    ['a moment that is a number', { updatedAt: 12345 }],
  ])('gives no estimate for a location with %s', (_label, extra) => {
    expect(
      estimate({ liveLocation: { ...northOf(HOME, 6), ...extra } }),
    ).toBeNull();
  });

  it.each([
    ['no location of the courier', { liveLocation: null }],
    [
      'the (0, 0) placeholder as the location',
      { liveLocation: location({ lat: 0, lng: 0 }) },
    ],
    ['no address', { destination: null }],
    [
      'an address without coordinates',
      { destination: { address: '12 Nile St' } },
    ],
  ])('gives no estimate with %s', (_label, overrides) => {
    expect(estimate(overrides)).toBeNull();
  });
});
