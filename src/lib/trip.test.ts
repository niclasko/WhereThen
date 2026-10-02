import { describe, expect, it } from 'vitest';
import type { PhotoRecord, Place } from '../types';
import { assignPlaces, computeVisits, reclusterTrip } from './trip';
import { suggestTripName, seasonFor } from './naming';
import { labelFromNominatim, zoomForRadius } from './geocode';
import { formatRange } from './format';
import { icloudProvider, detectPlatform, icloudPickerGuide } from '../providers/icloud';
import { safeColor, safeImageSrc } from './nav';
import { createTrip, addPhotosToTrip } from './importer';

let n = 0;
function photo(localTime: string, lat: number | null, lon: number | null, name = `IMG_${++n}.HEIC`): PhotoRecord {
  return {
    id: `p${n}-${localTime}`,
    ref: { providerId: 'icloud', externalId: `${name}:1`, fileName: name },
    localTime,
    timestamp: Date.parse(`${localTime}Z`),
    timeSource: 'exif',
    lat,
    lon,
  };
}

const ROME = [41.9028, 12.4964] as const;
const ROME2 = [41.9009, 12.4833] as const; // ~1.1 km away
const FLORENCE = [43.7696, 11.2558] as const;

describe('clustering and visits', () => {
  const photos = [
    photo('2026-07-10T09:00:00', ...ROME),
    photo('2026-07-10T12:00:00', ...ROME2),
    photo('2026-07-12T10:00:00', ...FLORENCE),
    photo('2026-07-13T10:00:00', ...FLORENCE),
    photo('2026-07-14T18:00:00', ...ROME),
    photo('2026-07-14T19:00:00', null, null),
  ];

  it('groups nearby photos into places and colours them by first visit', () => {
    const { photos: assigned, places } = assignPlaces(photos, [], 2);
    expect(places).toHaveLength(2);
    expect(assigned[0].placeId).toBe(assigned[1].placeId);
    expect(assigned[2].placeId).not.toBe(assigned[0].placeId);
    expect(assigned[5].placeId).toBeUndefined();
    expect(places[0].id).toBe(assigned[0].placeId);
    expect(places[0].color).not.toBe(places[1].color);
  });

  it('uses finer places with a smaller radius', () => {
    expect(assignPlaces(photos, [], 0.3).places).toHaveLength(3);
  });

  it('derives visits in time order, including revisits', () => {
    const { photos: assigned } = assignPlaces(photos, [], 2);
    const visits = computeVisits(assigned);
    expect(visits.map((v) => v.photoIds.length)).toEqual([2, 2, 1]);
    expect(visits[0].placeId).toBe(visits[2].placeId);
    expect(visits[1].startLocal).toBe('2026-07-12T10:00:00');
    expect(visits[1].endLocal).toBe('2026-07-13T10:00:00');
  });

  it('keeps existing places (and their labels) when photos are added', () => {
    const trip = createTrip('icloud', photos.slice(0, 2));
    const labelled = { ...trip, places: trip.places.map((p) => ({ ...p, label: { name: 'Rome', country: 'Italy' } })) };
    const { trip: next, added } = addPhotosToTrip(labelled, [photos[1], photo('2026-07-11T10:00:00', ...FLORENCE)]);
    expect(added).toBe(1);
    expect(next.places).toHaveLength(2);
    expect(next.places[0].label?.name).toBe('Rome');
    expect(next.photos).toHaveLength(3);
  });

  it('fills in missing previews when known photos are added again', () => {
    const trip = createTrip('icloud', photos.slice(0, 2));
    const again = { ...photos[0], id: 'other', thumbnail: 'data:image/jpeg;base64,AAAA' };
    const { trip: next, added, previews } = addPhotosToTrip(trip, [again]);
    expect(added).toBe(0);
    expect(previews).toBe(1);
    expect(next.photos.find((p) => p.id === photos[0].id)?.thumbnail).toBe(again.thumbnail);
    expect(next.photos).toHaveLength(2);
  });

  it('reclusters a trip', () => {
    const trip = createTrip('icloud', photos);
    expect(reclusterTrip(trip, 500).places).toHaveLength(1);
  });
});

