import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from "react-leaflet";
import { divIcon } from "leaflet";
import { Button } from "@/components/ui/button";
import { MapPin, LocateFixed } from "lucide-react";

type LatLng = { lat: number; lng: number };

// react-leaflet v5 typings can vary depending on Leaflet/TS versions.
// Cast components to `any` so we can use the standard Leaflet props without fighting the compiler.
const RLMapContainer = MapContainer as any;
const RLTileLayer = TileLayer as any;
const RLCircle = Circle as any;
const RLMarker = Marker as any;

function ClampCenter({ center, zoom }: { center: LatLng; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng] as any, zoom ?? map.getZoom(), { animate: true } as any);
  }, [center.lat, center.lng, zoom, map]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: (e as any).latlng.lat, lng: (e as any).latlng.lng });
    },
  } as any);
  return null;
}

const pinIcon = divIcon({
  className: "",
  html: `
    <div style="
      width: 34px;
      height: 34px;
      border-radius: 9999px;
      background: rgba(59,130,246,0.12);
      border: 2px solid rgba(59,130,246,0.65);
      box-shadow: 0 8px 18px rgba(2,6,23,0.18);
      display:flex;
      align-items:center;
      justify-content:center;
      transform: translate(-50%, -50%);
    ">
      <div style="
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        background: rgba(59,130,246,0.95);
      "></div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

export function GeofenceMapPicker({
  value,
  onChange,
  radiusMeters,
  className,
}: {
  value: LatLng;
  onChange: (next: LatLng) => void;
  radiusMeters?: number;
  className?: string;
}) {
  const [zoom, setZoom] = useState(15);

  const canUseGeolocation = typeof navigator !== "undefined" && "geolocation" in navigator;

  const center = useMemo(() => value, [value.lat, value.lng]);

  const recenterToMe = async () => {
    if (!canUseGeolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(next);
        setZoom(16);
      },
      () => null,
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 }
    );
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
          <MapPin className="h-4 w-4 text-slate-500" />
          Clique no mapa para posicionar o pin
        </div>
        <div className="flex items-center gap-2">
          {canUseGeolocation && (
            <Button type="button" variant="secondary" onClick={recenterToMe} className="h-9 rounded-2xl">
              <LocateFixed className="mr-2 h-4 w-4" />
              Minha localização
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <RLMapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom className="h-[280px] w-full">
          <RLTileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ClampCenter center={center} zoom={zoom} />
          <ClickToPick onPick={(p) => onChange(p)} />

          {typeof radiusMeters === "number" && radiusMeters > 0 && (
            <RLCircle
              center={[center.lat, center.lng]}
              radius={radiusMeters}
              pathOptions={{ color: "#2563eb", weight: 2, fillColor: "#60a5fa", fillOpacity: 0.12 }}
            />
          )}

          <RLMarker
            position={[center.lat, center.lng]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e: any) => {
                const m = e.target as any;
                const ll = m.getLatLng?.();
                if (!ll) return;
                onChange({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        </RLMapContainer>
      </div>

      <div className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <span className="font-semibold text-slate-800">Pin:</span> {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
      </div>
    </div>
  );
}