import type { Place, SavedRoute, Trip, Visit } from '../types';
import type { DevicePlatform } from '../providers/icloud';
import { distanceKm } from './geo';
import { placeName } from './trip';

export type LegMode = 'walk' | 'road' | 'flight' | 'unknown';
export type RouteProfile = 'car' | 'foot';

/** One move between two consecutive visits. */
export interface TripLeg {
  from: Place;
  to: Place;
  /** End of the stay at `from` and start of the stay at `to` (epoch ms). */
  depart: number;
  arrive: number;
  departLocal: string;
  straightKm: number;
  mode: LegMode;
  /** Set when a route should be (or has been) looked up. */
  profile?: RouteProfile;
  key?: string;
  route?: SavedRoute;
  /** True while the route still has to be looked up. */
  pending: boolean;
}

const WALK_MAX_KM = 2;
const ALWAYS_FLY_KM = 2500;

export function routeKey(profile: RouteProfile, a: Place, b: Place): string {
  return `${profile}:${a.lat.toFixed(4)},${a.lon.toFixed(4)};${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
}

function isSavedRoute(r: unknown): r is SavedRoute {
  const v = r as SavedRoute;
  return !!v && typeof v.path === 'string' && Number.isFinite(v.distanceKm) && Number.isFinite(v.durationMin);
}

/**
 * Moves between places in visiting order, with a best guess of how each was travelled:
 * short hops are walks, long and fast ones (or ones without a road) are flights, the rest go by road.
 */
export function tripLegs(visits: Visit[], places: Place[], routes: Trip['routes'] = {}): TripLeg[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const legs: TripLeg[] = [];
  for (let i = 1; i < visits.length; i++) {
    const from = byId.get(visits[i - 1].placeId);
    const to = byId.get(visits[i].placeId);
    if (!from || !to || from === to) continue;
    const straightKm = distanceKm(from, to);
    const hours = Math.max(visits[i].start - visits[i - 1].end, 0) / 3_600_000;
    const leg: TripLeg = {
      from,
      to,
      depart: visits[i - 1].end,
      arrive: visits[i].start,
      departLocal: visits[i - 1].endLocal,
      straightKm,
      mode: 'unknown',
      pending: false,
    };
    const fast = straightKm > 300 && straightKm / Math.max(hours, 0.01) > 250;
    if (straightKm >= ALWAYS_FLY_KM || fast) {
      leg.mode = 'flight';
    } else {
      leg.profile = straightKm < WALK_MAX_KM ? 'foot' : 'car';
      leg.key = routeKey(leg.profile, from, to);
      const saved = routes[leg.key];
      if (saved === undefined) {
        leg.pending = true;
        leg.mode = leg.profile === 'foot' ? 'walk' : 'unknown';
      } else if (isSavedRoute(saved)) {
        // Driving would have taken far longer than the time between the photos: they must have flown.
        const tooSlow = straightKm > 300 && saved.durationMin / 60 > hours + 2;
        leg.mode = tooSlow ? 'flight' : leg.profile === 'foot' ? 'walk' : 'road';
        if (!tooSlow) leg.route = saved;
      } else {
        // No route over land (e.g. an island or across the sea).
        leg.mode = straightKm > 100 ? 'flight' : 'unknown';
      }
    }
    legs.push(leg);
  }
  return legs;
}

/** Distance travelled along the legs (route distance where known, straight line otherwise). */
export function travelledKm(legs: TripLeg[]): number {
  return legs.reduce((sum, l) => sum + (l.route?.distanceKm ?? l.straightKm), 0);
}

/** Decodes a Google/OSRM encoded polyline (precision 5) into [lat, lon] pairs. */
export function decodePolyline(str: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= str.length) return NaN;
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && shift < 35);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < str.length) {
    const dLat = next();
    const dLon = next();
    if (Number.isNaN(dLat) || Number.isNaN(dLon)) break;
    lat += dLat;
    lon += dLon;
    points.push([lat / 1e5, lon / 1e5]);
  }
  return points;
}

/** A gentle curve between two points, to draw flights. Takes the short way round the globe. */
export function flightArc(a: Place, b: Place, segments = 32): [number, number][] {
  let bLon = b.lon;
  if (bLon - a.lon > 180) bLon -= 360;
  else if (a.lon - bLon > 180) bLon += 360;
  const dx = bLon - a.lon;
  const dy = b.lat - a.lat;
  const cx = (a.lon + bLon) / 2 - dy * 0.2;
  const cy = (a.lat + b.lat) / 2 + dx * 0.2;
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    points.push([u * u * a.lat + 2 * u * t * cy + t * t * b.lat, u * u * a.lon + 2 * u * t * cx + t * t * bLon]);
  }
  return points;
}

// --- Route lookups -------------------------------------------------------------------------------------

export interface Router {
  /** Resolves to `null` when there's no route (e.g. no roads between the places). */
  route(from: Place, to: Place, profile: RouteProfile, signal?: AbortSignal): Promise<SavedRoute | null>;
}

const MIN_INTERVAL_MS = 1100;
let queue: Promise<void> = Promise.resolve();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function throttle(): Promise<void> {
  const turn = queue;
  queue = turn.then(() => sleep(MIN_INTERVAL_MS));
  return turn;
}

/** A place this far from the nearest road (in metres) counts as unreachable by road. */
const MAX_SNAP_M = 5000;

/** OSRM, as hosted by FOSSGIS for openstreetmap.org (free, fair use: one request at a time). */
export const osrmRouter: Router = {
  async route(from, to, profile, signal) {
    await throttle();
    signal?.throwIfAborted();
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${coords}?overview=simplified&geometries=polyline&steps=false`;
    const res = await fetch(url, { signal });
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      routes?: { distance: number; duration: number; geometry: string }[];
      waypoints?: { distance: number }[];
    };
    if (data.code === 'NoRoute' || data.code === 'NoSegment') return null;
    if (!res.ok || data.code !== 'Ok' || !data.routes?.length) throw new Error(`Route lookup failed (${res.status})`);
    if (data.waypoints?.some((w) => w.distance > MAX_SNAP_M)) return null;
    const r = data.routes[0];
    return { distanceKm: r.distance / 1000, durationMin: r.duration / 60, path: r.geometry };
  },
};

