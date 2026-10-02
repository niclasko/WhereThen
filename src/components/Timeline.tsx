import { useMemo } from 'react';
import type { Place, Visit } from '../types';
import { formatRange, formatTick, formatWeekday, wallClock } from '../lib/format';
import { placeName } from '../lib/trip';
import { safeColor } from '../lib/nav';
import { anchorFrom, type Anchor } from './Popover';

interface Props {
  visits: Visit[];
  places: Place[];
  selectedPlaceId?: string;
  onSelect: (placeId: string, anchor?: Anchor) => void;
}

const DAY = 86_400_000;
const MIN_SEGMENT_MS = 30 * 60_000;

export function Timeline({ visits, places, selectedPlaceId, onSelect }: Props) {
  const index = useMemo(() => new Map(places.map((p, i) => [p.id, i])), [places]);

  const bar = useMemo(() => {
    if (!visits.length) return null;
    const start = visits[0].start;
    const last = visits[visits.length - 1];
    // Give the final visit a visible share of the bar, even when it is a single photo.
    const lastEnd = Math.max(last.end, last.start + MIN_SEGMENT_MS, last.start + (last.start - start) * 0.04);
    const total = Math.max(lastEnd - start, 1);
    // You are "at" a place from your first photo there until your first photo at the next place.
    const segments = visits.map((v, i) => {
      const end = i + 1 < visits.length ? visits[i + 1].start : lastEnd;
      return { visit: v, left: ((v.start - start) / total) * 100, width: (Math.max(end - v.start, 0) / total) * 100 };
    });

    // Day ticks at local midnight, using the UTC offset of the first photo.
    const offset = wallClock(visits[0].startLocal).getTime() - start;
    const ticks: { left: number; label: string }[] = [];
    const firstMidnight = Math.ceil((start + offset) / DAY) * DAY - offset;
    const dayCount = Math.ceil(total / DAY);
    const step = Math.max(1, Math.ceil(dayCount / 6));
    for (let t = firstMidnight, n = 0; t < start + total; t += DAY, n++) {
      if (n % step !== 0) continue;
      const local = new Date(t + offset).toISOString().slice(0, 19);
      ticks.push({ left: ((t - start) / total) * 100, label: formatTick(local) });
    }
    return { segments, ticks };
  }, [visits]);

  const days = useMemo(() => {
    const groups: { day: string; visits: Visit[] }[] = [];
    for (const v of visits) {
      const day = v.startLocal.slice(0, 10);
      const g = groups[groups.length - 1];
      if (g?.day === day) g.visits.push(v);
      else groups.push({ day, visits: [v] });
    }
    return groups;
  }, [visits]);

  if (!bar) return <p className="muted">No dated, geotagged photos to show on the timeline yet.</p>;

  const byId = new Map(places.map((p) => [p.id, p]));

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-bar">
        {bar.segments.map(({ visit, left, width }) => {
          const place = byId.get(visit.placeId);
          return (
            <button
              key={`${visit.placeId}-${visit.start}`}
              className={`segment${visit.placeId === selectedPlaceId ? ' selected' : ''}`}
              style={{ left: `${left}%`, width: `max(${width}%, 4px)`, background: safeColor(place?.color ?? '') }}
              title={`${placeName(place, index.get(visit.placeId))} · ${formatRange(visit.startLocal, visit.endLocal)}`}
              onClick={(e) => onSelect(visit.placeId, anchorFrom(e.currentTarget))}
            />
          );
        })}
      </div>
      <div className="timeline-ticks" aria-hidden>
        {bar.ticks.map((t) => (
          <span key={t.left} style={{ left: `${t.left}%` }}>
            {t.label}
          </span>
        ))}
      </div>

      <div className="timeline-days">
        {days.map((group) => (
          <div className="day" key={group.day}>
            <h3>{formatWeekday(`${group.day}T00:00:00`)}</h3>
            <div className="chips">
              {group.visits.map((v) => {
                const place = byId.get(v.placeId);
                const i = index.get(v.placeId) ?? 0;
                return (
                  <button
                    key={`${v.placeId}-${v.start}`}
                    className={`chip${v.placeId === selectedPlaceId ? ' selected' : ''}`}
                    style={{ borderColor: safeColor(place?.color ?? '') }}
                    onClick={(e) => onSelect(v.placeId, anchorFrom(e.currentTarget))}
                  >
                    <span className="chip-num" style={{ background: safeColor(place?.color ?? '') }}>
                      {i + 1}
                    </span>
                    <span className="chip-text">
                      <strong>{placeName(place, i)}</strong>
                      <small>
                        {formatRange(v.startLocal, v.endLocal)} · {v.photoIds.length} 📷
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
