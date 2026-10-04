import type { PhotoKind } from './lib/kinds';

/** Reference to a photo that lives in an external photo service. The photo bytes are never stored. */
export interface PhotoRef {
  providerId: string;
  /** Provider-specific identifier (e.g. asset id, or file name + size for file-picker based providers). */
  externalId: string;
  fileName: string;
}

export type TimeSource = 'exif' | 'file' | 'none';

export interface PhotoRecord {
  id: string;
  ref: PhotoRef;
  /** Wall-clock time where the photo was taken, "YYYY-MM-DDTHH:mm:ss". */
  localTime: string | null;
  /** Epoch milliseconds, used for ordering. */
  timestamp: number | null;
  timeSource: TimeSource;
  lat: number | null;
  lon: number | null;
  altitude?: number | null;
  camera?: string;
  width?: number;
  height?: number;
  /** Optional tiny preview (data URL) that only ever lives in this browser. */
  thumbnail?: string;
  placeId?: string;
  /** Street/landmark-level name for this photo's own location (`null`: looked up, nothing found). */
  spot?: PlaceLabel | null;
  /** Caption and tags from the user's own AI service, if they set one up. */
  ai?: PhotoDescription;
}

export interface PhotoDescription {
  caption: string;
  tags: string[];
  /** Main category; missing for captions made before categories existed (those are described again). */
  kind?: PhotoKind;
}

export interface PlaceLabel {
  name: string;
  locality?: string;
  country?: string;
  countryCode?: string;
}

export interface Place {
  id: string;
  lat: number;
  lon: number;
  color: string;
  label?: PlaceLabel;
  customName?: string;
}

export interface Trip {
  id: string;
  name: string;
  suggestedName: string;
  nameIsCustom: boolean;
  providerId: string;
  clusterRadiusKm: number;
  createdAt: number;
  updatedAt: number;
  photos: PhotoRecord[];
  places: Place[];
  /** Places (with looked-up and custom names) per level of detail, keyed by radius, so switching back needs no lookups. */
  layouts?: Record<string, SavedLayout>;
  /** Looked-up routes between places, keyed by profile and coordinates (`null`: no route found). */
  routes?: Record<string, SavedRoute | null>;
}

export interface SavedRoute {
  distanceKm: number;
  durationMin: number;
  /** Encoded polyline (precision 5) of the simplified route. */
  path: string;
}

export interface SavedLayout {
  places: Place[];
  /** Photo id → place id. */
  placeIds: Record<string, string>;
}

export type GeocodeStatus = 'idle' | 'working' | 'error';

/** A contiguous stay at a place, derived from photos ordered by time. */
export interface Visit {
  placeId: string;
  start: number;
  end: number;
  startLocal: string;
  endLocal: string;
  photoIds: string[];
}
