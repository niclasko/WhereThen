import type { ProviderPhoto } from '../providers';
import type { PhotoRecord, Trip } from '../types';
import { extractMetadata, type ExtractedMetadata } from './exif';
import { newId } from './geo';
import { suggestTripName } from './naming';
import { assignPlaces, DEFAULT_RADIUS_KM } from './trip';

// Large enough for a full-screen preview on a phone, small enough to keep hundreds in IndexedDB (~40 KB each).
const PREVIEW_SIZE = 640;

/** Creates a JPEG preview that is stored only in this browser. */
async function makeThumbnail(file: Blob): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = PREVIEW_SIZE / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)));
    canvas.height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined; // e.g. HEIC in browsers that cannot decode it
  }
}

export interface ImportOptions {
  onProgress?: (progress: { done: number; total: number; located: number }) => void;
  signal?: AbortSignal;
}

export async function toPhotoRecords(items: ProviderPhoto[], options: ImportOptions = {}): Promise<PhotoRecord[]> {
  const records: PhotoRecord[] = [];
  let done = 0;
  let located = 0;
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      options.signal?.throwIfAborted();
      const extracted: Partial<ExtractedMetadata> = item.file ? await extractMetadata(item.file) : {};
      const meta = { ...extracted, ...item.metadata };
      records.push({
        id: newId(),
        ref: item.ref,
        localTime: meta.localTime ?? null,
        timestamp: meta.timestamp ?? null,
        timeSource: meta.timeSource ?? 'none',
        lat: meta.lat ?? null,
        lon: meta.lon ?? null,
        altitude: meta.altitude ?? null,
        camera: meta.camera,
        width: meta.width,
        height: meta.height,
        thumbnail: item.file ? await makeThumbnail(item.file) : undefined,
      });
      if (meta.lat != null) located++;
      options.onProgress?.({ done: ++done, total: items.length, located });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  options.signal?.throwIfAborted();
  return records;
}

export function createTrip(providerId: string, photos: PhotoRecord[], name?: string): Trip {
  const clustered = assignPlaces(photos, [], DEFAULT_RADIUS_KM);
  const suggestedName = suggestTripName(clustered.photos, clustered.places);
  const now = Date.now();
  return {
    id: newId(),
    name: name?.trim() || suggestedName,
    suggestedName,
    nameIsCustom: !!name?.trim(),
    providerId,
    clusterRadiusKm: DEFAULT_RADIUS_KM,
    createdAt: now,
    updatedAt: now,
    photos: clustered.photos,
    places: clustered.places,
  };
}

/**
 * Keys that identify the same photo across imports: the provider's id (file name + size for iCloud)
 * and, for photos with a camera timestamp, the file name without extension plus capture time. The
 * second key catches the same photo delivered in another format (e.g. HEIC vs JPEG, different size).
 */
function photoKeys(p: PhotoRecord): string[] {
  const keys = [`id|${p.ref.providerId}|${p.ref.externalId}`];
  if (p.localTime && p.timeSource === 'exif') {
    const stem = p.ref.fileName.replace(/\.[^.]+$/, '').toLowerCase();
    keys.push(`taken|${p.ref.providerId}|${stem}|${p.localTime}`);
  }
  return keys;
}

/**
 * Adds photos to an existing trip, skipping ones that are already in it (so adding the same photos
 * again changes nothing). Previews of already-included photos are filled in if they were missing.
 */
export function addPhotosToTrip(trip: Trip, newPhotos: PhotoRecord[]): { trip: Trip; added: number; previews: number } {
  const byKey = new Map<string, PhotoRecord>();
  const remember = (p: PhotoRecord) => photoKeys(p).forEach((k) => byKey.set(k, p));
  trip.photos.forEach(remember);

  const thumbnails = new Map<string, string>();
  const fresh: PhotoRecord[] = [];
  for (const photo of newPhotos) {
    const match = photoKeys(photo).map((k) => byKey.get(k)).find(Boolean);
    if (!match) {
      fresh.push(photo);
      remember(photo);
    } else if (!match.thumbnail && photo.thumbnail && !thumbnails.has(match.id)) {
      thumbnails.set(match.id, photo.thumbnail);
    }
  }
  const existing = trip.photos.map((p) => (thumbnails.has(p.id) ? { ...p, thumbnail: thumbnails.get(p.id) } : p));
  const { photos, places } = assignPlaces([...existing, ...fresh], trip.places, trip.clusterRadiusKm);
  return {
    trip: withSuggestedName({ ...trip, photos, places, updatedAt: Date.now() }),
    added: fresh.length,
    previews: thumbnails.size,
  };
}

/** Recomputes the suggested name and applies it unless the user chose their own. */
export function withSuggestedName(trip: Trip): Trip {
  const suggestedName = suggestTripName(trip.photos, trip.places);
  return { ...trip, suggestedName, name: trip.nameIsCustom ? trip.name : suggestedName };
}
