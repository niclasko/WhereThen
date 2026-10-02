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
  providerSettings: Record<string, string>;
  clusterRadiusKm: number;
  createdAt: number;
  updatedAt: number;
  photos: PhotoRecord[];
  places: Place[];
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
