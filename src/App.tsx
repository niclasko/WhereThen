import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeocodeStatus, Trip } from './types';
import { deleteTrip, listTrips, parseTripExport, requestPersistentStorage, saveTrip } from './lib/storage';
import { nominatimGeocoder } from './lib/geocode';
import { withSuggestedName } from './lib/importer';
import { TripView } from './components/TripView';
import { ImportView } from './components/ImportView';
import { TripList } from './components/TripList';
import { navigate } from './lib/nav';

type Route = { kind: 'home' } | { kind: 'new' } | { kind: 'trip'; id: string } | { kind: 'add'; id: string };

function parseHash(hash: string): Route {
  const [, kind, id] = hash.replace(/^#/, '').split('/');
  if (kind === 'new') return { kind: 'new' };
  if (kind === 'trip' && id) return { kind: 'trip', id: decodeURIComponent(id) };
  if (kind === 'add' && id) return { kind: 'add', id: decodeURIComponent(id) };
  return { kind: 'home' };
}

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [geoStatus, setGeoStatus] = useState<Record<string, GeocodeStatus>>({});
  const tripsRef = useRef<Trip[]>([]);
  const labeling = useRef(new Set<string>());
  const failedPlaces = useRef(new Set<string>());

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    void requestPersistentStorage();
    listTrips().then((all) => {
      tripsRef.current = all;
      setTrips(all);
      setLoaded(true);
    });
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const commit = useCallback(async (next: Trip) => {
    const exists = tripsRef.current.some((t) => t.id === next.id);
    tripsRef.current = exists
      ? tripsRef.current.map((t) => (t.id === next.id ? next : t))
      : [next, ...tripsRef.current];
    setTrips(tripsRef.current);
    await saveTrip(next);
  }, []);

  const updateTrip = useCallback(
    async (id: string, fn: (trip: Trip) => Trip) => {
      const current = tripsRef.current.find((t) => t.id === id);
      if (current) await commit(fn(current));
    },
    [commit],
  );

  /** Looks up names for unlabeled places, one at a time (Nominatim allows 1 request/second). */
  const labelTrip = useCallback(
    async (id: string) => {
      if (labeling.current.has(id)) return;
      labeling.current.add(id);
      setGeoStatus((s) => ({ ...s, [id]: 'working' }));
      let hadError = false;
      try {
        for (;;) {
          const trip = tripsRef.current.find((t) => t.id === id);
          const pending = trip?.places.find((p) => !p.label && !failedPlaces.current.has(p.id));
          if (!trip || !pending) break;
          try {
            const label = await nominatimGeocoder.reverse(pending.lat, pending.lon, trip.clusterRadiusKm);
            await updateTrip(id, (t) =>
              withSuggestedName({
                ...t,
                places: t.places.map((p) =>
                  p.id === pending.id
                    ? { ...p, label: label ?? { name: `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` } }
                    : p,
                ),
              }),
            );
          } catch {
            failedPlaces.current.add(pending.id);
            hadError = true;
          }
        }
      } finally {
        labeling.current.delete(id);
        setGeoStatus((s) => ({ ...s, [id]: hadError ? 'error' : 'idle' }));
      }
    },
    [updateTrip],
  );

  useEffect(() => {
    for (const t of trips) {
      if (t.places.some((p) => !p.label && !failedPlaces.current.has(p.id))) void labelTrip(t.id);
    }
  }, [trips, labelTrip]);

  const retryGeocoding = useCallback(
    (id: string) => {
      const trip = tripsRef.current.find((t) => t.id === id);
      trip?.places.forEach((p) => failedPlaces.current.delete(p.id));
      void labelTrip(id);
    },
    [labelTrip],
  );

  const removeTrip = useCallback(async (id: string) => {
    tripsRef.current = tripsRef.current.filter((t) => t.id !== id);
    setTrips(tripsRef.current);
    await deleteTrip(id);
    navigate('#/');
  }, []);

  const importBackup = useCallback(
    async (file: File) => {
      const imported = parseTripExport(await file.text());
      for (const trip of imported) await commit(trip);
      return imported.length;
    },
    [commit],
  );

  const activeTrip = route.kind === 'trip' || route.kind === 'add' ? trips.find((t) => t.id === route.id) : undefined;

  return (
    <div className="app">
      <header className="app-header">
        <a href="#/" className="brand">
          <span className="brand-pin" aria-hidden>📍</span> WhereThen
        </a>
        <span className="tagline">where you were, and when</span>
        {route.kind !== 'new' && (
          <a className="button primary small" href="#/new">
            + New trip
          </a>
        )}
      </header>

      <main className="app-main">
        {!loaded ? (
          <p className="muted center">Loading…</p>
        ) : route.kind === 'new' ? (
          <ImportView
            onCancel={() => navigate('#/')}
            onDone={async (trip) => {
              await commit(trip);
              navigate(`#/trip/${encodeURIComponent(trip.id)}`);
            }}
          />
        ) : route.kind === 'add' && activeTrip ? (
          <ImportView
            existingTrip={activeTrip}
            onCancel={() => navigate(`#/trip/${encodeURIComponent(activeTrip.id)}`)}
            onDone={async (trip) => {
              await commit(trip);
              navigate(`#/trip/${encodeURIComponent(trip.id)}`);
            }}
          />
        ) : route.kind === 'trip' && activeTrip ? (
          <TripView
            key={activeTrip.id}
            trip={activeTrip}
            geocodeStatus={geoStatus[activeTrip.id] ?? 'idle'}
            onRetryGeocoding={() => retryGeocoding(activeTrip.id)}
            onChange={(fn) => updateTrip(activeTrip.id, fn)}
            onDelete={() => removeTrip(activeTrip.id)}
          />
        ) : (
          <TripList trips={trips} onImportBackup={importBackup} notFound={route.kind !== 'home'} />
        )}
      </main>
    </div>
  );
}
