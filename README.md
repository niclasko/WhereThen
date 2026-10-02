# WhereThen

**Where were you, and when?** WhereThen turns the photos from a holiday into a map of the places you visited, with a colour-coded timeline underneath.

- 📷 Pick a set of photos from your phone (iCloud Photos to start with)
- 🏷️ Get a suggested trip name (e.g. *Summer Holiday 2026 – Italy*, *Weekend in Paris*), or type your own
- 🗺️ See numbered, colour-coded places on a map, connected in the order you visited them
- 🕒 See a timeline whose colours and numbers match the map, grouped by day
- 🔒 Personal and browser-only: **metadata** (capture time, GPS position, file name, camera), a **reference** and a small **preview** of each photo are stored in your browser's IndexedDB. There is no account or server, and photos are never uploaded.

## Choosing photos from iCloud Photos

**iPhone / iPad (Safari)**
1. Open the app and tap **New trip → Choose from iCloud Photos**. The Photos picker shows your whole iCloud Photos library, including photos that are only stored in iCloud.
2. Select the trip's photos. **Before tapping Add, tap _Options_ and turn on _Location_.** Otherwise iOS strips GPS data from photos handed to web pages.
3. Check or change the suggested name, then tap **Create trip**.

**Mac (Safari)**: in the file dialog, select **Photos** in the sidebar to browse your iCloud Photos library.

**Windows**: Apple offers no web-based iCloud Photos picker, so websites can't browse iCloud online. Install [iCloud for Windows](https://support.apple.com/en-us/103232) with Photos turned on, then pick from **Gallery** or **iCloud Photos** in the file dialog's left pane. Cloud-only photos are downloaded on demand.

**Android / other**: download the originals from icloud.com/photos (as *Unmodified Original*, to keep locations) and pick those files.

The button label and instructions adapt to the device, so each device only sees its own steps.

**Viewing photos**: tap a photo to see its preview full screen (swipe or use the arrow keys to browse). Apple has no web link to a single photo in iCloud Photos, so "Find in iCloud Photos" opens the library and tells you the date and time to look for.

> Apple offers no public web API for iCloud Photos, so the app can't sign in to iCloud itself. It relies on the system photo picker, which reads from your iCloud library. iCloud Shared Album links aren't used as a source because Apple removes GPS data from shared albums. A reference is the file name plus a size-based identifier, alongside the capture time. Providers with a picker API (Google Photos, OneDrive, …) can implement `pick()` to connect to the cloud account directly and store real asset IDs and deep links. See below.

## Features

- **Detail level**: group photos into *Spots* (300 m), *Neighbourhoods* (2 km), *Towns* (10 km, default) or *Regions* (50 km).
- **Place names** come from OpenStreetMap Nominatim (rate-limited to 1 request/second and cached locally). You can rename any place.
- **Add photos** to an existing trip. Duplicates are skipped, and existing places and names are kept.
- **Photo previews** (always on): 640 px JPEG previews of about 10–40 KB each are made on your device when you import and stored with the trip in this browser's IndexedDB. They are never uploaded. Photos the browser can't decode (e.g. HEIC on Windows) show a 📷 placeholder. To add previews to an older trip, use "+ Add photos" and choose the same photos again.
- **Import progress**: a progress bar with photo count, located count, time remaining and Cancel. On iPhone, photos stored only in iCloud are downloaded by iOS before the page receives them. That phase can't be measured, so a "Waiting for your photos…" indicator is shown once the picker closes (not while you're still choosing).
- **Export a trip** (⬇ Export): downloads the whole trip (map, timeline, place names and previews) as one `.wherethen.json` file. On iPhone it goes to Files (iCloud Drive › Downloads by default). Do what you like with it: keep it as a backup, or send it via Messages, Mail or AirDrop. Anyone can open it in WhereThen with **Import trip file…** to get their own copy. The file contains photo times, positions, file names and previews (not the original photos), so only send it to people you'd show the photos to. A trip of about 300 photos is roughly 10 MB.
- **Export all trips / Import trip file…** to back up or move all trips between devices.

## Where your trips are stored

Everything lives in this browser on this device. Other browsers and devices don't see it, and clearing site data deletes it. WhereThen asks the browser for persistent storage, but on iPhone/iPad Safari may still delete data for sites you haven't opened for 7 days. Apps added to the Home Screen are exempt, so WhereThen is installable (web app manifest and icons) and shows a one-time hint on iPhone/iPad: tap **Share → Add to Home Screen** and open it from there. The Home Screen app has its own storage, separate from Safari, so move existing trips with **Export all trips** in Safari and **Import trip file…** in the app. Exporting now and then is still a good backup.

## Privacy

| Data | Where it goes |
| --- | --- |
| Photo bytes | Read locally to extract EXIF, then discarded. Never uploaded. |
| Photo previews | IndexedDB in your browser, and trip files you export |
| Metadata and references | IndexedDB in your browser |
| Place coordinates (one per place, not per photo) | OpenStreetMap Nominatim, for place names |
| Map view | OpenStreetMap tile servers |

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN, so you can open it on your phone)
npm test           # unit tests (vitest)
npm run build      # typecheck + production build into dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`. Enable it under *Settings → Pages → Source: GitHub Actions*. On a phone, the app needs HTTPS or localhost for all browser features, so GitHub Pages is the easiest way to use it from your iPhone.

### Project layout

```
src/
  providers/        Photo storage providers (pluggable)
    types.ts        PhotoProvider interface
    icloud.ts       iCloud Photos provider
    index.ts        Provider registry
  lib/
    exif.ts         EXIF extraction (exifr): time with UTC offset, GPS, camera
    trip.ts         Clustering photos into places, deriving visits, colours
    naming.ts       Trip name suggestions
    geocode.ts      Reverse geocoding (pluggable Geocoder, Nominatim implementation)
    importer.ts     Provider photos → metadata records → trip
    storage.ts      IndexedDB persistence, export format
  components/       React UI (map, timeline, import, trip list)
```

### Adding a photo provider

Implement `PhotoProvider` (`src/providers/types.ts`) and add it to the registry in `src/providers/index.ts`:

- File-picker based services implement `fromFiles(files)` and return a `PhotoRef` per file.
- API-based services (e.g. the Google Photos Picker API or Microsoft Graph for OneDrive) implement `pick()`. It can return `metadata` (time, GPS) directly from the API, and a `file` blob only when EXIF needs to be read.
- `pickLabel` is the text of the picker button (e.g. "Choose from Google Photos").
- `getViewUrl(ref)` returns a safe `https` link to the original photo (or the library, if the service has no per-photo links), and `viewLabel` is its link text.

The rest of the app (clustering, timeline, map, storage) is provider-agnostic.
