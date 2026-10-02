import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { PhotoRecord, Place, Visit } from '../types';
import { byTime, placeName } from '../lib/trip';
import { safeColor, safeImageSrc } from '../lib/nav';
import { formatDuration, formatRange } from '../lib/format';
import { anchorFrom, type Anchor } from './Popover';

interface Props {
  places: Place[];
  visits: Visit[];
  photos: PhotoRecord[];
  selectedPlaceId?: string;
  /** Pan to the selected place (off when it was picked on the map itself, so the pin stays under the panel). */
  panToSelected?: boolean;
  onSelect: (placeId: string, anchor?: Anchor) => void;
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

function FocusSelected({ place }: { place?: Place }) {
  const map = useMap();
  useEffect(() => {
    if (place) map.panTo([place.lat, place.lon], { animate: true });
  }, [place, map]);
  return null;
}

export function TripMap({ places, visits, photos, selectedPlaceId, panToSelected = true, onSelect }: Props) {
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
  const route = useMemo(
    () =>
      visits
        .map((v) => byId.get(v.placeId))
        .filter((p): p is Place => !!p)
        .map((p) => [p.lat, p.lon] as [number, number]),
    [visits, byId],
  );
  const selected = selectedPlaceId ? byId.get(selectedPlaceId) : undefined;

  return (
    <MapContainer className="map" center={[20, 0]} zoom={2} scrollWheelZoom worldCopyJump>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#334155', weight: 2, opacity: 0.6, dashArray: '6 6' }} />}
      {places.map((place, i) => (
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
      <FitToPlaces places={places} />
      <FocusSelected place={panToSelected ? selected : undefined} />
    </MapContainer>
  );
}
