import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Place, Visit } from '../types';
import { placeName } from '../lib/trip';
import { safeColor } from '../lib/nav';

interface Props {
  places: Place[];
  visits: Visit[];
  selectedPlaceId?: string;
  onSelect: (placeId: string) => void;
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

export function TripMap({ places, visits, selectedPlaceId, onSelect }: Props) {
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
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
          eventHandlers={{ click: () => onSelect(place.id) }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {placeName(place, i)}
          </Tooltip>
        </Marker>
      ))}
      <FitToPlaces places={places} />
      <FocusSelected place={selected} />
    </MapContainer>
  );
}
