import type { PhotoProvider } from './types';

export type DevicePlatform = 'ios' | 'mac' | 'windows' | 'android' | 'other';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): DevicePlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  // iPadOS Safari reports itself as a Mac, but has a touch screen.
  if (/Macintosh/.test(userAgent)) return maxTouchPoints > 1 ? 'ios' : 'mac';
  if (/Android/.test(userAgent)) return 'android';
  if (/Windows/.test(userAgent)) return 'windows';
  return 'other';
}

export const currentPlatform: DevicePlatform =
  typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints);

const ALWAYS = 'Only the time, location, file name and a small preview are saved, in this browser. The photos stay in iCloud.';

/**
 * Websites cannot browse iCloud Photos directly (Apple offers no web picker or API), so we rely on
 * the operating system's picker, which is backed by the iCloud library on Apple devices and by
 * iCloud for Windows on Windows.
 */
export function icloudPickerGuide(platform: DevicePlatform): { pickLabel: string; instructions: string[] } {
  switch (platform) {
    case 'ios':
      return {
        pickLabel: 'Choose from iCloud Photos',
        instructions: [
          'Tap “Choose from iCloud Photos” and pick “Photo Library”. It shows your whole iCloud library, including photos not stored on this device.',
          'Before tapping Add, tap “Options” at the top and turn on “Location”. Otherwise iOS removes the GPS data.',
          'Lots of photos? iOS prepares every selected photo before handing them over, which can take minutes for hundreds of photos stored only in iCloud. Picking about 50 at a time is faster: save the trip, then use “+ Add photos” for the next batch.',
          ALWAYS,
        ],
      };
    case 'mac':
      return {
        pickLabel: 'Choose from iCloud Photos',
        instructions: ['In the file dialog, select “Photos” in the sidebar to browse your iCloud Photos library.', ALWAYS],
      };
    case 'windows':
      return {
        pickLabel: 'Choose photos (iCloud Photos on this PC)',
        instructions: [
          'Apple doesn’t let websites browse iCloud Photos online, so on Windows the photos come through iCloud for Windows.',
          'Install iCloud for Windows (Microsoft Store), sign in and turn on Photos.',
          'In the file dialog, open “Gallery” or “iCloud Photos” in the left pane and select the trip’s photos. Photos that are only in the cloud are downloaded on demand.',
          ALWAYS,
        ],
      };
    case 'android':
      return {
        pickLabel: 'Choose photos',
        instructions: [
          'Apple doesn’t let websites browse iCloud Photos online, and there is no iCloud Photos app for Android.',
          'Open icloud.com/photos in your browser, select the trip’s photos and download them as “Unmodified Original” to keep the location data.',
          'Tap “Choose photos” and pick the downloaded files.',
          ALWAYS,
        ],
      };
    default:
      return {
        pickLabel: 'Choose photos',
        instructions: [
          'Apple doesn’t let websites browse iCloud Photos online. Open WhereThen on an iPhone, iPad or Mac to pick from your iCloud library.',
          'Or download the originals from icloud.com (choose “Unmodified Original” to keep location data) and select them here.',
          ALWAYS,
        ],
      };
  }
}

const guide = icloudPickerGuide(currentPlatform);

/**
 * iCloud Photos has no public web API, so photos are selected with the system photo picker.
 * We keep a reference (file name + size, plus capture time in the record).
 */
export const icloudProvider: PhotoProvider = {
  id: 'icloud',
  name: 'iCloud Photos',
  description: 'Pick photos from your iCloud Photos library. Nothing is uploaded.',
  pickLabel: guide.pickLabel,
  instructions: guide.instructions,
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
  // No getViewUrl: Apple has no web link to a single photo in iCloud Photos.
};