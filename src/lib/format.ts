const pad = (n: number) => String(n).padStart(2, '0');

/** Parses "YYYY-MM-DDTHH:mm:ss" into a Date whose UTC fields equal the wall-clock time. */
export function wallClock(localTime: string): Date {
  const [d, t = '00:00:00'] = localTime.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi, s] = t.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, da, h, mi, s || 0));
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' });
const dayFmt = fmt({ day: 'numeric', month: 'short' });
const dayYearFmt = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const weekdayFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short' });

export function formatTime(localTime: string): string {
  const d = wallClock(localTime);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatDay(localTime: string, withYear = false): string {
  return (withYear ? dayYearFmt : dayFmt).format(wallClock(localTime));
}

export function formatWeekday(localTime: string): string {
  return weekdayFmt.format(wallClock(localTime));
}

const tickFmt = fmt({ weekday: 'short' });

/** Compact axis label such as "Sat 11". */
export function formatTick(localTime: string): string {
  const d = wallClock(localTime);
  return `${tickFmt.format(d)} ${d.getUTCDate()}`;
}

export function formatDateTime(localTime: string): string {
  return `${formatDay(localTime, true)}, ${formatTime(localTime)}`;
}

/** "14 Jul 10:05 – 16:40" or "14 Jul 10:05 – 16 Jul 09:12". */
export function formatRange(startLocal: string, endLocal: string): string {
  const sameDay = startLocal.slice(0, 10) === endLocal.slice(0, 10);
  if (startLocal === endLocal) return `${formatDay(startLocal)} ${formatTime(startLocal)}`;
  return sameDay
    ? `${formatDay(startLocal)} ${formatTime(startLocal)}–${formatTime(endLocal)}`
    : `${formatDay(startLocal)} ${formatTime(startLocal)} – ${formatDay(endLocal)} ${formatTime(endLocal)}`;
}

export function formatDateSpan(startLocal: string, endLocal: string): string {
  if (startLocal.slice(0, 10) === endLocal.slice(0, 10)) return formatDay(startLocal, true);
  return `${formatDay(startLocal, startLocal.slice(0, 4) !== endLocal.slice(0, 4))} – ${formatDay(endLocal, true)}`;
}
