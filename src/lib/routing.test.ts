import { describe, expect, it } from 'vitest';
import type { Place, Visit } from '../types';
import { decodePolyline, flightArc, mapsLinks, routeKey, tripLegs } from './routing';

const place = (id: string, lat: number, lon: number, name = id): Place => ({ id, lat, lon, color: '#000', label: { name } });
const H = 3_600_000;
const visit = (placeId: string, start: number, end = start): Visit => ({
  placeId,
  start,
  end,
  startLocal: new Date(start).toISOString().slice(0, 19),
  endLocal: new Date(end).toISOString().slice(0, 19),
  photoIds: [],
});

const STOCKHOLM = place('sto', 59.3293, 18.0686, 'Stockholm');
const ROME = place('rom', 41.9028, 12.4964, 'Rome');
const PANTHEON = place('pan', 41.8986, 12.4769, 'Pantheon');
const FLORENCE = place('flo', 43.7696, 11.2558, 'Florence');
const PISA = place('pis', 43.7228, 10.4017, 'Pisa');
const places = [STOCKHOLM, ROME, PANTHEON, FLORENCE, PISA];
const t0 = Date.UTC(2026, 6, 10, 8);

describe('trip legs', () => {
  const visits = [
    visit('sto', t0),
    visit('rom', t0 + 5 * H, t0 + 6 * H), // 2,000 km in 5 h: flew
    visit('pan', t0 + 7 * H), // 1.7 km: walked
    visit('flo', t0 + 30 * H), // by road
  ];

  it('guesses how each leg was travelled and asks for routes where useful', () => {
    const legs = tripLegs(visits, places);
    expect(legs.map((l) => l.mode)).toEqual(['flight', 'walk', 'unknown']);
    expect(legs.map((l) => l.profile)).toEqual([undefined, 'foot', 'car']);
    expect(legs.map((l) => l.pending)).toEqual([false, true, true]);
  });

  it('uses saved routes, and treats unreachable or impossibly slow drives as flights', () => {
    const roadKey = routeKey('car', PANTHEON, FLORENCE);
    const route = { distanceKm: 275, durationMin: 180, path: '_p~iF~ps|U' };
    let legs = tripLegs(visits, places, { [roadKey]: route, [routeKey('foot', ROME, PANTHEON)]: null });
    expect(legs.map((l) => l.mode)).toEqual(['flight', 'unknown', 'road']);
    expect(legs[2].route).toEqual(route);

    const quick = [visit('pan', t0), visit('flo', t0 + 1 * H)];
    legs = tripLegs(quick, places, { [roadKey]: { ...route, durationMin: 600 } });
    expect(legs[0].mode).toBe('road'); // under 300 km: could still have been a fast train
    const far = [visit('rom', t0), visit('sto', t0 + 26 * H)];
    expect(tripLegs(far, places)[0].mode).toBe('unknown'); // 2,000 km over a day: maybe a drive, look it up
    const farKey = routeKey('car', ROME, STOCKHOLM);
    expect(tripLegs(far, places, { [farKey]: { distanceKm: 2400, durationMin: 1600, path: '' } })[0].mode).toBe('road');
    expect(tripLegs(far, places, { [farKey]: { distanceKm: 2400, durationMin: 1800, path: '' } })[0].mode).toBe('flight');
  });

  it('ignores malformed saved routes', () => {
    const legs = tripLegs([visit('pan', t0), visit('flo', t0 + 30 * H)], places, {
      [routeKey('car', PANTHEON, FLORENCE)]: { path: 42 } as never,
    });
    expect(legs[0].route).toBeUndefined();
  });
});

describe('route geometry', () => {
  it('decodes encoded polylines', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline('_p~iF')).toEqual([]);
  });

  it('draws flights as arcs that take the short way round', () => {
    const arc = flightArc(place('a', 35, 170), place('b', 21, -158));
    expect(arc[0]).toEqual([35, 170]);
    expect(arc[arc.length - 1][1]).toBeCloseTo(202);
    expect(arc.every(([, lon]) => lon >= 165 && lon <= 210)).toBe(true);
  });
});

describe('open in maps', () => {
  const visits = [
    visit('sto', t0),
    visit('rom', t0 + 5 * H),
    visit('pan', t0 + 6 * H),
    visit('flo', t0 + 30 * H),
    visit('pis', t0 + 40 * H),
  ];

  it('follows the trip in order in Bing Maps, skipping flights', () => {
    const links = mapsLinks(tripLegs(visits, places), places);
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe('Rome → Pisa (4 stops)');
    const url = new URL(links[0].url);
    expect(url.origin + url.pathname).toBe('https://www.bing.com/maps');
    expect(url.searchParams.get('mode')).toBe('d');
    const stops = url.searchParams.get('rtp')!.split('~');
    expect(stops).toHaveLength(4);
    expect(stops[0]).toBe('pos.41.902800_12.496400_Rome');
    expect(stops[3]).toBe('pos.43.722800_10.401700_Pisa');
  });

  it('splits long routes into overlapping parts of at most 15 stops', () => {
    const many = Array.from({ length: 20 }, (_, i) => place(`p_${i}`, 45 + i * 0.1, 9));
    const manyVisits = many.map((p, i) => visit(p.id, t0 + i * 2 * H));
    const parts = mapsLinks(tripLegs(manyVisits, many), many);
    expect(parts.map((p) => p.stops)).toEqual([15, 6]);
    expect(parts[1].label).toBe('p_14 → p_19 (6 stops)');
    const stops = new URL(parts[0].url).searchParams.get('rtp')!.split('~');
    expect(stops).toHaveLength(15);
    expect(stops[0]).toBe('pos.45.000000_9.000000_p 0');
  });
});
