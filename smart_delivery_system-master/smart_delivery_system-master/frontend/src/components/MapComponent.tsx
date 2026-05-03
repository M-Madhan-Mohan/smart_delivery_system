import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, Component, ReactNode, useMemo } from 'react';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const pickupIcon = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#16a34a;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;font-size:14px">📦</div></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const dropIcon = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;font-size:14px">🏁</div></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const driverIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:44px;height:44px">
    <div style="position:absolute;inset:0;background:rgba(37,99,235,0.2);border-radius:50%;animation:pulse 1.5s infinite"></div>
    <div style="position:absolute;inset:6px;background:#2563eb;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(37,99,235,0.6);display:flex;align-items:center;justify-content:center;color:white;font-size:16px">🚴</div>
    <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:0.7}50%{transform:scale(1.4);opacity:0}}</style>
  </div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const fleetIconCache: Record<string, L.DivIcon> = {};
const getFleetIcon = (color: string, label: string) => {
  const key = color + label;
  if (!fleetIconCache[key]) {
    fleetIconCache[key] = L.divIcon({
      className: '',
      html: `<div style="position:relative;width:40px;height:40px">
        <div style="position:absolute;inset:4px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:14px">🚗</div>
        <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;font-size:9px;padding:1px 4px;border-radius:4px;white-space:nowrap">${label}</div>
      </div>`,
      iconSize: [40, 58],
      iconAnchor: [20, 20],
    });
  }
  return fleetIconCache[key];
};

interface Location { lat: number; lng: number; label?: string; type?: 'pickup' | 'drop' | 'driver' | 'fleet'; color?: string; }
interface MapProps {
  center: [number, number];
  markers?: Location[];
  route?: [number, number][];
  osmRoute?: [number, number][];
  driverLocation?: Location;
  fleetDrivers?: any[];
  onMapClick?: (e: any) => void;
  zoom?: number;
}

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
    setTimeout(() => map.invalidateSize(), 100);
  }, [center, zoom, map]);
  return null;
}

function MapClickHandler({ onClick }: { onClick?: (e: any) => void }) {
  const map = useMap();
  useEffect(() => {
    if (onClick) {
      map.on('click', onClick);
      return () => { map.off('click', onClick); };
    }
  }, [map, onClick]);
  return null;
}

function RouteDisplay({ osmRoute }: { osmRoute: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (osmRoute.length > 1) {
      const bounds = L.latLngBounds(osmRoute);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [osmRoute, map]);
  return <Polyline positions={osmRoute} color="#16a34a" weight={5} opacity={0.8} />;
}

function CustomMarker({ m }: { m: any }) {
  const icon = useMemo(() => {
    if (m.type === 'pickup') {
      return L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;background:#16a34a;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;font-size:14px">📦</div></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
    } else if (m.type === 'drop') {
      return L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;font-size:14px">🏁</div></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
    } else if (m.type === 'current') {
      return L.divIcon({
        className: '',
        html: `<div style="position:relative;width:24px;height:24px"><div style="position:absolute;inset:0;background:rgba(59,130,246,0.3);border-radius:50%;animation:pulse 2s infinite"></div><div style="position:absolute;inset:4px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3)"></div><style>@keyframes pulse{0%,100%{transform:scale(1);opacity:0.8}50%{transform:scale(1.5);opacity:0}}</style></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
    }
    return undefined;
  }, [m.type]);

  return (
    <Marker position={[m.lat, m.lng]} {...(icon ? { icon } : {})}>
      {m.label && <Popup>{m.label}</Popup>}
    </Marker>
  );
}

function DriverMarker({ driverLocation }: { driverLocation: Location }) {
  const icon = useMemo(() => {
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:44px;height:44px">
        <div style="position:absolute;inset:0;background:rgba(37,99,235,0.2);border-radius:50%;animation:pulse 1.5s infinite"></div>
        <div style="position:absolute;inset:6px;background:#2563eb;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(37,99,235,0.6);display:flex;align-items:center;justify-content:center;color:white;font-size:16px">🚴</div>
        <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:0.7}50%{transform:scale(1.4);opacity:0}}</style>
      </div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }, []);

  return (
    <>
      <Marker position={[driverLocation.lat, driverLocation.lng]} icon={icon}>
        <Popup>Driver is here</Popup>
      </Marker>
      <Circle center={[driverLocation.lat, driverLocation.lng]} radius={200}
        pathOptions={{ color: '#2563eb', fillColor: '#93c5fd', fillOpacity: 0.15, weight: 1 }} />
    </>
  );
}

function FleetMarker({ d }: { d: any }) {
  const icon = useMemo(() => {
    const color = d.status === 'available' ? '#16a34a' : d.status === 'delayed' ? '#dc2626' : '#2563eb';
    const label = d.name.split(' ')[0];
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:40px;height:40px">
        <div style="position:absolute;inset:4px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:14px">🚗</div>
        <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;font-size:9px;padding:1px 4px;border-radius:4px;white-space:nowrap">${label}</div>
      </div>`,
      iconSize: [40, 58],
      iconAnchor: [20, 20],
    });
  }, [d.status, d.name]);

  return (
    <Marker position={[d.location.lat, d.location.lng]} icon={icon}>
      <Popup>
        <div className="font-bold">{d.name}</div>
        <div className="text-xs capitalize text-gray-500">{d.status}</div>
      </Popup>
    </Marker>
  );
}

class MapErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <div className="h-full w-full bg-gray-100 flex items-center justify-center text-red-500 rounded-2xl">Map failed to load. Try refreshing.</div>;
    }
    return this.props.children;
  }
}

export default function MapComponent(props: MapProps) {
  return (
    <MapErrorBoundary>
      <MapContainer center={props.center} zoom={props.zoom} className="h-full w-full rounded-2xl z-0" style={{ minHeight: '100%' }}>
        <ChangeView center={props.center} zoom={props.zoom || 13} />
        <MapClickHandler onClick={props.onMapClick} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {props.markers?.filter(m => m && typeof m.lat === 'number' && typeof m.lng === 'number' && !isNaN(m.lat) && !isNaN(m.lng)).map((m, i) => (
          <CustomMarker key={`marker-${i}-${m.lat}-${m.lng}`} m={m} />
        ))}

        {props.osmRoute && props.osmRoute.length > 1 && <RouteDisplay osmRoute={props.osmRoute} />}
        {props.route && props.route.length > 0 && !(props.osmRoute && props.osmRoute.length) && (
          <Polyline positions={props.route} color="#2563eb" weight={4} opacity={0.8} />
        )}

        {props.driverLocation && typeof props.driverLocation.lat === 'number' && !isNaN(props.driverLocation.lat) && (
          <DriverMarker driverLocation={props.driverLocation} />
        )}

        {props.fleetDrivers?.filter(d => d && d.location && typeof d.location.lat === 'number' && !isNaN(d.location.lat)).map(d => (
          <FleetMarker key={d.id} d={d} />
        ))}
      </MapContainer>
    </MapErrorBoundary>
  );
}
