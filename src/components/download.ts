import type { Trip } from '../types';
import type { TripExport } from '../lib/storage';

function tripsFile(trips: Trip[], fileName: string): File {
  const data: TripExport = { app: 'WhereThen', version: 1, trips };
  return new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' });
}

export function downloadTrips(trips: Trip[], fileName: string) {
  const url = URL.createObjectURL(tripsFile(trips, fileName));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
}
