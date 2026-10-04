import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PhotoDescription, PlaceLabel, Trip } from '../types';
import { providers } from '../providers';
import { KIND_IDS, type PhotoKind } from './kinds';

interface WhereThenDB extends DBSchema {
  trips: { key: string; value: Trip; indexes: { updatedAt: number } };
  geocode: { key: string; value: { label: PlaceLabel | null; at: number } };
  settings: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<WhereThenDB>> | undefined;

function db() {
  dbPromise ??= openDB<WhereThenDB>('wherethen', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const trips = database.createObjectStore('trips', { keyPath: 'id' });
        trips.createIndex('updatedAt', 'updatedAt');
        database.createObjectStore('geocode');
      }
      if (oldVersion < 2) database.createObjectStore('settings');
    },
  });
  return dbPromise;
}

/** App settings, kept separately from trips so they are never part of an exported trip file. */
export async function getSetting(key: string): Promise<unknown> {
  return (await db()).get('settings', key);
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  if (value === null || value === undefined) await (await db()).delete('settings', key);
  else await (await db()).put('settings', value, key);
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

/** Keeps a short caption and a few short tags; returns undefined when the data isn't a description. */
export function sanitizeDescription(data: unknown): PhotoDescription | undefined {
  const d = data as Partial<PhotoDescription> | null;
  if (!d || typeof d.caption !== 'string' || !d.caption.trim() || !Array.isArray(d.tags)) return undefined;
  const tags = [...new Set(d.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))];
  const kind = KIND_IDS.includes(d.kind as PhotoKind) ? d.kind : undefined;
  return { caption: d.caption.trim().slice(0, 200), tags: tags.slice(0, 5), ...(kind && { kind }) };
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
    for (const p of t.photos) {
      if (p?.ai === undefined || p.ai === null) continue;
      const ai = sanitizeDescription(p.ai);
      if (ai) p.ai = ai;
      else delete p.ai;
    }
  }
  return data.trips;
}
