import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PlaceLabel, Trip } from '../types';
import { providers } from '../providers';

interface WhereThenDB extends DBSchema {
  trips: { key: string; value: Trip; indexes: { updatedAt: number } };
  geocode: { key: string; value: { label: PlaceLabel | null; at: number } };
}

let dbPromise: Promise<IDBPDatabase<WhereThenDB>> | undefined;

function db() {
  dbPromise ??= openDB<WhereThenDB>('wherethen', 1, {
    upgrade(database) {
      const trips = database.createObjectStore('trips', { keyPath: 'id' });
      trips.createIndex('updatedAt', 'updatedAt');
      database.createObjectStore('geocode');
    },
  });
  return dbPromise;
}

export async function listTrips(): Promise<Trip[]> {
  const all = await (await db()).getAll('trips');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveTrip(trip: Trip): Promise<void> {
  await (await db()).put('trips', trip);
}

export async function deleteTrip(id: string): Promise<void> {
  await (await db()).delete('trips', id);
}

/** Returns `undefined` on cache miss, `null` when the location is known to have no label. */
export async function getCachedLabel(key: string): Promise<PlaceLabel | null | undefined> {
  return (await (await db()).get('geocode', key))?.label;
}

export async function putCachedLabel(key: string, label: PlaceLabel | null): Promise<void> {
  await (await db()).put('geocode', { label, at: Date.now() }, key);
}

/** Asks the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}

export interface TripExport {
  app: 'WhereThen';
  version: 1;
  trips: Trip[];
}

export function parseTripExport(text: string): Trip[] {
  const data = JSON.parse(text) as Partial<TripExport>;
  if (data.app !== 'WhereThen' || !Array.isArray(data.trips)) throw new Error('Not a WhereThen export file');
  for (const t of data.trips) {
    if (typeof t?.id !== 'string' || typeof t.name !== 'string' || !Array.isArray(t.photos) || !Array.isArray(t.places)) {
      throw new Error('Export file is malformed');
    }
    if (!providers.some((p) => p.id === t.providerId)) throw new Error(`Unsupported photo source: ${t.providerId}`);
    if (t.layouts !== undefined && (typeof t.layouts !== 'object' || t.layouts === null || Array.isArray(t.layouts))) {
      delete t.layouts;
    }
    if (t.routes !== undefined && (typeof t.routes !== 'object' || t.routes === null || Array.isArray(t.routes))) {
      delete t.routes;
    }
  }
  return data.trips;
}
