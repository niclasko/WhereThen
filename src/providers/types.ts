import type { PhotoRef } from '../types';
import type { ExtractedMetadata } from '../lib/exif';

export interface ProviderSettingField {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  /** Returns an error message when the value is invalid. */
  validate?: (value: string) => string | undefined;
}

/**
 * A photo handed over by a provider. `file` is only used transiently in the browser to read
 * metadata (and optionally a local thumbnail); it is never uploaded or persisted.
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
  settingsFields: ProviderSettingField[];
  /** `accept` attribute for the file input. Required when `fromFiles` is implemented. */
  fileAccept?: string;
  fromFiles?(files: File[], settings: Record<string, string>): Promise<ProviderPhoto[]>;
  pick?(settings: Record<string, string>): Promise<ProviderPhoto[]>;
  /** A safe https URL where the user can view the original photo, if one is available. */
  getViewUrl(ref: PhotoRef, settings: Record<string, string>): string | undefined;
  viewLabel: string;
}
