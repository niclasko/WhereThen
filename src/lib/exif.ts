import exifr from 'exifr';
import type { TimeSource } from '../types';

export interface ExtractedMetadata {
  localTime: string | null;
  timestamp: number | null;
  timeSource: TimeSource;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  camera?: string;
  width?: number;
  height?: number;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** Parses an EXIF offset like "+02:00" into minutes east of UTC. */
export function parseOffsetMinutes(offset: unknown): number | null {
  if (typeof offset !== 'string') return null;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim());
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -minutes : minutes;
}

/**
 * Converts EXIF wall-clock components (+ optional UTC offset) into a display-friendly local
 * time string and an epoch timestamp for ordering.
 */
export function toCaptureTime(
  wall: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  offsetMinutes: number | null,
): { localTime: string; timestamp: number } {
  const localTime = `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const timestamp =
    offsetMinutes === null
      ? new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second).getTime()
      : asUtc - offsetMinutes * 60_000;
  return { localTime, timestamp };
}

function wallFromDate(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

function wallFromExifString(value: string) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  return { year, month, day, hour, minute, second };
}

function isValidCoord(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

/** Maps raw exifr output to our metadata model. Exported for testing. */
export function mapExif(raw: Record<string, unknown> | undefined, fallbackLastModified?: number): ExtractedMetadata {
  const r = raw ?? {};
  const dateValue = r.DateTimeOriginal ?? r.CreateDate ?? r.DateTimeDigitized ?? r.ModifyDate;
  const offset = parseOffsetMinutes(r.OffsetTimeOriginal ?? r.OffsetTimeDigitized ?? r.OffsetTime);

  let wall = null;
  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) wall = wallFromDate(dateValue);
  else if (typeof dateValue === 'string') wall = wallFromExifString(dateValue);

  let localTime: string | null = null;
  let timestamp: number | null = null;
  let timeSource: TimeSource = 'none';
  if (wall) {
    ({ localTime, timestamp } = toCaptureTime(wall, offset));
    timeSource = 'exif';
  } else if (fallbackLastModified) {
    ({ localTime, timestamp } = toCaptureTime(wallFromDate(new Date(fallbackLastModified)), null));
    timeSource = 'file';
  }

  const hasGps = isValidCoord(r.latitude, r.longitude);
  const make = typeof r.Make === 'string' ? r.Make.trim() : '';
  const model = typeof r.Model === 'string' ? r.Model.trim() : '';
  const camera = model.startsWith(make) ? model : [make, model].filter(Boolean).join(' ');
  const width = Number(r.ExifImageWidth ?? r.ImageWidth) || undefined;
  const height = Number(r.ExifImageHeight ?? r.ImageHeight) || undefined;

  return {
    localTime,
    timestamp,
    timeSource,
    lat: hasGps ? (r.latitude as number) : null,
    lon: hasGps ? (r.longitude as number) : null,
    altitude: typeof r.GPSAltitude === 'number' ? r.GPSAltitude : null,
    camera: camera || undefined,
    width,
    height,
  };
}

export const EXIF_OPTIONS = {
  tiff: true,
  exif: true,
  gps: true,
  ifd1: false,
  xmp: false,
  icc: false,
  iptc: false,
  pick: [
    'DateTimeOriginal', 'CreateDate', 'DateTimeDigitized', 'ModifyDate',
    'OffsetTimeOriginal', 'OffsetTimeDigitized', 'OffsetTime',
    'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef', 'GPSAltitude',
    'Make', 'Model', 'ExifImageWidth', 'ExifImageHeight', 'ImageWidth', 'ImageHeight',
  ],
};

/** Reads EXIF metadata in the browser. Nothing is uploaded. */
export async function extractMetadata(file: Blob): Promise<ExtractedMetadata> {
  const lastModified = file instanceof File ? file.lastModified : undefined;
  try {
    return mapExif(await exifr.parse(file, EXIF_OPTIONS), lastModified);
  } catch {
    return mapExif(undefined, lastModified);
  }
}
