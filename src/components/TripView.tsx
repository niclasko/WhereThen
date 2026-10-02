import { useMemo, useState } from 'react';
import type { GeocodeStatus, Trip } from '../types';
import { computeVisits, DETAIL_LEVELS, reclusterTrip, byTime } from '../lib/trip';
import { withSuggestedName } from '../lib/importer';
import { formatDateSpan } from '../lib/format';
import { getProvider } from '../providers';
import { TripMap } from './TripMap';
import { Timeline } from './Timeline';
import { PlaceDetails } from './PlaceDetails';
import { downloadTrips, slug } from './download';

interface Props {
  trip: Trip;
  geocodeStatus: GeocodeStatus;
  onRetryGeocoding: () => void;
  onChange: (fn: (trip: Trip) => Trip) => Promise<void>;
  onDelete: () => void;
}

export function TripView({ trip, geocodeStatus, onRetryGeocoding, onChange, onDelete }: Props) {
  const provider = getProvider(trip.providerId);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  const [draftName, setDraftName] = useState<string>();
  const visits = useMemo(() => computeVisits(trip.photos), [trip.photos]);
  const times = useMemo(() => trip.photos.filter((p) => p.localTime).sort(byTime), [trip.photos]);
  const unlocated = trip.photos.filter((p) => p.lat === null).length;
  const selectedPlace = trip.places.find((p) => p.id === selectedPlaceId);

  const commitName = (value: string) => {
    setDraftName(undefined);
    const v = value.trim();
    if (!v || v === trip.suggestedName) {
      void onChange((t) => withSuggestedName({ ...t, nameIsCustom: false }));
    } else if (v !== trip.name) {
      void onChange((t) => ({ ...t, name: v, nameIsCustom: true, updatedAt: Date.now() }));
    }
  };

  return (
    <div className="trip">
      <section className="trip-header">
        <input
          className="trip-name"
          aria-label="Trip name"
          value={draftName ?? trip.name}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={(e) => commitName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {trip.nameIsCustom && trip.suggestedName !== trip.name && (
          <button className="link" onClick={() => commitName(trip.suggestedName)}>
            Use suggestion: “{trip.suggestedName}”
          </button>
        )}
        <div className="trip-meta muted">
          {times.length > 0 && <span>{formatDateSpan(times[0].localTime!, times[times.length - 1].localTime!)}</span>}
          <span>{trip.photos.length} photos</span>
          <span>{trip.places.length} places</span>
          <span>{provider.name}</span>
          {geocodeStatus === 'working' && <span className="pulse">Looking up place names…</span>}
          {geocodeStatus === 'error' && (
            <button className="link" onClick={onRetryGeocoding}>
              Some place names couldn’t be looked up. Retry
            </button>
          )}
        </div>
        <div className="trip-actions">
          <label className="inline">
            Detail
            <select
              value={trip.clusterRadiusKm}
              onChange={(e) => {
                setSelectedPlaceId(undefined);
                void onChange((t) => withSuggestedName(reclusterTrip(t, Number(e.target.value))));
              }}
            >
              {DETAIL_LEVELS.map((d) => (
                <option key={d.radiusKm} value={d.radiusKm}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <a className="button small" href={`#/add/${encodeURIComponent(trip.id)}`}>
            + Add photos
          </a>
          <button className="button small" onClick={() => downloadTrips([trip], `${slug(trip.name)}.wherethen.json`)}>
            Export
          </button>
          <button
            className="button small danger"
            onClick={() => window.confirm(`Delete “${trip.name}”? Your photos in ${provider.name} are not affected.`) && onDelete()}
          >
            Delete
          </button>
        </div>
      </section>

      {trip.places.length === 0 ? (
        <p className="notice">
          None of these photos have a GPS location. On iPhone, tap <strong>Options</strong> in the photo picker and turn on{' '}
          <strong>Location</strong>, then add the photos again.
        </p>
      ) : (
        <TripMap places={trip.places} visits={visits} selectedPlaceId={selectedPlaceId} onSelect={setSelectedPlaceId} />
      )}

      <Timeline visits={visits} places={trip.places} selectedPlaceId={selectedPlaceId} onSelect={setSelectedPlaceId} />

      {selectedPlace && (
        <PlaceDetails
          trip={trip}
          place={selectedPlace}
          index={trip.places.indexOf(selectedPlace)}
          visits={visits.filter((v) => v.placeId === selectedPlace.id)}
          onRename={(customName) =>
            onChange((t) =>
              withSuggestedName({
                ...t,
                places: t.places.map((p) => (p.id === selectedPlace.id ? { ...p, customName: customName || undefined } : p)),
              }),
            )
          }
          onClose={() => setSelectedPlaceId(undefined)}
        />
      )}

      {unlocated > 0 && trip.places.length > 0 && (
        <p className="muted small">
          {unlocated} photo{unlocated === 1 ? '' : 's'} without GPS location {unlocated === 1 ? 'is' : 'are'} not shown on the map.
        </p>
      )}

      <details className="card settings">
        <summary>Photo source settings</summary>
        {provider.settingsFields.map((field) => (
          <SettingField
            key={field.key}
            label={field.label}
            help={field.help}
            placeholder={field.placeholder}
            value={trip.providerSettings[field.key] ?? ''}
            validate={field.validate}
            onSave={(value) =>
              onChange((t) => ({ ...t, providerSettings: { ...t.providerSettings, [field.key]: value }, updatedAt: Date.now() }))
            }
          />
        ))}
        <p className="muted small">
          WhereThen stores only metadata and references in this browser. Place names are looked up with OpenStreetMap
          Nominatim, which receives the approximate coordinates of each place.
        </p>
      </details>
    </div>
  );
}

function SettingField(props: {
  label: string;
  help?: string;
  placeholder?: string;
  value: string;
  validate?: (v: string) => string | undefined;
  onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(props.value);
  const error = props.validate?.(value.trim());
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        value={value}
        placeholder={props.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !error && value.trim() !== props.value && props.onSave(value.trim())}
      />
      {error ? <small className="error-text">{error}</small> : props.help && <small className="muted">{props.help}</small>}
    </label>
  );
}
