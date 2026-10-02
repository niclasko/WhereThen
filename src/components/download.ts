import type { Trip } from '../types';
import type { TripExport } from '../lib/storage';

export function downloadTrips(trips: Trip[], fileName: string) {
  const data: TripExport = { app: 'WhereThen', version: 1, trips };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
}
