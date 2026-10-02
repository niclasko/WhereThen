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
  onRemovePhotos: (photoIds: string[]) => void;
  onClose: () => void;
}

export function PlaceDetails({ trip, place, index, visits, onRename, onRemovePhotos, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<number>();
  const [selected, setSelected] = useState<Set<string>>();
  useEffect(() => {
    setViewing(undefined);
    setSelected(undefined);
  }, [place.id]);
  const photos = trip.photos.filter((p) => p.placeId === place.id).sort(byTime);
  const name = placeName(place, index);
  // After removing the last photo in the viewer, show the one before it.
  useEffect(() => {
    if (viewing !== undefined && viewing >= photos.length) setViewing(photos.length ? photos.length - 1 : undefined);
  }, [viewing, photos.length]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSelected = () => {
    const ids = photos.filter((p) => selected?.has(p.id)).map((p) => p.id);
    if (!ids.length) return;
    const what = ids.length === 1 ? 'this photo' : `these ${ids.length} photos`;
    if (!window.confirm(`Remove ${what} from the trip? The originals in your photo library are not affected.`)) return;
    setSelected(undefined);
    onRemovePhotos(ids);
  };

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
      <div className="photo-tools">
        {selected ? (
          <>
            <span className="muted small">{selected.size} selected</span>
            <button className="button small danger" disabled={!selected.size} onClick={removeSelected}>
              Remove from trip
            </button>
            <button className="link" onClick={() => setSelected(undefined)}>
              Done
            </button>
          </>
        ) : (
          <button className="link" onClick={() => setSelected(new Set())}>
            Select photos
          </button>
        )}
      </div>
      <ul className={`photo-grid ${selected ? 'selecting' : ''}`}>
        {photos.map((photo, i) => {
          const thumb = safeImageSrc(photo.thumbnail);
          const isSelected = !!selected?.has(photo.id);
          return (
            <li key={photo.id}>
              <button
                className={`photo ${isSelected ? 'selected' : ''}`}
                onClick={() => (selected ? toggle(photo.id) : setViewing(i))}
                aria-label={`${selected ? 'Select' : 'View'} ${photo.ref.fileName}`}
                aria-pressed={selected ? isSelected : undefined}
              >
                {selected && (
                  <span className="photo-check" aria-hidden>
                    {isSelected ? '✓' : ''}
                  </span>
                )}
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
          onRemove={(id) => onRemovePhotos([id])}
          onClose={() => setViewing(undefined)}
        />
      )}
    </section>
  );
}
