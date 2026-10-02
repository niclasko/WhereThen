import { describe, expect, it } from 'vitest';
import exifr from 'exifr';
// @ts-expect-error piexifjs ships without types
import piexif from 'piexifjs';
import { EXIF_OPTIONS, mapExif, parseOffsetMinutes, toCaptureTime } from './exif';

function jpegWithExif(): Uint8Array {
  const toRational = (deg: number) => {
    const d = Math.floor(deg);
    const mFloat = (deg - d) * 60;
    const m = Math.floor(mFloat);
    const s = Math.round((mFloat - m) * 60 * 100);
    return [[d, 1], [m, 1], [s, 100]];
  };
  const exifObj = {
    '0th': { [piexif.ImageIFD.Make]: 'Apple', [piexif.ImageIFD.Model]: 'iPhone 16 Pro' },
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2026:07:14 10:22:33' },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: toRational(41.8902),
      [piexif.GPSIFD.GPSLongitudeRef]: 'E',
      [piexif.GPSIFD.GPSLongitude]: toRational(12.4922),
    },
  };
  const exif: string = piexif.dump(exifObj); // "Exif\0\0" + TIFF payload
  const app1Length = exif.length + 2;
  const jpeg = '\xff\xd8' + '\xff\xe1' + String.fromCharCode(app1Length >> 8, app1Length & 0xff) + exif + '\xff\xd9';
  return Uint8Array.from(jpeg, (c) => c.charCodeAt(0));
}

describe('exif', () => {
  it('parses UTC offsets', () => {
    expect(parseOffsetMinutes('+02:00')).toBe(120);
    expect(parseOffsetMinutes('-05:30')).toBe(-330);
    expect(parseOffsetMinutes('nope')).toBeNull();
    expect(parseOffsetMinutes(undefined)).toBeNull();
  });

  it('computes wall-clock and absolute capture time', () => {
    const r = toCaptureTime({ year: 2026, month: 7, day: 14, hour: 10, minute: 22, second: 33 }, 120);
    expect(r.localTime).toBe('2026-07-14T10:22:33');
    expect(new Date(r.timestamp).toISOString()).toBe('2026-07-14T08:22:33.000Z');
  });

  it('extracts time, GPS and camera from a real JPEG', async () => {
    const raw = await exifr.parse(jpegWithExif(), EXIF_OPTIONS);
    const meta = mapExif({ ...raw, OffsetTimeOriginal: '+02:00' });
    expect(meta.timeSource).toBe('exif');
    expect(meta.localTime).toBe('2026-07-14T10:22:33');
    expect(new Date(meta.timestamp!).toISOString()).toBe('2026-07-14T08:22:33.000Z');
    expect(meta.lat).toBeCloseTo(41.8902, 3);
    expect(meta.lon).toBeCloseTo(12.4922, 3);
    expect(meta.camera).toBe('Apple iPhone 16 Pro');
  });

  it('falls back to file date and ignores missing/zero GPS', () => {
    const meta = mapExif({ latitude: 0, longitude: 0 }, Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(meta.timeSource).toBe('file');
    expect(meta.lat).toBeNull();
    expect(mapExif(undefined).timeSource).toBe('none');
  });
});
