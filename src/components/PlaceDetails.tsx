import { useEffect, useRef, useState } from 'react';
import type { PhotoRecord, Place, PlaceLabel, Trip, Visit } from '../types';
import { formatDateTime, formatRange } from '../lib/format';
import { byTime, placeName, spotName } from '../lib/trip';
import { safeColor, safeImageSrc } from '../lib/nav';
import { nominatimGeocoder } from '../lib/geocode';
import { kindInfo } from '../lib/kinds';
import { PhotoViewer } from './PhotoViewer';

/** Below this level of detail, places are already spots, so photos don't need their own names. */
const SPOT_RADIUS_KM = 0.3;

interface Props {
  trip: Trip;
  /** The photos to show (all of the trip's, or those matching the filters). */
  photos: PhotoRecord[];
  filtered: boolean;
  place: Place;
  index: number;
  visits: Visit[];
  onRename: (name: string) => void;
  onRemovePhotos: (photoIds: string[]) => void;
  onSpot: (photoId: string, spot: PlaceLabel | null) => void;
  onClose: () => void;
}

export function PlaceDetails({ trip, photos: shown, filtered, place, index, visits, onRename, onRemovePhotos, onSpot, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<number>();
  const [selected, setSelected] = useState<Set<string>>();
  useEffect(() => {
    setViewing(undefined);
    setSelected(undefined);
  }, [place.id]);
  const photos = shown.filter((p) => p.placeId === place.id).sort(byTime);
  const allHere = filtered ? trip.photos.filter((p) => p.placeId === place.id).length : photos.length;
  const name = placeName(place, index);
  const showSpots = trip.clusterRadiusKm > SPOT_RADIUS_KM;
  // After removing the last photo in the viewer, show the one before it.
  useEffect(() => {
    if (viewing !== undefined && viewing >= photos.length) setViewing(photos.length ? photos.length - 1 : undefined);
  }, [viewing, photos.length]);

  // Look up each photo's own spot (street, square, landmark) while the place is open. Results are saved
  // with the trip, and nearby photos share cached lookups.
  const latest = useRef({ photos, onSpot });
  latest.current = { photos, onSpot };
  useEffect(() => {
    if (!showSpots) return;
    const controller = new AbortController();
    void (async () => {
      const pending = latest.current.photos.filter((p) => p.spot === undefined && p.lat !== null && p.lon !== null);
      for (const photo of pending) {
        try {
          const spot = await nominatimGeocoder.reverse(photo.lat!, photo.lon!, SPOT_RADIUS_KM, controller.signal);
          if (controller.signal.aborted) return;
          latest.current.onSpot(photo.id, spot);
        } catch {
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [place.id, showSpots]);

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
        {[
          place.label?.locality !== place.label?.name ? place.label?.locality : undefined,
          place.label?.country,
          `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
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
        {filtered && photos.length < allHere && !selected && (
          <span className="muted small ai-status">
            {photos.length} of {allHere} photos match the filters
          </span>
        )}
      </div>
      <ul className={`photo-grid ${selected ? 'selecting' : ''}`}>
        {photos.map((photo, i) => {
          const thumb = safeImageSrc(photo.thumbnail);
          const isSelected = !!selected?.has(photo.id);
          const when = photo.localTime
            ? `${formatDateTime(photo.localTime)}${photo.timeSource === 'file' ? ' (file date)' : ''}`
            : 'Unknown time';
          const spot = showSpots ? spotName(photo, place) : undefined;
          return (
            <li key={photo.id}>
              <button
                className={`photo ${isSelected ? 'selected' : ''}`}
                onClick={() => (selected ? toggle(photo.id) : setViewing(i))}
                aria-label={`${selected ? 'Select' : 'View'} photo, ${when}${spot ? `, ${spot}` : ''}${photo.ai ? `, ${photo.ai.caption}` : ''}`}
                aria-pressed={selected ? isSelected : undefined}
              >
                {selected && (
                  <span className="photo-check" aria-hidden>
                    {isSelected ? '✓' : ''}
                  </span>
                )}
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="photo-placeholder">📷</div>}
                <span className="photo-when">{when}</span>
                {spot && (
                  <span className="photo-spot muted small" title={spot}>
                    📍 {spot}
                  </span>
                )}
                {photo.ai && (
                  <span className="photo-caption small" title={photo.ai.caption}>
                    {kindInfo(photo.ai.kind) && <span aria-hidden>{kindInfo(photo.ai.kind)!.emoji} </span>}
                    {photo.ai.caption}
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
          spotOf={(photo) => (showSpots ? spotName(photo, place) : undefined)}
          onIndex={setViewing}
          onRemove={(id) => onRemovePhotos([id])}
          onClose={() => setViewing(undefined)}
        />
      )}
    </section>
  );
}
