import type { PhotoRef } from '../types';
import type { ExtractedMetadata } from '../lib/exif';

/**
 * A photo handed over by a provider. `file` is only used transiently in the browser to read
 * metadata and make a preview; the photo itself is never uploaded or persisted.
 */
export interface ProviderPhoto {
  ref: PhotoRef;
  file?: Blob;
  metadata?: Partial<ExtractedMetadata>;
}

/**
 * A photo storage service (iCloud, Google Photos, OneDrive, ...).
 *
 * Providers can obtain photos either from the browser file picker (`fromFiles`) or through
 * their own picker/API (`pick`), e.g. an OAuth-based photo picker.
 */
export interface PhotoProvider {
  id: string;
  name: string;
  description: string;
  /** Label for the button that opens the photo picker, e.g. "Choose from iCloud Photos". */
  pickLabel: string;
  /** Step-by-step instructions shown on the import screen. */
  instructions: string[];
  /** `accept` attribute for the file input. Required when `fromFiles` is implemented. */
  fileAccept?: string;
  fromFiles?(files: File[]): Promise<ProviderPhoto[]>;
  pick?(): Promise<ProviderPhoto[]>;
  /** A safe https URL that opens this exact photo. Omit when the service has no per-photo links. */
  getViewUrl?(ref: PhotoRef): string | undefined;
  /** Link text for `getViewUrl`, e.g. "Open in Google Photos". */
  viewLabel?: string;
}