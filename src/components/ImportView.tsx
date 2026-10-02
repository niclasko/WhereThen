import { useEffect, useMemo, useRef, useState } from 'react';
import type { PhotoRecord, Trip } from '../types';
import { providers, getProvider, type ProviderPhoto } from '../providers';
import { addPhotosToTrip, createTrip, toPhotoRecords } from '../lib/importer';
import { formatDateSpan } from '../lib/format';
import { ImportProgressPanel, type ImportProgress } from './ImportProgress';

interface Props {
  existingTrip?: Trip;
  onDone: (trip: Trip) => Promise<void>;
  onCancel: () => void;
}

export function ImportView({ existingTrip, onDone, onCancel }: Props) {
  const [providerId, setProviderId] = useState(existingTrip?.providerId ?? providers[0].id);
  const provider = getProvider(providerId);
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>();
  const [records, setRecords] = useState<PhotoRecord[]>();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = picking || !!progress;

  // Set while the system file/photo picker is open. Browsers don't report the "Add"/✓ tap itself, so the
  // waiting indicator is shown only once the page gets focus back (picker closed), not while picking.
  const pickerOpenedAt = useRef<number>(undefined);
  const waitTimer = useRef<number>(undefined);

  useEffect(() => {
    const input = fileInputRef.current;
    // Browsers fire "cancel" when the picker is closed without choosing anything.
    const onCancel = () => {
      pickerOpenedAt.current = undefined;
      setPicking(false);
    };
    const onPickerClosed = () => {
      const openedAt = pickerOpenedAt.current;
      if (openedAt === undefined || document.visibilityState !== 'visible' || Date.now() - openedAt < 500) return;
      // Give "change"/"cancel" a moment to arrive first, so a cancelled picker doesn't flash the indicator.
      window.clearTimeout(waitTimer.current);
      waitTimer.current = window.setTimeout(() => {
        if (pickerOpenedAt.current !== undefined) setPicking(true);
      }, 400);
    };
    input?.addEventListener('cancel', onCancel);
    window.addEventListener('focus', onPickerClosed);
    document.addEventListener('visibilitychange', onPickerClosed);
    return () => {
      input?.removeEventListener('cancel', onCancel);
      window.removeEventListener('focus', onPickerClosed);
      document.removeEventListener('visibilitychange', onPickerClosed);
      window.clearTimeout(waitTimer.current);
    };
  }, [provider]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const preview = useMemo(
    () => (records && !existingTrip ? createTrip(providerId, records) : undefined),
    [records, existingTrip, providerId],
  );

  async function handle(items: ProviderPhoto[]) {
    setPicking(false);
    setError(undefined);
    setRecords(undefined);
    if (!items.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    setProgress({ done: 0, total: items.length, located: 0, startedAt });
    try {
      const result = await toPhotoRecords(items, {
        signal: controller.signal,
        onProgress: (p) => setProgress({ ...p, startedAt }),
      });
      setRecords(result);
      if (!existingTrip) setName(createTrip(providerId, result).suggestedName);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not read the photos');
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined;
      setProgress(undefined);
    }
  }

  function cancelImport() {
    abortRef.current?.abort();
    pickerOpenedAt.current = undefined;
    setPicking(false);
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length || !provider.fromFiles) {
      setPicking(false);
      return;
    }
    await handle(await provider.fromFiles([...list]));
  }

  async function save() {
    if (!records) return;
    if (existingTrip) {
      await onDone((addResult ?? addPhotosToTrip(existingTrip, records)).trip);
    } else {
      const suggestion = preview?.suggestedName ?? '';
      const trip = createTrip(providerId, records, name.trim() === suggestion ? undefined : name);
      await onDone(trip);
    }
  }

  const located = records?.filter((r) => r.lat !== null).length ?? 0;
  const times = records?.map((r) => r.localTime).filter((t): t is string => !!t).sort() ?? [];
  const addResult = useMemo(
    () => (existingTrip && records ? addPhotosToTrip(existingTrip, records) : undefined),
    [existingTrip, records],
  );
  const duplicates = addResult && records ? records.length - addResult.added : 0;
  const newPreviews = addResult?.previews ?? 0;

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

      <div className="pick-row">
        {provider.fromFiles && (
          <label className={`button primary ${progress ? 'disabled' : ''}`}>
            <span aria-hidden>☁️</span> {provider.pickLabel}
            {/* Disabling on `picking` would re-render before the browser opens the picker and block it. */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={provider.fileAccept}
              hidden
              disabled={!!progress}
              onClick={() => {
                setError(undefined);
                pickerOpenedAt.current = Date.now();
              }}
              onChange={(e) => {
                pickerOpenedAt.current = undefined;
                void onFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
        {provider.pick && (
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setPicking(true);
              try {
                await handle(await provider.pick!());
              } catch (err) {
                setPicking(false);
                setError(err instanceof Error ? err.message : 'Could not open the photo picker');
              }
            }}
          >
            {provider.pickLabel}
          </button>
        )}
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {(picking || progress) && <ImportProgressPanel picking={picking} progress={progress} onCancel={cancelImport} />}
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
            {duplicates > 0 && (
              <li>
                ↺ {duplicates} already in this trip (will be skipped
                {newPreviews > 0 ? `, but ${newPreviews} get${newPreviews === 1 ? 's' : ''} a preview` : ''})
              </li>
            )}
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

          <div className="pick-row">
            <button className="button primary" onClick={save} disabled={records.length === 0}>
              {existingTrip ? 'Add to trip' : 'Create trip'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
