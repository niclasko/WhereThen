import { useState } from 'react';
import { DETAIL_LEVELS } from '../lib/trip';
import { activeFilterCount, NO_FILTERS, type FilterOption, type TripFilters } from '../lib/filters';
import type { AiProgress } from '../lib/useAutoDescribe';

interface Props {
  radiusKm: number;
  onRadius: (radiusKm: number) => void;
  filters: TripFilters;
  onFilters: (f: TripFilters) => void;
  options: { periods: FilterOption[]; dayparts: FilterOption[]; kinds: FilterOption[] };
  whenTitle: string;
  ai: AiProgress;
  shown: { photos: number; places: number; total: number };
}

/** Group by level of detail, and narrow the map and timeline down by time, time of day, category or words. */
export function Slicer({ radiusKm, onRadius, filters, onFilters, options, whenTitle, ai, shown }: Props) {
  const active = activeFilterCount(filters);
  const [open, setOpen] = useState(false);
  const toggle = (row: 'periods' | 'dayparts' | 'kinds', id: string) => {
    const list = filters[row];
    onFilters({ ...filters, [row]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };

  return (
    <section className="slicer" aria-label="Filter the map and timeline">
      <div className="slicer-top">
        <div className="segmented" role="radiogroup" aria-label="Group photos into">
          {DETAIL_LEVELS.map((d) => (
            <button
              key={d.radiusKm}
              role="radio"
              aria-checked={d.radiusKm === radiusKm}
              className={d.radiusKm === radiusKm ? 'on' : ''}
              onClick={() => d.radiusKm !== radiusKm && onRadius(d.radiusKm)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button className={`button small filter-toggle${active ? ' active' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <span aria-hidden>☰</span> Filter{active > 0 && <span className="badge">{active}</span>}
        </button>
      </div>

      {open && (
        <div className="slicer-panel">
          <label className="search">
            <span aria-hidden>🔍</span>
            <input
              type="search"
              placeholder={options.kinds.length ? 'Search: pizza, sunset, Rome…' : 'Search places and streets…'}
              aria-label="Search photos"
              value={filters.text}
              onChange={(e) => onFilters({ ...filters, text: e.target.value })}
            />
          </label>
          <PillRow title={whenTitle} options={options.periods} selected={filters.periods} onToggle={(id) => toggle('periods', id)} />
          <PillRow title="Time of day" options={options.dayparts} selected={filters.dayparts} onToggle={(id) => toggle('dayparts', id)} />
          {options.kinds.length > 1 ? (
            <PillRow title="What" options={options.kinds} selected={filters.kinds} onToggle={(id) => toggle('kinds', id)} />
          ) : ai.state === 'working' ? (
            <p className="muted small pulse">✨ Describing photos… categories such as 🍽️ Food and 🏛️ Sights appear here as they’re ready.</p>
          ) : ai.state === 'off' ? (
            <p className="muted small">✨ Turn on AI captions (top right) to also filter by what’s in your photos, like 🍽️ Food or 🏖️ Beach.</p>
          ) : null}
        </div>
      )}

      {active > 0 && (
        <p className="slicer-summary small" role="status">
          {shown.photos === 0
            ? 'No photos match.'
            : `Showing ${shown.photos} of ${shown.total} photos, in ${shown.places} place${shown.places === 1 ? '' : 's'}.`}{' '}
          <button className="link" onClick={() => onFilters(NO_FILTERS)}>
            Clear filters
          </button>
        </p>
      )}
    </section>
  );
}

function PillRow({ title, options, selected, onToggle }: { title: string; options: FilterOption[]; selected: string[]; onToggle: (id: string) => void }) {
  if (options.length < 2) return null;
  return (
    <div className="pill-group" role="group" aria-label={title}>
      <h3>{title}</h3>
      <div className="pills">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button key={o.id} className={`pill${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onToggle(o.id)}>
              {o.emoji && <span aria-hidden>{o.emoji}</span>}
              {o.label}
              <span className="pill-count">{o.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
