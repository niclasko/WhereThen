import type { PhotoRecord, Place } from '../types';
import { formatDay, wallClock } from './format';

type Season = 'Winter' | 'Spring' | 'Summer' | 'Autumn';

export function seasonFor(month: number, southernHemisphere = false): Season {
  const north: Season[] = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
  const flip: Record<Season, Season> = { Winter: 'Summer', Summer: 'Winter', Spring: 'Autumn', Autumn: 'Spring' };
  const s = north[month - 1];
  return southernHemisphere ? flip[s] : s;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} & more`;
}

/** Ranks values by how many photos are associated with them. */
function ranked(values: (string | undefined)[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/**
 * Suggests a trip name such as "Summer Holiday 2026 – Italy & France", "Weekend in Paris"
 * or "Day in Rome – 14 Jul 2026", based on capture dates and the places' geocoded labels.
 */
export function suggestTripName(photos: PhotoRecord[], places: Place[]): string {
  const timed = photos.filter((p) => p.localTime).map((p) => p.localTime!).sort();
  const placeById = new Map(places.map((p) => [p.id, p]));
  const geo = photos.filter((p) => p.placeId).map((p) => placeById.get(p.placeId!)).filter((p): p is Place => !!p);

  const countries = ranked(geo.map((p) => p.label?.country));
  const localities = ranked(geo.map((p) => p.label?.locality ?? p.label?.name));
  const total = geo.length;

  let where = '';
  if (countries.length === 1 || (countries.length === 0 && localities.length > 0)) {
    const top = localities[0];
    where = top && top.count / total >= 0.6 ? top.name : countries[0]?.name ?? top?.name ?? '';
  } else if (countries.length > 1) {
    const significant = countries.filter((c) => c.count / total >= 0.1).map((c) => c.name);
    where = joinNames(significant.length ? significant : [countries[0].name]);
  }

  if (timed.length === 0) return where ? `Trip to ${where}` : 'New trip';

  const first = timed[0];
  const last = timed[timed.length - 1];
  const start = wallClock(first);
  const end = wallClock(last);
  const days = Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86_400_000) + 1;

  if (days === 1) return where ? `Day in ${where} – ${formatDay(first, true)}` : `Day out – ${formatDay(first, true)}`;

  const startDow = start.getUTCDay();
  const isWeekend = days <= 3 && (startDow === 5 || startDow === 6);
  if (isWeekend) return where ? `Weekend in ${where}` : `Weekend – ${formatDay(first, true)}`;

  const mid = new Date((start.getTime() + end.getTime()) / 2);
  const meanLat = geo.length ? geo.reduce((s, p) => s + p.lat, 0) / geo.length : 0;
  const season = seasonFor(mid.getUTCMonth() + 1, meanLat < 0);
  const kind = days <= 4 ? 'Trip' : 'Holiday';
  const base = `${season} ${kind} ${mid.getUTCFullYear()}`;
  return where ? `${base} – ${where}` : base;
}