describe('name suggestions', () => {
  const label = (name: string, country: string): Place['label'] => ({ name, locality: name, country });

  function named(photos: PhotoRecord[], labels: Record<string, Place['label']>) {
    const { photos: assigned, places } = assignPlaces(photos, [], 2);
    const labelled = places.map((p) => {
      const key = Object.keys(labels).find((k) => {
        const [lat, lon] = k.split(',').map(Number);
        return Math.abs(lat - p.lat) < 0.1 && Math.abs(lon - p.lon) < 0.1;
      });
      return { ...p, label: key ? labels[key] : undefined };
    });
    return suggestTripName(assigned, labelled);
  }

  it('suggests a seasonal holiday name with countries', () => {
    const name = named(
      [
        photo('2026-07-10T09:00:00', ...ROME),
        photo('2026-07-12T09:00:00', ...FLORENCE),
        photo('2026-07-15T09:00:00', 48.8566, 2.3522),
        photo('2026-07-16T09:00:00', 48.8566, 2.3522),
      ],
      { [ROME.join()]: label('Rome', 'Italy'), [FLORENCE.join()]: label('Florence', 'Italy'), '48.8566,2.3522': label('Paris', 'France') },
    );
    expect(name).toBe('Summer Holiday 2026 – Italy & France');
  });

  it('uses the city when one place dominates', () => {
    const photos = [
      photo('2026-12-01T09:00:00', ...ROME),
      photo('2026-12-02T09:00:00', ...ROME),
      photo('2026-12-04T09:00:00', ...ROME),
      photo('2026-12-05T09:00:00', ...ROME),
    ];
    expect(named(photos, { [ROME.join()]: label('Rome', 'Italy') })).toBe('Winter Holiday 2026 – Rome');
  });

  it('handles day trips, weekends and missing data', () => {
    expect(named([photo('2026-07-14T09:00:00', ...ROME)], { [ROME.join()]: label('Rome', 'Italy') })).toMatch(/^Day in Rome – /);
    // 2026-07-10 is a Friday
    expect(named([photo('2026-07-10T18:00:00', ...ROME), photo('2026-07-12T12:00:00', ...ROME)], { [ROME.join()]: label('Rome', 'Italy') })).toBe(
      'Weekend in Rome',
    );
    expect(suggestTripName([], [])).toBe('New trip');
    expect(named([photo('2026-04-01T09:00:00', ...ROME), photo('2026-04-09T09:00:00', ...ROME)], {})).toBe('Spring Holiday 2026');
  });

  it('flips seasons in the southern hemisphere', () => {
    expect(seasonFor(1)).toBe('Winter');
    expect(seasonFor(1, true)).toBe('Summer');
  });
});

describe('geocoding labels', () => {
  const sample = {
    name: 'Colosseo',
    address: { tourism: 'Colosseo', suburb: 'Monti', city: 'Roma', state: 'Lazio', country: 'Italia', country_code: 'it' },
  };
  it('picks names appropriate to the level of detail', () => {
    expect(labelFromNominatim(sample, zoomForRadius(0.3))).toMatchObject({ name: 'Colosseo, Roma', country: 'Italia', countryCode: 'IT' });
    expect(labelFromNominatim(sample, zoomForRadius(2))?.name).toBe('Monti, Roma');
    expect(labelFromNominatim(sample, zoomForRadius(10))?.name).toBe('Roma');
    expect(labelFromNominatim(sample, zoomForRadius(50))?.name).toBe('Lazio');
    expect(labelFromNominatim(null, 10)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats ranges', () => {
    expect(formatRange('2026-07-14T10:05:00', '2026-07-14T16:40:00')).toMatch(/10:05–16:40$/);
    expect(formatRange('2026-07-14T10:05:00', '2026-07-16T09:12:00')).toMatch(/10:05 – .*09:12$/);
  });
});

describe('iCloud provider and sanitising', () => {
  it('links to iCloud Photos', () => {
    const ref = { providerId: 'icloud', externalId: 'a', fileName: 'a.jpg' };
    expect(icloudProvider.getViewUrl(ref)).toBe('https://www.icloud.com/photos/');
    expect(icloudProvider.viewLabel).toBe('Find in iCloud Photos');
  });

  it('detects the platform for picker guidance', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('mac');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/140')).toBe('windows');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15)')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('other');
    expect(icloudPickerGuide('windows').pickLabel).not.toMatch(/^Choose from iCloud/);
    expect(icloudPickerGuide('ios').pickLabel).toBe('Choose from iCloud Photos');
    // Each device only gets its own instructions.
    expect(icloudPickerGuide('ios').instructions.join(' ')).not.toMatch(/Windows|Android/);
    expect(icloudPickerGuide('windows').instructions.join(' ')).not.toMatch(/iPhone|Android/);
    expect(icloudPickerGuide('android').instructions.join(' ')).not.toMatch(/Windows|iPhone/);
  });

  it('sanitises colours and image sources', () => {
    expect(safeColor('#e6194b')).toBe('#e6194b');
    expect(safeColor('hsl(120 65% 45%)')).toBe('hsl(120 65% 45%)');
    expect(safeColor('red"><img src=x onerror=alert(1)>')).toBe('#888888');
    expect(safeImageSrc('data:image/jpeg;base64,AAAA')).toBeDefined();
    expect(safeImageSrc('javascript:alert(1)')).toBeUndefined();
  });
});
