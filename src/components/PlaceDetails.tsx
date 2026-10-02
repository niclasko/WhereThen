import { useState } from 'react';
import type { Place, Trip, Visit } from '../types';
import { formatDateTime, formatRange } from '../lib/format';
import { byTime, placeName } from '../lib/trip';
import { safeColor, safeImageSrc } from '../lib/nav';
import { getProvider } from '../providers';

interface Props {
  trip: Trip;
  place: Place;
  index: number;
  visits: Visit[];
  onRename: (name: string) => void;
  onClose: () => void;
}

export function PlaceDetails({ trip, place, index, visits, onRename, onClose }: Props) {
  const provider = getProvider(trip.providerId);
  const [editing, setEditing] = useState(false);
  const photos = trip.photos.filter((p) => p.placeId === place.id).sort(byTime);
  const name = placeName(place, index);

  return (
    <section className="card place-details" style={{ borderTopColor: safeColor(place.color) }}>
      <header>
        <span className="chip-num" style={{ background: safeColor(place.color) }}>
          {index + 1}
        </span>
        {editing ? (
          <input
            autoFocus
            defaultValue={place.customName ?? place.label?.name ?? ''}
            placeholder={place.label?.name}
            onBlur={(e) => {
              setEditing(false);
              onRename(e.target.value.trim());
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          <h2>{name}</h2>
        )}
        <button className="link" onClick={() => setEditing(true)}>
          Rename
        </button>
        <button className="link" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <p className="muted small">
        {[place.label?.locality !== place.label?.name ? place.label?.locality : undefined, place.label?.country]
          .filter(Boolean)
          .join(', ')}{' '}
        · {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
      </p>
      <ul className="visit-list">
        {visits.map((v) => (
          <li key={v.start}>
            {formatRange(v.startLocal, v.endLocal)} · {v.photoIds.length} photo{v.photoIds.length === 1 ? '' : 's'}
          </li>
        ))}
      </ul>
      <ul className="photo-grid">
        {photos.map((photo) => {
          const url = provider.getViewUrl(photo.ref, trip.providerSettings);
          const thumb = safeImageSrc(photo.thumbnail);
          return (
            <li key={photo.id} className="photo">
              {thumb ? <img src={thumb} alt={photo.ref.fileName} loading="lazy" /> : <div className="photo-placeholder">📷</div>}
              <span className="file" title={photo.ref.fileName}>
                {photo.ref.fileName}
              </span>
              {photo.localTime && (
                <span className="muted small">
                  {formatDateTime(photo.localTime)}
                  {photo.timeSource === 'file' ? ' (file date)' : ''}
                </span>
              )}
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="small">
                  {provider.viewLabel} ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
