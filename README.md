# WhereThen

**Where were you, and when?** WhereThen turns the photos from a holiday into a map of the places you visited, with a colour-coded timeline underneath.

- 📷 Pick a set of photos from your phone (iCloud Photos to start with)
- 🏷️ Get a suggested trip name (e.g. *Summer Holiday 2026 – Italy*, *Weekend in Paris*), or type your own
- 🗺️ See numbered, colour-coded places on a map, connected in the order you visited them
- 🕒 See a timeline whose colours and numbers match the map, grouped by day
- 🔒 Only **metadata** (capture time, GPS position, file name, camera) and a **reference** to each photo are stored, in your browser's IndexedDB. Photos are never uploaded.

## Using it on an iPhone

1. Open the app in Safari and tap **New trip → Choose photos**.
2. Select the trip's photos. **Before tapping Add, tap _Options_ and turn on _Location_.** Otherwise iOS strips GPS data from photos handed to web pages.
3. Check or change the suggested name, then tap **Create trip**.

Optionally paste an iCloud Shared Album / iCloud link for the trip. "Open in iCloud" then links straight to it. Otherwise it opens iCloud Photos.

> iCloud Photos has no public web API, so a reference is the file name plus a size-based identifier, alongside the capture time. A provider with an API (Google Photos, OneDrive, …) can store real asset IDs and deep links. See below.

## Features

- **Detail level**: group photos into *Spots* (300 m), *Neighbourhoods* (2 km), *Towns* (10 km, default) or *Regions* (50 km).
- **Place names** come from OpenStreetMap Nominatim (rate-limited to 1 request/second and cached locally). You can rename any place.
- **Add photos** to an existing trip. Duplicates are skipped, and existing places and names are kept.
- **Optional thumbnails**: keep tiny previews in this browser only (off by default).
- **Export / import** trips as JSON to back up or move them between devices. Browser storage is per device and per browser.

## Privacy

| Data | Where it goes |
| --- | --- |
| Photo bytes | Read locally to extract EXIF, then discarded. Never uploaded. |
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
- `getViewUrl(ref, settings)` returns a safe `https` deep link to the original photo.
- `settingsFields` declares per-trip settings (such as the iCloud shared album link), which are rendered automatically.

The rest of the app (clustering, timeline, map, storage) is provider-agnostic.
