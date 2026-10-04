# WhereThen

**Where were you, and when?** WhereThen turns your holiday photos into a map of the places you visited, with a colour-coded timeline underneath.

👉 **[Open WhereThen](https://niclasko.github.io/WhereThen/)**: it runs in your browser, with nothing to install.
- 📷 Pick the trip's photos from your phone (iCloud Photos to start with)
- 🏷️ Get a suggested trip name, like *Summer Holiday 2026 – Italy*, or type your own
- 🗺️ See your places on a map, numbered and coloured to match the timeline
- 🚗 See the route between places, with distances and travel times
- 🧭 Open the whole route in Bing Maps
- 🔒 Private: your photos are never uploaded, and there's no account

## Getting started

**iPhone / iPad**: tap **New trip → Choose from iCloud Photos** and select your photos. Before tapping **Add**, tap **Options** and turn on **Location**, or iOS removes where the photos were taken. For hundreds of photos, add about 50 at a time.

**Mac**: choose **Photos** in the sidebar of the file dialog.

**Windows**: install [iCloud for Windows](https://support.apple.com/en-us/103232) with Photos turned on, then pick from **iCloud Photos** in the file dialog.

The app shows the right steps for your device.

## Using it

- **Tap a pin or a timeline item** to see that place's photos, with the date and street of each one.
- **Pick a detail level** (Spots, Neighbourhoods, Towns, Regions) to group photos the way you like.
- **Tap ☰ Filter** to show only some photos: pick days, a time of day (morning, afternoon, evening, night), what's in the photo (with AI captions), or search. The map and timeline update straight away.
- **Rename** any place or the trip.
- **Add or remove photos** at any time. Adding the same photo twice is ignored.
- **Export** a trip to a file to keep as a backup or send to someone. They can open it with **Import trip file…**.
- **✨ AI captions (optional)**: tap **✨** at the top and add your own OpenAI or Azure AI key. Every photo then gets a short caption, a few tags and a category (food, sights, beach…) in the background, so you can search and filter by them. You pay your AI provider directly, usually a few cents per 100 photos. Without a key, nothing changes.

## Keep your trips safe

Trips are saved in your browser on this device only. On iPhone, add WhereThen to your Home Screen (**Share → Add to Home Screen**) so Safari doesn't delete them, and use **Export** now and then as a backup.

## Privacy

Your photos stay on your device and in iCloud; WhereThen only keeps small previews and details like time and location, in your browser. To show names, maps and routes, the locations of your places are sent to OpenStreetMap services. If you turn on AI captions, photo previews and place names are sent to your own AI service; your key stays in your browser and is never included in exported files.

## For developers

```bash
npm install
npm run dev     # start locally
npm test        # run tests
npm run build   # production build
```

Pushing to `main` deploys to [GitHub Pages](https://niclasko.github.io/WhereThen/). New photo services (Google Photos, OneDrive, …) can be added by implementing `PhotoProvider` in `src/providers/`.
