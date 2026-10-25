"use client";

import React, { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import RouteJourneyAnimation from "./RouteJourneyAnimation";

// 1. Google Maps-style Blue Dot Beacon with Radar Pulsing Ring
const liveUserBeaconIcon = L.divIcon({
  html: `
    <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
      <div style="position:absolute;width:28px;height:28px;border-radius:9999px;background:rgba(26,115,232,0.3);animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="width:14px;height:14px;border-radius:9999px;background:#1a73e8;border:2.5px solid #ffffff;box-shadow:0 0 10px rgba(26,115,232,0.9);z-index:10;"></div>
    </div>
  `,
  className: "user-gps-dot",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// 2. Open Charge Map Station Pin
const ocmChargerPinIcon = (powerKw: number) => {
  const isHighPower = powerKw >= 50;
  const pinBg = isHighPower ? "#0284c7" : "#0d9488";
  return L.divIcon({
    html: `
      <div style="background:${pinBg};border:2px solid #ffffff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;transition:transform 0.2s;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      </div>
    `,
    className: "ocm-charger-pin",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
};

// 3. Origin & Destination Route Terminal Markers
const originMarkerIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#10b981;border:3px solid #ffffff;box-shadow:0 0 10px rgba(16,185,129,0.8);"></div>`,
  className: "origin-marker",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const destMarkerIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;border-radius:9999px;background:#ef4444;border:3px solid #ffffff;box-shadow:0 0 10px rgba(239,68,68,0.8);"></div>`,
  className: "dest-marker",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function MapBoundsSynchronizer({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();

  useEffect(() => {
    // Invalidate size on initial mount and on window resize to ensure all tiles render
    map.invalidateSize();
    const handleResize = () => map.invalidateSize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);

  useEffect(() => {
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });
      } catch (e) {
        console.warn("Bounds sync:", e);
      }
    }
  }, [bounds, map]);
  return null;
}

function FloatingRecenterControl({
  onRecenter,
  isScanning,
}: {
  onRecenter: () => void;
  isScanning: boolean;
}) {
  const map = useMap();
  return (
    <div className="absolute bottom-6 right-4 z-[1000] flex flex-col items-center space-y-2 font-sans pointer-events-auto">
      {/* Blue Target Button to Scan Open Charge Map */}
      <button
        type="button"
        onClick={onRecenter}
        disabled={isScanning}
        title="Find My Location & Scan Open Charge Map"
        className="w-11 h-11 bg-white hover:bg-slate-50 text-blue-600 rounded-full shadow-[0_3px_10px_rgba(0,0,0,0.2)] flex items-center justify-center transition border border-slate-100 group relative cursor-pointer"
      >
        {isScanning ? (
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
          </svg>
        )}
      </button>

      {/* Zoom In/Out Controls */}
      <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.18)] flex flex-col divide-y divide-slate-100 overflow-hidden border border-slate-100">
        <button
          type="button"
          onClick={() => map.zoomIn()}
          aria-label="Zoom In"
          className="w-10 h-10 hover:bg-slate-50 flex items-center justify-center text-slate-700 text-lg font-light cursor-pointer select-none"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => map.zoomOut()}
          aria-label="Zoom Out"
          className="w-10 h-10 hover:bg-slate-50 flex items-center justify-center text-slate-700 text-lg font-light cursor-pointer select-none"
        >
          −
        </button>
      </div>
    </div>
  );
}

export interface ChargerPOI {
  id: string;
  name: string;
  operator?: string;
  lat: number;
  lon: number;
  power_kw?: number;
  distance_km?: number;
  connections?: string[];
  source?: string;
  is_reachable?: boolean;
  arrival_soc?: number;
}

interface MapProps {
  userLocation: [number, number] | null;
  routeGeometry?: [number, number][];
  chargers?: ChargerPOI[];
  journeyRunId?: number;
  onPingLocation: () => void;
  isScanning?: boolean;
}

export default function Map({
  userLocation,
  routeGeometry = [],
  chargers = [],
  journeyRunId = 1,
  onPingLocation,
  isScanning = false,
}: MapProps) {
  // If chargers were found, center and fit bounds across user and stations
  const bounds =
    routeGeometry.length > 1
      ? L.latLngBounds(routeGeometry)
      : chargers.length > 0 && userLocation
      ? L.latLngBounds([userLocation, ...chargers.map((c) => [c.lat, c.lon] as [number, number])])
      : userLocation
      ? L.latLngBounds([userLocation])
      : null;

  const defaultCenter: [number, number] = userLocation || [13.3412, 74.7478];

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        zoomControl={false}
        className="w-full h-full z-0 bg-slate-100"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {bounds && <MapBoundsSynchronizer bounds={bounds} />}
        <FloatingRecenterControl onRecenter={onPingLocation} isScanning={isScanning} />

        {/* Dynamic Route Polyline */}
        {routeGeometry.length > 1 && (
          <>
            <Polyline
              positions={routeGeometry}
              pathOptions={{
                color: "#2563eb",
                weight: 5,
                opacity: 0.85,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* Start & End markers for the active route */}
            <Marker position={routeGeometry[0]} icon={originMarkerIcon}>
              <Popup className="telematics-popup">
                <div className="font-sans text-xs font-bold text-slate-800">Route Origin</div>
              </Popup>
            </Marker>
            <Marker position={routeGeometry[routeGeometry.length - 1]} icon={destMarkerIcon}>
              <Popup className="telematics-popup">
                <div className="font-sans text-xs font-bold text-slate-800">Route Destination</div>
              </Popup>
            </Marker>

            {/* Cute animated EV Car traversing the route */}
            <RouteJourneyAnimation
              positions={routeGeometry}
              chargingStops={chargers}
              journeyRunId={journeyRunId}
            />
          </>
        )}

        {/* Pulsing Blue Dot (Clicking it also scans Open Charge Map) */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={liveUserBeaconIcon}
            eventHandlers={{
              click: onPingLocation,
            }}
          >
            <Popup className="telematics-popup">
              <div className="font-sans text-xs p-1">
                <div className="font-bold text-slate-900">Your Vehicle Location</div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  Click to query nearby Open Charge Map stations
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Open Charge Map Pins */}
        {chargers.map((chg) => (
          <Marker
            key={chg.id}
            position={[chg.lat, chg.lon]}
            icon={ocmChargerPinIcon(chg.power_kw || 50)}
          >
            <Popup className="telematics-popup">
              <div className="font-sans text-xs p-1 min-w-[190px]">
                <div className="flex items-center justify-between gap-1 pb-1 border-b border-slate-100">
                  <span className="font-bold text-slate-900 truncate">{chg.name}</span>
                  <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 font-mono font-bold text-[10px] rounded shrink-0">
                    {chg.power_kw || 50} kW
                  </span>
                </div>

                <div className="mt-1 text-[11px] text-slate-500 space-y-0.5">
                  {chg.operator && (
                    <div>
                      Operator: <span className="text-slate-700 font-medium">{chg.operator}</span>
                    </div>
                  )}
                  {chg.distance_km !== undefined && (
                    <div className="text-emerald-600 font-medium">
                      {chg.distance_km} km away
                    </div>
                  )}
                  {chg.connections && chg.connections.length > 0 && (
                    <div className="text-slate-400 text-[10px]">
                      Plugs: {chg.connections.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
