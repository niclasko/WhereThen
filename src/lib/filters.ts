import type { PhotoRecord } from '../types';
import { formatDay, wallClock } from './format';
import { kindInfo, PHOTO_KINDS } from './kinds';

/** Within a row, any selected option matches; across rows, all rows must match. */
export interface TripFilters {
  periods: string[];
  dayparts: string[];
  kinds: string[];
  text: string;
}

export const NO_FILTERS: TripFilters = { periods: [], dayparts: [], kinds: [], text: '' };

export function activeFilterCount(f: TripFilters): number {
  return f.periods.length + f.dayparts.length + f.kinds.length + (f.text.trim() ? 1 : 0);
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

export const DAYPARTS = [
  { id: 'morning', emoji: '🌅', label: 'Morning', from: 5, to: 12 },
  { id: 'afternoon', emoji: '☀️', label: 'Afternoon', from: 12, to: 17 },
  { id: 'evening', emoji: '🌆', label: 'Evening', from: 17, to: 21 },
  { id: 'night', emoji: '🌙', label: 'Night', from: 21, to: 29 },
] as const;

export function daypart(localTime: string): string {
  const h = wallClock(localTime).getUTCHours();
  return DAYPARTS.find((d) => (h >= d.from && h < d.to) || (h + 24 >= d.from && h + 24 < d.to))!.id;
}

/** "2026-07-10" (day), the Monday "2026-07-06" (week), "2026-07" (month) or "2026" (year). */
export function periodKey(localTime: string, g: Granularity): string {
  if (g === 'year') return localTime.slice(0, 4);
  if (g === 'month') return localTime.slice(0, 7);
  const day = wallClock(localTime.slice(0, 10));
  if (g === 'week') day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** The finest level that still gives a short row of choices: days for a holiday, months for a year of photos. */
export function pickGranularity(photos: PhotoRecord[]): Granularity {
  const times = photos.map((p) => p.localTime).filter((t): t is string => !!t);
  const distinct = (g: Granularity) => new Set(times.map((t) => periodKey(t, g))).size;
  if (distinct('day') <= 14) return 'day';
  if (distinct('week') <= 12) return 'week';
  if (distinct('month') <= 18) return 'month';
  return 'year';
}

const weekdayDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function periodLabel(key: string, g: Granularity): string {
  if (g === 'year') return key;
  if (g === 'month') return monthFmt.format(wallClock(`${key}-01`));
  if (g === 'week') return `Week of ${formatDay(key)}`;
  return weekdayDay.format(wallClock(key));
}

export interface FilterOption {
  id: string;
  label: string;
  emoji?: string;
  count: number;
}

/** The choices for each row, with how many photos each one has (only choices that have photos). */
export function filterOptions(photos: PhotoRecord[], g: Granularity) {
  const count = (keyOf: (p: PhotoRecord) => string | undefined) => {
    const m = new Map<string, number>();
    for (const p of photos) {
      const k = keyOf(p);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const periods = count((p) => (p.localTime ? periodKey(p.localTime, g) : undefined));
  const parts = count((p) => (p.localTime ? daypart(p.localTime) : undefined));
  const kinds = count((p) => p.ai?.kind);
  return {
    periods: [...periods].sort(([a], [b]) => a.localeCompare(b)).map(([id, n]) => ({ id, label: periodLabel(id, g), count: n })),
    dayparts: DAYPARTS.filter((d) => parts.has(d.id)).map((d) => ({ id: d.id, label: d.label, emoji: d.emoji, count: parts.get(d.id)! })),
    kinds: PHOTO_KINDS.filter((k) => kinds.has(k.id))
      .map((k) => ({ id: k.id, label: k.label, emoji: k.emoji, count: kinds.get(k.id)! }))
      .sort((a, b) => b.count - a.count),
  };
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Words the search box can find a photo by: its caption, tags, category, place and street, and file name. */
export function searchText(photo: PhotoRecord, placeName?: string): string {
  return fold(
    [photo.ai?.caption, ...(photo.ai?.tags ?? []), kindInfo(photo.ai?.kind)?.label, placeName, photo.spot?.name, photo.ref.fileName]
      .filter(Boolean)
      .join(' '),
  );
}

export function photoMatches(photo: PhotoRecord, f: TripFilters, g: Granularity, placeName?: string): boolean {
  if ((f.periods.length || f.dayparts.length) && !photo.localTime) return false;
  if (f.periods.length && !f.periods.includes(periodKey(photo.localTime!, g))) return false;
  if (f.dayparts.length && !f.dayparts.includes(daypart(photo.localTime!))) return false;
  if (f.kinds.length && !f.kinds.includes(photo.ai?.kind ?? '')) return false;
  const words = fold(f.text).split(/\s+/).filter(Boolean);
  if (words.length) {
    const text = searchText(photo, placeName);
    if (!words.every((w) => text.includes(w))) return false;
  }
  return true;
}
