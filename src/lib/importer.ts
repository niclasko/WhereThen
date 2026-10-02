import type { ProviderPhoto } from '../providers';
import type { PhotoRecord, Trip } from '../types';
import { extractMetadata, type ExtractedMetadata } from './exif';
import { newId } from './geo';
import { suggestTripName } from './naming';
import { assignPlaces, DEFAULT_RADIUS_KM } from './trip';

const THUMB_SIZE = 160;

/** Creates a small JPEG preview that is stored only in this browser. */
async function makeThumbnail(file: Blob): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = THUMB_SIZE / Math.max(bitmap.width, bitmap.height);
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
  keepThumbnails: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function toPhotoRecords(items: ProviderPhoto[], options: ImportOptions): Promise<PhotoRecord[]> {
  const records: PhotoRecord[] = [];
  let done = 0;
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
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
        thumbnail: options.keepThumbnails && item.file ? await makeThumbnail(item.file) : undefined,
      });
      options.onProgress?.(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  return records;
}

export function createTrip(providerId: string, providerSettings: Record<string, string>, photos: PhotoRecord[], name?: string): Trip {
  const clustered = assignPlaces(photos, [], DEFAULT_RADIUS_KM);
  const suggestedName = suggestTripName(clustered.photos, clustered.places);
  const now = Date.now();
  return {
    id: newId(),
    name: name?.trim() || suggestedName,
    suggestedName,
    nameIsCustom: !!name?.trim(),
    providerId,
    providerSettings,
    clusterRadiusKm: DEFAULT_RADIUS_KM,
    createdAt: now,
    updatedAt: now,
    photos: clustered.photos,
    places: clustered.places,
  };
}

/** Adds photos to an existing trip, skipping ones that are already referenced. */
export function addPhotosToTrip(trip: Trip, newPhotos: PhotoRecord[]): { trip: Trip; added: number } {
  const known = new Set(trip.photos.map((p) => `${p.ref.providerId}|${p.ref.externalId}`));
  const fresh = newPhotos.filter((p) => !known.has(`${p.ref.providerId}|${p.ref.externalId}`));
  const { photos, places } = assignPlaces([...trip.photos, ...fresh], trip.places, trip.clusterRadiusKm);
  return { trip: withSuggestedName({ ...trip, photos, places, updatedAt: Date.now() }), added: fresh.length };
}

/** Recomputes the suggested name and applies it unless the user chose their own. */
export function withSuggestedName(trip: Trip): Trip {
  const suggestedName = suggestTripName(trip.photos, trip.places);
  return { ...trip, suggestedName, name: trip.nameIsCustom ? trip.name : suggestedName };
}
