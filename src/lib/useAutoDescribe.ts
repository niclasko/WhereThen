import { useEffect, useMemo, useRef, useState } from 'react';
import type { PhotoDescription, PhotoRecord, Trip } from '../types';
import { AiError, browserLanguage, describePhoto, needsDescription, useAiSettings } from './ai';
import { formatDateTime } from './format';
import { setPhotoAi } from './trip';

export interface AiProgress {
  state: 'off' | 'idle' | 'working' | 'paused';
  error?: string;
}

const PARALLEL = 3;

/**
 * While AI captions are on, describes every photo that hasn't been described yet, in the background:
 * the open trip first, a few photos at a time. Stops (and says why) when the AI service refuses.
 */
export function useAutoDescribe(
  trips: Trip[],
  tripsRef: { current: Trip[] },
  updateTrip: (id: string, fn: (trip: Trip) => Trip) => Promise<void>,
  openTripId: string | undefined,
): { progress: AiProgress; retry: () => void } {
  const settings = useAiSettings();
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState<AiProgress>({ state: 'off' });
  const skipped = useRef(new Set<string>());
  const openTrip = useRef(openTripId);
  openTrip.current = openTripId;

  const hasPending = useMemo(
    () => trips.some((t) => t.photos.some((p) => needsDescription(p) && !skipped.current.has(p.id))),
    [trips],
  );

  useEffect(() => {
    if (!settings) return setProgress({ state: 'off' });
    if (!hasPending) return setProgress({ state: 'idle' });
    const controller = new AbortController();
    const language = browserLanguage();
    setProgress({ state: 'working' });
    void (async () => {
      for (;;) {
        if (controller.signal.aborted) return;
        const batch = nextBatch(tripsRef.current, openTrip.current, skipped.current);
        if (!batch.length) return setProgress({ state: 'idle' });
        const results = await Promise.allSettled(
          batch.map(({ trip, photo }) => describePhoto(settings, photo.thumbnail!, context(trip, photo, language), controller.signal)),
        );
        if (controller.signal.aborted) return;
        const found = new Map<string, [string, PhotoDescription][]>();
        let stop: AiError | undefined;
        results.forEach((r, i) => {
          const { trip, photo } = batch[i];
          if (r.status === 'fulfilled') found.set(trip.id, [...(found.get(trip.id) ?? []), [photo.id, r.value]]);
          else if (r.reason instanceof AiError && r.reason.photoOnly) skipped.current.add(photo.id);
          else stop ??= r.reason instanceof AiError ? r.reason : new AiError('Something went wrong.', false);
        });
        for (const [tripId, list] of found) {
          await updateTrip(tripId, (t) => list.reduce((acc, [id, ai]) => setPhotoAi(acc, id, ai), t));
        }
        if (stop) return setProgress({ state: 'paused', error: stop.message });
      }
    })();
    return () => controller.abort();
  }, [settings, hasPending, run]);

  return { progress, retry: () => setRun((n) => n + 1) };
}

function nextBatch(trips: Trip[], openTripId: string | undefined, skipped: Set<string>) {
  const ordered = [...trips].sort((a, b) => Number(b.id === openTripId) - Number(a.id === openTripId));
  const batch: { trip: Trip; photo: PhotoRecord }[] = [];
  for (const trip of ordered) {
    for (const photo of trip.photos) {
      if (batch.length === PARALLEL) return batch;
      if (needsDescription(photo) && !skipped.has(photo.id)) batch.push({ trip, photo });
    }
  }
  return batch;
}

function context(trip: Trip, photo: PhotoRecord, language: string) {
  const place = trip.places.find((p) => p.id === photo.placeId);
  const where = [place?.customName || place?.label?.name, photo.spot?.name, place?.label?.country].filter(Boolean);
  return {
    place: [...new Set(where)].join(', ') || undefined,
    when: photo.localTime ? formatDateTime(photo.localTime) : undefined,
    language,
  };
}
