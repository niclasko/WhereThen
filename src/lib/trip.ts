import type { PhotoRecord, Place, Trip, Visit } from '../types';
import { distanceKm, newId } from './geo';

const PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6',
  '#9a6324', '#469990', '#800000', '#808000', '#000075', '#bfef45', '#dcbeff',
];

export function colorForIndex(index: number): string {
  if (index < PALETTE.length) return PALETTE[index];
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue} 65% 45%)`;
}

export const DETAIL_LEVELS = [
  { radiusKm: 0.3, label: 'Spots' },
  { radiusKm: 2, label: 'Neighbourhoods' },
  { radiusKm: 10, label: 'Towns' },
  { radiusKm: 50, label: 'Regions' },
] as const;

export const DEFAULT_RADIUS_KM = 10;

export function byTime(a: PhotoRecord, b: PhotoRecord): number {
  return (a.timestamp ?? Number.MAX_SAFE_INTEGER) - (b.timestamp ?? Number.MAX_SAFE_INTEGER);
}

/**
 * Greedy spatial clustering: each geotagged photo (in time order) joins the nearest existing place
 * within `radiusKm`, otherwise starts a new place. Existing places are kept so that labels survive
 * when photos are added to a trip.
 */
export function assignPlaces(
  photos: PhotoRecord[],
  existingPlaces: Place[],
  radiusKm: number,
): { photos: PhotoRecord[]; places: Place[] } {
  const places = existingPlaces.map((p) => ({ ...p }));
  const sums = new Map<string, { lat: number; lon: number; n: number; fixed: boolean }>();
  for (const p of places) sums.set(p.id, { lat: p.lat, lon: p.lon, n: 1, fixed: true });

  const sorted = [...photos].sort(byTime);
  const assigned = new Map<string, string | undefined>();

  for (const photo of sorted) {
    if (photo.lat === null || photo.lon === null) {
      assigned.set(photo.id, undefined);
      continue;
    }
    if (photo.placeId && sums.has(photo.placeId)) {
      assigned.set(photo.id, photo.placeId);
      continue;
    }
    let best: Place | undefined;
    let bestDist = Infinity;
    for (const place of places) {
      const d = distanceKm(place, { lat: photo.lat, lon: photo.lon });
      if (d <= radiusKm && d < bestDist) {
        best = place;
        bestDist = d;
      }
    }
    if (!best) {
      best = { id: newId(), lat: photo.lat, lon: photo.lon, color: colorForIndex(places.length) };
      places.push(best);
      sums.set(best.id, { lat: photo.lat, lon: photo.lon, n: 1, fixed: false });
    } else {
      const s = sums.get(best.id)!;
      if (!s.fixed) {
        s.lat += photo.lat;
        s.lon += photo.lon;
        s.n += 1;
        best.lat = s.lat / s.n;
        best.lon = s.lon / s.n;
      }
    }
    assigned.set(photo.id, best.id);
  }

  const updated = photos.map((p) => ({ ...p, placeId: assigned.get(p.id) }));
  return { photos: updated, places: recolorByFirstVisit(places, updated) };
}

/** Drops places without photos and assigns palette colours in order of first visit. */
function recolorByFirstVisit(places: Place[], photos: PhotoRecord[]): Place[] {
  const order: string[] = [];
  for (const photo of [...photos].sort(byTime)) {
    if (photo.placeId && !order.includes(photo.placeId)) order.push(photo.placeId);
  }
  return order
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is Place => !!p)
    .map((p, i) => ({ ...p, color: colorForIndex(i) }));
}

/** Rebuilds all places from scratch, e.g. after changing the level of detail. */
export function reclusterTrip(trip: Trip, radiusKm: number): Trip {
  const cleared = trip.photos.map((p) => ({ ...p, placeId: undefined }));
  const { photos, places } = assignPlaces(cleared, [], radiusKm);
  return { ...trip, photos, places, clusterRadiusKm: radiusKm, updatedAt: Date.now() };
}

/** Consecutive (in time) photos at the same place form one visit. */
export function computeVisits(photos: PhotoRecord[]): Visit[] {
  const visits: Visit[] = [];
  const timed = photos.filter((p) => p.placeId && p.timestamp !== null && p.localTime).sort(byTime);
  for (const photo of timed) {
    const last = visits[visits.length - 1];
    if (last && last.placeId === photo.placeId) {
      last.end = photo.timestamp!;
      last.endLocal = photo.localTime!;
      last.photoIds.push(photo.id);
    } else {
      visits.push({
        placeId: photo.placeId!,
        start: photo.timestamp!,
        end: photo.timestamp!,
        startLocal: photo.localTime!,
        endLocal: photo.localTime!,
        photoIds: [photo.id],
      });
    }
  }
  return visits;
}

export function placeName(place: Place | undefined, index?: number): string {
  if (!place) return 'Unknown place';
  return place.customName || place.label?.name || (index !== undefined ? `Place ${index + 1}` : 'Locating…');
}
