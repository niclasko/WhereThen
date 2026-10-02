import type { PlaceLabel } from '../types';
import { getCachedLabel, putCachedLabel } from './storage';

export interface Geocoder {
  reverse(lat: number, lon: number, radiusKm: number, signal?: AbortSignal): Promise<PlaceLabel | null>;
}

/** Nominatim zoom level matching the clustering radius (bigger radius → coarser name). */
export function zoomForRadius(radiusKm: number): number {
  if (radiusKm <= 0.5) return 17;
  if (radiusKm <= 3) return 14;
  if (radiusKm <= 15) return 10;
  return 8;
}

type Address = Record<string, string | undefined>;

export function labelFromNominatim(json: { name?: string; address?: Address } | null, zoom: number): PlaceLabel | null {
  if (!json?.address) return null;
  const a = json.address;
  const locality = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? a.suburb ?? a.county;
  const byZoom: (string | undefined)[] =
    zoom >= 17
      ? [json.name, a.tourism, a.attraction, a.amenity, a.leisure, a.road, a.neighbourhood, a.suburb, locality]
      : zoom >= 14
        ? [a.neighbourhood, a.suburb, a.quarter, a.city_district, locality, json.name]
        : zoom >= 10
          ? [locality, json.name, a.state]
          : [a.state, a.region, a.county, locality, json.name];
  const name = byZoom.find((v) => v && v.trim()) ?? a.country;
  if (!name) return null;
  const qualify = zoom >= 14 && locality && name !== locality;
  return {
    name: qualify ? `${name}, ${locality}` : name,
    locality,
    country: a.country,
    countryCode: a.country_code?.toUpperCase(),
  };
}

const MIN_INTERVAL_MS = 1100;
let queue: Promise<void> = Promise.resolve();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Spaces out requests, also when several lookups (places, photo spots) run at the same time. */
function throttle(): Promise<void> {
  const turn = queue;
  queue = turn.then(() => sleep(MIN_INTERVAL_MS));
  return turn;
}

/** OpenStreetMap Nominatim (free, max 1 request/second). Results are cached in IndexedDB. */
export const nominatimGeocoder: Geocoder = {
  async reverse(lat, lon, radiusKm, signal) {
    const zoom = zoomForRadius(radiusKm);
    const key = `${lat.toFixed(3)},${lon.toFixed(3)},${zoom}`;
    const cached = await getCachedLabel(key);
    if (cached !== undefined) return cached;

    await throttle();
    signal?.throwIfAborted();

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lon),
      zoom: String(zoom),
      addressdetails: '1',
      'accept-language': navigator.language || 'en',
    }).toString();
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
    const label = labelFromNominatim(await res.json(), zoom);
    await putCachedLabel(key, label);
    return label;
  },
};
