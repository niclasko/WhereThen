import { useMemo, useState } from 'react';
import type { PhotoRecord, Trip } from '../types';
import { providers, getProvider, type ProviderPhoto } from '../providers';
import { addPhotosToTrip, createTrip, toPhotoRecords } from '../lib/importer';
import { formatDateSpan } from '../lib/format';

interface Props {
  existingTrip?: Trip;
  onDone: (trip: Trip) => Promise<void>;
  onCancel: () => void;
}

export function ImportView({ existingTrip, onDone, onCancel }: Props) {
  const [providerId, setProviderId] = useState(existingTrip?.providerId ?? providers[0].id);
  const provider = getProvider(providerId);
  const [settings, setSettings] = useState<Record<string, string>>(existingTrip?.providerSettings ?? {});
  const [keepThumbnails, setKeepThumbnails] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [records, setRecords] = useState<PhotoRecord[]>();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();

  const preview = useMemo(
    () => (records && !existingTrip ? createTrip(providerId, settings, records) : undefined),
    [records, existingTrip, providerId, settings],
  );

  const settingErrors = provider.settingsFields
    .map((f) => f.validate?.(settings[f.key]?.trim() ?? ''))
    .filter(Boolean);

  async function handle(items: ProviderPhoto[]) {
    setError(undefined);
    setRecords(undefined);
    setProgress({ done: 0, total: items.length });
    try {
      const result = await toPhotoRecords(items, {
        keepThumbnails,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setRecords(result);
      if (!existingTrip) setName(createTrip(providerId, settings, result).suggestedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the photos');
    } finally {
      setProgress(undefined);
    }
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length || !provider.fromFiles) return;
    await handle(await provider.fromFiles([...list], settings));
  }

  async function save() {
    if (!records) return;
    const cleanSettings = Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v.trim()]));
    if (existingTrip) {
      const { trip } = addPhotosToTrip({ ...existingTrip, providerSettings: cleanSettings }, records);
      await onDone(trip);
    } else {
      const suggestion = preview?.suggestedName ?? '';
      const trip = createTrip(providerId, cleanSettings, records, name.trim() === suggestion ? undefined : name);
      await onDone(trip);
    }
  }

  const located = records?.filter((r) => r.lat !== null).length ?? 0;
  const times = records?.map((r) => r.localTime).filter((t): t is string => !!t).sort() ?? [];
  const duplicates = existingTrip && records
    ? records.filter((r) => existingTrip.photos.some((p) => p.ref.externalId === r.ref.externalId)).length
    : 0;

  return (
    <div className="import card">
      <h1>{existingTrip ? `Add photos to “${existingTrip.name}”` : 'New trip'}</h1>

      {providers.length > 1 && !existingTrip && (
        <label className="field">
          <span>Photo source</span>
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="provider-box">
        <strong>{provider.name}</strong>
        <p className="muted">{provider.description}</p>
        <ol className="steps">
          {provider.instructions.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <label className="check">
        <input type="checkbox" checked={keepThumbnails} onChange={(e) => setKeepThumbnails(e.target.checked)} />
        <span>
          Keep small preview thumbnails in this browser <span className="muted">(never uploaded, optional)</span>
        </span>
      </label>

      <div className="pick-row">
        {provider.fromFiles && (
          <label className={`button primary ${progress ? 'disabled' : ''}`}>
            <span aria-hidden>☁️</span> {provider.pickLabel}
            <input
              type="file"
              multiple
              accept={provider.fileAccept}
              hidden
              disabled={!!progress}
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
        {provider.pick && (
          <button className="button primary" disabled={!!progress} onClick={async () => handle(await provider.pick!(settings))}>
            {provider.pickLabel}
          </button>
        )}
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {progress && (
        <div className="progress" role="status">
          Reading metadata… {progress.done}/{progress.total}
          <progress value={progress.done} max={progress.total} />
        </div>
      )}
      {error && <p className="notice error">{error}</p>}

      {records && (
        <section className="summary">
          <h2>
            {records.length} photo{records.length === 1 ? '' : 's'} selected
          </h2>
          <ul className="facts">
            <li>
              📍 {located} with location{preview ? ` → ${preview.places.length} place${preview.places.length === 1 ? '' : 's'}` : ''}
            </li>
            {times.length > 0 && <li>🗓️ {formatDateSpan(times[0], times[times.length - 1])}</li>}
            {duplicates > 0 && <li>↺ {duplicates} already in this trip (will be skipped)</li>}
          </ul>
          {located < records.length && (
            <p className="notice">
              {records.length - located} photo{records.length - located === 1 ? ' has' : 's have'} no GPS location and
              won’t appear on the map. On iPhone, tap <strong>Options</strong> in the photo picker and turn on{' '}
              <strong>Location</strong>, then choose the photos again.
            </p>
          )}

          {!existingTrip && (
            <label className="field">
              <span>Trip name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={preview?.suggestedName} />
              <small className="muted">
                Suggested from your photos. It gets more specific once place names are looked up, unless you change it.
              </small>
            </label>
          )}

          {provider.settingsFields.map((field) => (
            <label className="field" key={field.key}>
              <span>{field.label}</span>
              <input
                value={settings[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
              />
              {field.help && <small className="muted">{field.help}</small>}
            </label>
          ))}
          {settingErrors.map((msg) => (
            <p key={msg} className="notice error">
              {msg}
            </p>
          ))}

          <div className="pick-row">
            <button className="button primary" onClick={save} disabled={settingErrors.length > 0 || records.length === 0}>
              {existingTrip ? 'Add to trip' : 'Create trip'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
