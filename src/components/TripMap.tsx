import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { PhotoRecord, Place, Visit } from '../types';
import { byTime, placeName } from '../lib/trip';
import { safeColor, safeImageSrc } from '../lib/nav';
import { formatDay, formatDistance, formatDuration, formatRange } from '../lib/format';
import { decodePolyline, flightArc, type TripLeg } from '../lib/routing';
import { anchorFrom, type Anchor } from './Popover';

interface Props {
  places: Place[];
  visits: Visit[];
  legs: TripLeg[];
  photos: PhotoRecord[];
  selectedPlaceId?: string;
  /** Pan to the selected place (off when it was picked on the map itself, so the pin stays under the panel). */
  panToSelected?: boolean;
  onSelect: (placeId: string, anchor?: Anchor) => void;
  /** When filtering: the places to show (numbers and colours stay those of the whole trip). */
  visibleIds?: Set<string>;
}

const MAX_VISITS_SHOWN = 4;
const TAP = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches ? 'tap' : 'click';

function PlaceTooltip({ place, index, visits, thumbnail }: { place: Place; index: number; visits: Visit[]; thumbnail?: string }) {
  const where = [place.label?.locality !== place.label?.name ? place.label?.locality : undefined, place.label?.country]
    .filter(Boolean)
    .join(', ');
  const photoCount = visits.reduce((n, v) => n + v.photoIds.length, 0);
  return (
    <div className="map-tip">
      {thumbnail && <img src={thumbnail} alt="" />}
      <div>
        <strong>
          {index + 1} · {placeName(place, index)}
        </strong>
        {where && <div className="muted">{where}</div>}
        <ul>
          {visits.slice(0, MAX_VISITS_SHOWN).map((v) => {
            const length = formatDuration(v.end - v.start);
            return (
              <li key={v.start}>
                {formatRange(v.startLocal, v.endLocal)}
                {length && <span className="muted"> ({length})</span>}
              </li>
            );
          })}
          {visits.length > MAX_VISITS_SHOWN && <li className="muted">+{visits.length - MAX_VISITS_SHOWN} more visits</li>}
        </ul>
        <div className="muted">
          {photoCount} photo{photoCount === 1 ? '' : 's'}
          {visits.length > 1 ? ` · ${visits.length} visits` : ''} · {TAP} for photos
        </div>
      </div>
    </div>
  );
}

function pinIcon(index: number, color: string, selected: boolean) {
  return L.divIcon({
    className: '',
    html: `<span class="map-pin${selected ? ' selected' : ''}" style="background:${safeColor(color)}">${index + 1}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitToPlaces({ places }: { places: Place[] }) {
  const map = useMap();
  const key = places.map((p) => p.id).join(',');
  useEffect(() => {
    if (!places.length) return;
    if (places.length === 1) map.setView([places[0].lat, places[0].lon], 13);
    else map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon])), { padding: [36, 36] });
  }, [key, map]);
  return null;
}

function legStyle(leg: TripLeg): L.PathOptions {
  const base = { color: '#1e293b', weight: 3, opacity: 0.75 };
  if (leg.mode === 'flight') return { ...base, weight: 2, dashArray: '2 7', lineCap: 'round' };
  if (leg.mode === 'walk') return { ...base, dashArray: '1 6', lineCap: 'round' };
  if (!leg.route) return { ...base, weight: 2, opacity: 0.55, dashArray: '6 6' };
  return base;
}

const MODE_TEXT = { flight: '✈️ Flight', walk: '🚶 Walk', road: '🚗 By road', unknown: 'Route unknown' } as const;

function LegTooltip({ leg, places }: { leg: TripLeg; places: Place[] }) {
  const name = (p: Place) => placeName(p, places.indexOf(p));
  const facts = leg.route
    ? [formatDistance(leg.route.distanceKm), leg.route.durationMin >= 1 && `about ${formatDuration(Math.max(leg.route.durationMin, 1) * 60_000)}`]
    : [`${formatDistance(leg.straightKm)}${leg.mode === 'flight' ? '' : ' as the crow flies'}`];
  const gap = formatDuration(leg.arrive - leg.depart);
  return (
    <div className="map-tip leg-tip">
      <strong>
        {name(leg.from)} → {name(leg.to)}
      </strong>
      <div>
        {leg.pending ? 'Finding route…' : MODE_TEXT[leg.mode]} · {facts.filter(Boolean).join(' · ')}
      </div>
      <div className="muted">
        {formatDay(leg.departLocal)}
        {gap && ` · ${gap} between photos`}
      </div>
    </div>
  );
}

function FocusSelected({ place }: { place?: Place }) {
  const map = useMap();
  useEffect(() => {
    if (place) map.panTo([place.lat, place.lon], { animate: true });
  }, [place, map]);
  return null;
}

export function TripMap({ places, visits, legs, photos, selectedPlaceId, panToSelected = true, onSelect, visibleIds }: Props) {
  const shown = useMemo(() => (visibleIds ? places.filter((p) => visibleIds.has(p.id)) : places), [places, visibleIds]);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const visitsByPlace = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const v of visits) m.set(v.placeId, [...(m.get(v.placeId) ?? []), v]);
    return m;
  }, [visits]);
  const thumbByPlace = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of [...photos].sort(byTime)) {
      const src = p.placeId && !m.has(p.placeId) ? safeImageSrc(p.thumbnail) : undefined;
      if (src) m.set(p.placeId!, src);
    }
    return m;
  }, [photos]);
  const legLines = useMemo(
    () =>
      legs.map((leg) => ({
        leg,
        positions: leg.route
          ? decodePolyline(leg.route.path)
          : leg.mode === 'flight'
            ? flightArc(leg.from, leg.to)
            : ([
                [leg.from.lat, leg.from.lon],
                [leg.to.lat, leg.to.lon],
              ] as [number, number][]),
      })),
    [legs],
  );
  const selected = selectedPlaceId ? byId.get(selectedPlaceId) : undefined;

  return (
    <MapContainer className="map" center={[20, 0]} zoom={2} scrollWheelZoom worldCopyJump>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Routes <a href="https://routing.openstreetmap.de/about.html">FOSSGIS OSRM</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {legLines.map(({ leg, positions }, i) => (
        <Polyline key={`${i}:${leg.from.id}:${leg.to.id}`} positions={positions} pathOptions={legStyle(leg)}>
          <Tooltip sticky opacity={1} className="map-tooltip">
            <LegTooltip leg={leg} places={places} />
          </Tooltip>
        </Polyline>
      ))}
      {places.map((place, i) => (!visibleIds || visibleIds.has(place.id)) && (
        <Marker
          key={place.id}
          position={[place.lat, place.lon]}
          icon={pinIcon(i, place.color, place.id === selectedPlaceId)}
          zIndexOffset={place.id === selectedPlaceId ? 1000 : 0}
          eventHandlers={{ click: (e) => onSelect(place.id, anchorFrom((e.target as L.Marker).getElement())) }}
        >
          <Tooltip direction="top" offset={[0, -14]} opacity={1} className="map-tooltip">
            <PlaceTooltip place={place} index={i} visits={visitsByPlace.get(place.id) ?? []} thumbnail={thumbByPlace.get(place.id)} />
          </Tooltip>
        </Marker>
      ))}
      <FitToPlaces places={shown} />
      <FocusSelected place={panToSelected ? selected : undefined} />
    </MapContainer>
  );
}
