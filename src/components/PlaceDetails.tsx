import { useEffect, useState } from 'react';
import type { Place, Trip, Visit } from '../types';
import { formatDateTime, formatRange } from '../lib/format';
import { byTime, placeName } from '../lib/trip';
import { safeColor, safeImageSrc } from '../lib/nav';
import { PhotoViewer } from './PhotoViewer';

interface Props {
  trip: Trip;
  place: Place;
  index: number;
  visits: Visit[];
  onRename: (name: string) => void;
  onClose: () => void;
}

export function PlaceDetails({ trip, place, index, visits, onRename, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<number>();
  useEffect(() => setViewing(undefined), [place.id]);
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
        {photos.map((photo, i) => {
          const thumb = safeImageSrc(photo.thumbnail);
          return (
            <li key={photo.id}>
              <button className="photo" onClick={() => setViewing(i)} aria-label={`View ${photo.ref.fileName}`}>
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="photo-placeholder">📷</div>}
                <span className="file" title={photo.ref.fileName}>
                  {photo.ref.fileName}
                </span>
                {photo.localTime && (
                  <span className="muted small">
                    {formatDateTime(photo.localTime)}
                    {photo.timeSource === 'file' ? ' (file date)' : ''}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {viewing !== undefined && photos[viewing] && (
        <PhotoViewer
          trip={trip}
          photos={photos}
          index={viewing}
          placeName={name}
          onIndex={setViewing}
          onClose={() => setViewing(undefined)}
        />
      )}
    </section>
  );
}
