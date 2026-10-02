import type { Trip } from '../types';
import type { TripExport } from '../lib/storage';

function tripsFile(trips: Trip[], fileName: string): File {
  const data: TripExport = { app: 'WhereThen', version: 1, trips };
  return new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' });
}

export function downloadTrips(trips: Trip[], fileName: string) {
  download(tripsFile(trips, fileName));
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads one trip (map, timeline, places and previews) as a `.wherethen.json` file. */
export function exportTrip(trip: Trip) {
  download(tripsFile([trip], `${slug(trip.name)}.wherethen.json`));
}

export function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
}
