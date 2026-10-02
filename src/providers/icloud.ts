import type { PhotoProvider } from './types';

const ICLOUD_PHOTOS_URL = 'https://www.icloud.com/photos/';

export function isICloudUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'icloud.com' || url.hostname.endsWith('.icloud.com'));
  } catch {
    return false;
  }
}

/**
 * iCloud Photos has no public web API, so photos are selected with the iPhone photo picker.
 * We keep a reference (file name + size, plus capture time in the record) and link back to
 * iCloud Photos or, when provided, an iCloud Shared Album / iCloud link.
 */
export const icloudProvider: PhotoProvider = {
  id: 'icloud',
  name: 'iCloud Photos',
  description: 'Choose photos straight from your iCloud Photos library. Nothing is uploaded.',
  pickLabel: 'Choose from iCloud Photos',
  instructions: [
    'iPhone / iPad (Safari): tap “Choose from iCloud Photos”. The Photos picker shows your whole iCloud library, including photos not stored on the device.',
    'Before tapping Add, tap “Options” at the top and make sure “Location” is turned on. Otherwise iOS removes the GPS data.',
    'Mac (Safari): in the file dialog, select “Photos” in the sidebar to browse your iCloud Photos library.',
    'Windows: install iCloud for Windows with Photos turned on, then open the “iCloud Photos” folder in the file dialog.',
    'Only metadata (time, location, file name) is saved in this browser. The photos stay in iCloud.',
  ],
  settingsFields: [
    {
      key: 'sharedAlbumUrl',
      label: 'iCloud Shared Album link (optional)',
      placeholder: 'https://www.icloud.com/sharedalbum/#...',
      help: 'If you share the trip as an iCloud Shared Album or iCloud link, paste it here so “Open in iCloud” goes straight to it.',
      validate: (value) => (value && !isICloudUrl(value) ? 'Must be an https://…icloud.com link' : undefined),
    },
  ],
  fileAccept: 'image/*,.heic,.heif',
  async fromFiles(files) {
    return files.map((file) => ({
      ref: {
        providerId: 'icloud',
        externalId: `${file.name}:${file.size}`,
        fileName: file.name,
      },
      file,
    }));
  },
  getViewUrl(_ref, settings) {
    const shared = settings.sharedAlbumUrl?.trim();
    return shared && isICloudUrl(shared) ? shared : ICLOUD_PHOTOS_URL;
  },
  viewLabel: 'Open in iCloud',
};