export function setRoute(trip: Trip, key: string, route: SavedRoute | null): Trip {
  return { ...trip, routes: { ...trip.routes, [key]: route } };
}

// --- "Open in Maps" links -----------------------------------------------------------------------------

export interface MapsLink {
  label: string;
  url: string;
  stops: number;
}

/** Stops per link: Google Maps allows 9 waypoints (3 on phones); Apple Maps allows multi-stop routes of up to 15. */
function maxStops(platform: DevicePlatform): number {
  if (platform === 'ios' || platform === 'mac') return 15;
  return platform === 'android' ? 5 : 11;
}

const coord = (p: Place) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

function directionsUrl(stops: Place[], walking: boolean, platform: DevicePlatform): string {
  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const between = stops.slice(1, -1);
  if (platform === 'ios' || platform === 'mac') {
    const q = new URLSearchParams({ source: coord(origin), destination: coord(destination) });
    for (const w of between) q.append('waypoint', coord(w));
    q.set('mode', walking ? 'walking' : 'driving');
    return `https://maps.apple.com/directions?${q}`;
  }
  const q = new URLSearchParams({ api: '1', origin: coord(origin), destination: coord(destination) });
  if (between.length) q.set('waypoints', between.map(coord).join('|'));
  q.set('travelmode', walking ? 'walking' : 'driving');
  return `https://www.google.com/maps/dir/?${q}`;
}

/**
 * Directions links that follow the trip in order. The trip is split at flights (no point driving those)
 * and into parts that fit the maps app's limit on stops; each part starts where the previous one ended.
 */
export function mapsLinks(legs: TripLeg[], places: Place[], platform: DevicePlatform): MapsLink[] {
  const index = new Map(places.map((p, i) => [p.id, i]));
  const name = (p: Place) => placeName(p, index.get(p.id));
  const groups: TripLeg[][] = [];
  let current: TripLeg[] = [];
  for (const leg of legs) {
    const continues = current.length > 0 && current[current.length - 1].to.id === leg.from.id;
    if (leg.mode === 'flight' || !continues) {
      if (current.length) groups.push(current);
      current = [];
    }
    if (leg.mode !== 'flight') current.push(leg);
  }
  if (current.length) groups.push(current);

  const limit = maxStops(platform);
  const links: MapsLink[] = [];
  for (const group of groups) {
    const stops = [group[0].from, ...group.map((l) => l.to)];
    const walking = group.every((l) => l.mode === 'walk');
    for (let start = 0; start < stops.length - 1; start += limit - 1) {
      const part = stops.slice(start, start + limit);
      const first = name(part[0]);
      const last = name(part[part.length - 1]);
      const label = part.length === 2 ? `${first} → ${last}` : `${first} → ${last} (${part.length} stops)`;
      links.push({ label, url: directionsUrl(part, walking, platform), stops: part.length });
    }
  }
  return links;
}
