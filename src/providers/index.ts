import { icloudProvider } from './icloud';
import type { PhotoProvider } from './types';

/** Register new photo providers here (e.g. Google Photos, OneDrive). */
export const providers: PhotoProvider[] = [icloudProvider];

export function getProvider(id: string): PhotoProvider {
  const provider = providers.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown photo provider: ${id}`);
  return provider;
}

export type { PhotoProvider, ProviderPhoto, ProviderSettingField } from './types';
