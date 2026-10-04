import { describe, expect, it } from 'vitest';
import type { PhotoRecord } from '../types';
import { daypart, filterOptions, NO_FILTERS, periodKey, photoMatches, pickGranularity } from './filters';

let n = 0;
function photo(localTime: string | null, extra: Partial<PhotoRecord> = {}): PhotoRecord {
  n++;
  return {
    id: `p${n}`,
    ref: { providerId: 'icloud', externalId: `x${n}`, fileName: `IMG_${n}.JPG` },
    localTime,
    timestamp: localTime ? Date.parse(`${localTime}Z`) : null,
    timeSource: 'exif',
    lat: 0,
    lon: 0,
    ...extra,
  };
}

describe('time of day', () => {
  it('puts hours into morning, afternoon, evening and night', () => {
    expect(daypart('2026-07-10T05:00:00')).toBe('morning');
    expect(daypart('2026-07-10T12:30:00')).toBe('afternoon');
    expect(daypart('2026-07-10T18:00:00')).toBe('evening');
    expect(daypart('2026-07-10T23:10:00')).toBe('night');
    expect(daypart('2026-07-11T02:00:00')).toBe('night');
  });
});

describe('periods', () => {
  it('uses the Monday for weeks', () => {
    expect(periodKey('2026-07-12T10:00:00', 'week')).toBe('2026-07-06'); // a Sunday
    expect(periodKey('2026-07-13T10:00:00', 'week')).toBe('2026-07-13');
    expect(periodKey('2026-07-13T10:00:00', 'month')).toBe('2026-07');
  });
  it('picks days for a holiday and coarser levels for longer spans', () => {
    expect(pickGranularity([photo('2026-07-10T10:00:00'), photo('2026-07-17T10:00:00')])).toBe('day');
    const daily = Array.from({ length: 40 }, (_, i) => photo(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 19)));
    expect(pickGranularity(daily)).toBe('week');
    const monthly = Array.from({ length: 30 }, (_, i) => photo(`${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15T10:00:00`));
    expect(pickGranularity(monthly)).toBe('year');
  });
});

describe('photoMatches', () => {
  const lunch = photo('2026-07-10T13:00:00', { ai: { caption: 'Pasta on a terrace', tags: ['lunch', 'pasta'], kind: 'food' } });
  const sunset = photo('2026-07-11T20:30:00', { ai: { caption: 'Sunset over the old town', tags: ['sunset'], kind: 'city' } });
  const plain = photo(null);

  it('matches everything without filters', () => {
    expect([lunch, sunset, plain].every((p) => photoMatches(p, NO_FILTERS, 'day'))).toBe(true);
  });
  it('combines rows with AND and options in a row with OR', () => {
    const f = { ...NO_FILTERS, kinds: ['food', 'city'], dayparts: ['evening'] };
    expect(photoMatches(lunch, f, 'day')).toBe(false);
    expect(photoMatches(sunset, f, 'day')).toBe(true);
    expect(photoMatches(plain, f, 'day')).toBe(false);
  });
  it('filters by day', () => {
    expect(photoMatches(lunch, { ...NO_FILTERS, periods: ['2026-07-10'] }, 'day')).toBe(true);
    expect(photoMatches(sunset, { ...NO_FILTERS, periods: ['2026-07-10'] }, 'day')).toBe(false);
  });
  it('searches captions, tags, categories and place names, ignoring case and accents', () => {
    expect(photoMatches(lunch, { ...NO_FILTERS, text: 'PASTA' }, 'day')).toBe(true);
    expect(photoMatches(lunch, { ...NO_FILTERS, text: 'food' }, 'day')).toBe(true);
    expect(photoMatches(lunch, { ...NO_FILTERS, text: 'pasta rome' }, 'day', 'Rome')).toBe(true);
    expect(photoMatches(lunch, { ...NO_FILTERS, text: 'pasta paris' }, 'day', 'Rome')).toBe(false);
    expect(photoMatches(plain, { ...NO_FILTERS, text: 'sao' }, 'day', 'São Paulo')).toBe(true);
  });
});

describe('filterOptions', () => {
  it('lists only choices that have photos, with counts', () => {
    const photos = [
      photo('2026-07-10T09:00:00', { ai: { caption: 'a', tags: [], kind: 'food' } }),
      photo('2026-07-10T13:00:00', { ai: { caption: 'b', tags: [], kind: 'food' } }),
      photo('2026-07-11T13:00:00', { ai: { caption: 'c', tags: [], kind: 'beach' } }),
    ];
    const o = filterOptions(photos, 'day');
    expect(o.periods.map((p) => [p.id, p.count])).toEqual([['2026-07-10', 2], ['2026-07-11', 1]]);
    expect(o.dayparts.map((d) => d.id)).toEqual(['morning', 'afternoon']);
    expect(o.kinds.map((k) => [k.id, k.count])).toEqual([['food', 2], ['beach', 1]]);
  });
});
