import { useRef, useState } from 'react';
import type { Trip } from '../types';
import { formatDateSpan } from '../lib/format';
import { tripHref, safeColor } from '../lib/nav';
import { getProvider } from '../providers';
import { downloadTrips } from './download';

interface Props {
  trips: Trip[];
  notFound: boolean;
  onImportBackup: (file: File) => Promise<number>;
}

function span(trip: Trip) {
  const times = trip.photos.map((p) => p.localTime).filter((t): t is string => !!t).sort();
  return times.length ? formatDateSpan(times[0], times[times.length - 1]) : 'No dates';
}

export function TripList({ trips, notFound, onImportBackup }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();

  return (
    <div className="trip-list">
      {notFound && <p className="notice">That trip could not be found in this browser.</p>}
      {trips.length === 0 ? (
        <section className="hero card">
          <h1>Where was I, and when?</h1>
          <p>
            Pick the photos from a holiday and WhereThen puts them on a map with a colour-coded timeline. Only the photo
            metadata (time, GPS position, file name) is kept, in this browser. Your photos stay in iCloud.
          </p>
          <a className="button primary" href="#/new">
            Create your first trip
          </a>
        </section>
      ) : (
        <>
          <h1>Your trips</h1>
          <ul className="cards">
            {trips.map((trip) => (
              <li key={trip.id}>
                <a className="card trip-card" href={tripHref(trip.id)}>
                  <div className="swatches" aria-hidden>
                    {trip.places.slice(0, 12).map((p) => (
                      <span key={p.id} style={{ background: safeColor(p.color) }} />
                    ))}
                  </div>
                  <strong>{trip.name}</strong>
                  <span className="muted">
                    {span(trip)} · {trip.photos.length} photos · {trip.places.length} places
                  </span>
                  <span className="muted small">{safeProviderName(trip.providerId)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="backup">
        <button className="button" onClick={() => downloadTrips(trips, 'wherethen-backup.json')} disabled={!trips.length}>
          Export all trips
        </button>
        <button className="button" onClick={() => fileRef.current?.click()}>
          Import backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setMessage(`Imported ${await onImportBackup(file)} trip(s).`);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Import failed');
            }
          }}
        />
        {message && <span className="muted">{message}</span>}
        <p className="muted small">
          Trips are stored in this browser only. Export a backup to move them to another device.
        </p>
      </section>
    </div>
  );
}

function safeProviderName(id: string) {
  try {
    return getProvider(id).name;
  } catch {
    return id;
  }
}
