"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ChargingStop } from "@/lib/api";
import RouteJourneyAnimation from "./RouteJourneyAnimation";

export interface EmergencyStationMarker {
  station_id: string;
  name: string;
  distance_km: number;
  arrival_soc_percent: number;
  is_reachable: boolean;
  recommended_eco_speed_kmh: number;
  power_kw: number;
  coordinates: [number, number]; // [lat, lon]
}

interface MapProps {
  center?: [number, number];
  zoom?: number;
  coordinates?: [number, number][]; // GeoJSON format: [longitude, latitude]
  chargingStops?: any[];
  originName?: string;
  destinationName?: string;
  originCoords?: [number, number]; // [lng, lat]
  destinationCoords?: [number, number]; // [lng, lat]
  journeyRunId?: number;
  userLocation?: [number, number] | null; // [lat, lon]
  emergencyStations?: EmergencyStationMarker[];
  onRecenter?: () => void;
}

// Controller to smoothly fit map bounds to route geometry and auto-resize with layout changes
function MapBoundsController({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [map]);

  useEffect(() => {
    if (!positions || positions.length < 2) return;
    try {
      const bounds = L.latLngBounds(positions.map((p) => [p[0], p[1]]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } catch (e) {
      console.warn("Failed to adjust map bounds:", e);
    }
  }, [map, positions]);

  return null;
}

// Controller to zoom / fit emergency SOS pins and user position
function MapEmergencyBoundsController({
  userLocation,
  emergencyStations,
}: {
  userLocation?: [number, number] | null;
  emergencyStations?: EmergencyStationMarker[];
}) {
  const map = useMap();

  useEffect(() => {
    if (emergencyStations && emergencyStations.length > 0 && userLocation) {
      try {
        const points: [number, number][] = [
          userLocation,
          ...emergencyStations.map((s) => s.coordinates),
        ];
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      } catch (e) {
        console.warn("Failed to fit emergency bounds:", e);
      }
    } else if (userLocation) {
      map.setView(userLocation, 13);
    }
  }, [map, emergencyStations, userLocation]);

  return null;
}

// Controller to fly to center if center prop changes externally
function MapCenterController({ center, zoom }: { center?: [number, number]; zoom?: number }) {
  const map = useMap();

  useEffect(() => {
    if (center && center.length === 2 && !isNaN(center[0]) && !isNaN(center[1])) {
      map.flyTo(center, zoom ?? map.getZoom(), { duration: 1.2 });
    }
  }, [map, center, zoom]);

  return null;
}

// Floating controls: Recenter button and Zoom (+/-) stack
function FloatingControls({ onRecenter }: { onRecenter?: () => void }) {
  const map = useMap();

  const handleRecenterClick = () => {
    if (onRecenter) {
      onRecenter();
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.flyTo([pos.coords.latitude, pos.coords.longitude], 14, { duration: 1.2 });
        },
        (err) => {
          console.warn("Geolocation lookup error:", err);
        }
      );
    }
  };

  return (
    <div className="absolute bottom-6 right-4 z-[1000] flex flex-col items-center space-y-2 pointer-events-auto">
      {/* GPS Recenter Target */}
      <button
        type="button"
        onClick={handleRecenterClick}
        title="Re-center location"
        className="w-10 h-10 bg-white hover:bg-slate-50 text-slate-700 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.3)] flex items-center justify-center transition cursor-pointer"
      >
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      </button>

      {/* Zoom In & Out Stack */}
      <div className="bg-white rounded-lg shadow-[0_2px_6px_rgba(0,0,0,0.3)] flex flex-col divide-y divide-slate-100 overflow-hidden">
        <button
          type="button"
          onClick={() => map.zoomIn()}
          aria-label="Zoom in"
          className="w-10 h-10 hover:bg-slate-50 flex items-center justify-center text-slate-700 text-xl font-light cursor-pointer select-none"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => map.zoomOut()}
          aria-label="Zoom out"
          className="w-10 h-10 hover:bg-slate-50 flex items-center justify-center text-slate-700 text-xl font-light cursor-pointer select-none"
        >
          −
        </button>
      </div>
    </div>
  );
}

const TILE_LAYERS = [
  {
    id: "osm",
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: "esri-streets",
    name: "Streets",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS",
  },
  {
    id: "satellite",
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, Earthstar Geographics",
  },
  {
    id: "osm-hot",
    name: "Humanitarian",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by Humanitarian OpenStreetMap Team',
  },
];

export default function RouteMap({
  center = [13.3412, 74.7478],
  zoom = 13,
  coordinates,
  chargingStops = [],
  originName = "Manipal",
  destinationName = "Malpe Beach",
  originCoords,
  destinationCoords,
  journeyRunId = 0,
  userLocation = null,
  emergencyStations = [],
  onRecenter,
}: MapProps) {
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);

  const activeCoordinates = useMemo(
    () => (coordinates && coordinates.length >= 2 ? coordinates : []),
    [coordinates]
  );

  // Convert GeoJSON [lng, lat] coordinates to Leaflet [lat, lng] positions
  const polylinePositions = useMemo<[number, number][]>(() => {
    return activeCoordinates
      .filter((pt) => Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1]))
      .map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [activeCoordinates]);

  // Fallback center near origin or destination or Manipal if no coordinates provided
  const centerPosition: [number, number] = useMemo(() => {
    if (polylinePositions.length > 0) return polylinePositions[0];
    if (originCoords && originCoords.length >= 2) return [originCoords[1], originCoords[0]];
    return center;
  }, [polylinePositions, originCoords, center]);

  // Custom marker icons
  const originIcon = useMemo(
    () =>
      L.divIcon({
        className: "origin-marker",
        html: `
          <div style="background-color: #10b981; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(16,185,129,0.5); border: 2.5px solid #ffffff;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: #ffffff;"></div>
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    []
  );

  const destinationIcon = useMemo(
    () =>
      L.divIcon({
        className: "dest-marker",
        html: `
          <div style="background-color: #ef4444; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(239,68,68,0.5); border: 2.5px solid #ffffff;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    []
  );

  // Recommended charger icon
  const recommendedChargerIcon = useMemo(
    () =>
      L.divIcon({
        className: "charger-marker-recommended",
        html: `
          <div style="background-color: #f59e0b; color: #0f172a; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; box-shadow: 0 0 16px rgba(245,158,11,0.9); border: 2.5px solid #ffffff;">
            ⚡
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }),
    []
  );

  // Available corridor charger icon (Standby cyan/slate)
  const availableChargerIcon = useMemo(
    () =>
      L.divIcon({
        className: "charger-marker-standby",
        html: `
          <div style="background-color: #0284c7; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(2,132,199,0.5); border: 2px solid #ffffff;">
            ⚡
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    []
  );

  // Live driver GPS beacon
  const liveDriverIcon = useMemo(
    () =>
      L.divIcon({
        html: `<div style="background:#2563eb;border:3px solid #ffffff;border-radius:9999px;width:22px;height:22px;box-shadow:0 0 16px rgba(37,99,235,0.9);animation:pulse 1.5s infinite;"></div>`,
        className: "live-driver-beacon",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    []
  );

  // Emergency divert destination marker
  const sosChargerIcon = (isReachable: boolean) =>
    L.divIcon({
      html: `<div style="background:${isReachable ? "#059669" : "#dc2626"};border:2px solid #ffffff;border-radius:9999px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px ${isReachable ? "rgba(16,185,129,0.8)" : "rgba(220,38,38,0.8)"};">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      </div>`,
      className: "sos-station-pin",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

  const stationsToDisplay = useMemo(
    () =>
      chargingStops.map((stop, index) => ({
        station: {
          ...stop,
          id: String(stop.id ?? stop.station_id ?? `planned-stop-${index}`),
          lat: stop.lat ?? stop.coordinates?.[1],
          lon: stop.lon ?? stop.coordinates?.[0],
          arrival_soc: stop.arrival_soc_percent ?? stop.arrival_soc,
          departure_soc: stop.target_soc_percent ?? stop.departure_soc,
          charge_time_min:
            stop.charging_time_minutes ?? stop.charge_time_min,
        },
        isRecommended: true,
      })),
    [chargingStops]
  );

  // Derive origin & dest marker positions in [lat, lng]
  const originMarkerPos: [number, number] | null = useMemo(() => {
    if (originCoords && originCoords.length >= 2) {
      return [originCoords[1], originCoords[0]];
    }
    if (polylinePositions.length > 0) {
      return polylinePositions[0];
    }
    return null;
  }, [originCoords, polylinePositions]);

  const destMarkerPos: [number, number] | null = useMemo(() => {
    if (destinationCoords && destinationCoords.length >= 2) {
      return [destinationCoords[1], destinationCoords[0]];
    }
    if (polylinePositions.length > 0) {
      return polylinePositions[polylinePositions.length - 1];
    }
    return null;
  }, [destinationCoords, polylinePositions]);

  const currentLayer = TILE_LAYERS[activeLayerIndex];

  const handleNextLayer = () => {
    setActiveLayerIndex((prev) => (prev + 1) % TILE_LAYERS.length);
  };

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={centerPosition}
        zoom={zoom}
        zoomControl={false}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        {/* Soft pastel map style matching Google Maps / CARTO */}
        <TileLayer
          key={currentLayer.id}
          attribution={currentLayer.attribution}
          url={currentLayer.url}
          maxZoom={19}
        />

        {/* Dynamic center sync if center prop changes */}
        <MapCenterController center={center} zoom={zoom} />

        {/* Fit map bounds dynamically when route changes */}
        {polylinePositions.length >= 2 && (
          <MapBoundsController positions={polylinePositions} />
        )}

        {/* Dynamic bounds controller for emergency SOS scan */}
        {(userLocation || (emergencyStations && emergencyStations.length > 0)) && (
          <MapEmergencyBoundsController
            userLocation={userLocation}
            emergencyStations={emergencyStations}
          />
        )}

        {/* Floating Google Maps-style controls (Recenter target + Zoom +/-) */}
        <FloatingControls onRecenter={onRecenter} />

        {/* Route Polyline */}
        {polylinePositions.length >= 2 && (
          <Polyline
            positions={polylinePositions}
            pathOptions={{
              color: "#2563eb",
              weight: 6,
              opacity: 0.9,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}

        {/* Animated car following road geometry with 10s 80% charge pause */}
        {coordinates &&
          coordinates.length >= 2 &&
          polylinePositions.length >= 2 && (
            <RouteJourneyAnimation
              positions={polylinePositions}
              chargingStops={chargingStops}
              journeyRunId={journeyRunId}
            />
          )}

        {/* Origin Marker (only shown when route is computed) */}
        {coordinates && coordinates.length >= 2 && originMarkerPos && (
          <Marker position={originMarkerPos} icon={originIcon}>
            <Popup>
              <div className="text-slate-900 p-1 font-sans">
                <div className="flex items-center gap-1.5 font-bold text-emerald-600 text-sm">
                  <span>🟢 Origin</span>
                </div>
                <div className="font-semibold text-slate-800 mt-0.5">{originName}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Elev: ~75m (Manipal Plateau)
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker (only shown when route is computed) */}
        {coordinates && coordinates.length >= 2 && destMarkerPos && (
          <Marker position={destMarkerPos} icon={destinationIcon}>
            <Popup>
              <div className="text-slate-900 p-1 font-sans">
                <div className="flex items-center gap-1.5 font-bold text-blue-600 text-sm">
                  <span>🏁 Destination</span>
                </div>
                <div className="font-semibold text-slate-800 mt-0.5">{destinationName}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Elev: ~3m (Arabian Sea Shoreline)
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Charging Station Points (Physics-Planned Stops) */}
        {stationsToDisplay.map(({ station: stop, isRecommended }) => {
          const lng = stop.coordinates ? stop.coordinates[0] : (stop.lon ?? stop.lng);
          const lat = stop.coordinates ? stop.coordinates[1] : stop.lat;
          if (lat === undefined || lng === undefined) return null;
          const stopPos: [number, number] = [lat, lng];

          return (
            <Marker
              key={stop.id}
              position={stopPos}
              icon={isRecommended ? recommendedChargerIcon : availableChargerIcon}
            >
              <Popup>
                <div className="text-slate-900 p-1 min-w-[220px] font-sans">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5 mb-1.5">
                    <span
                      className={`font-bold text-sm flex items-center gap-1 ${
                        isRecommended ? "text-amber-600" : "text-sky-600"
                      }`}
                    >
                      ⚡ {stop.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-2">
                    {isRecommended ? (
                      <span className="inline-block bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded font-bold border border-amber-300">
                        ⚡ Recommended Charging Stop
                      </span>
                    ) : (
                      <span className="inline-block bg-sky-100 text-sky-800 text-[10px] px-2 py-0.5 rounded font-mono border border-sky-300">
                        Available Corridor Station
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Charging Capacity:</span>
                      <span className="font-semibold text-slate-800">
                        {stop.power_kw} kW Ultra-Fast DC
                      </span>
                    </div>
                    {isRecommended && stop.arrival_soc !== undefined && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Arrival Battery:</span>
                          <span className="text-amber-600 font-semibold">{stop.arrival_soc.toFixed(1)}%</span>
                        </div>
                        {stop.departure_soc !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Target Recharged:</span>
                            <span className="text-emerald-600 font-semibold">{stop.departure_soc.toFixed(1)}%</span>
                          </div>
                        )}
                        {stop.charge_time_min !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Est. Charge Time:</span>
                            <span className="text-slate-800 font-semibold">~{stop.charge_time_min.toFixed(0)} mins</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                      <span>Coordinates:</span>
                      <span className="font-mono text-slate-700">
                        {lat.toFixed(4)}, {lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Live Driver GPS Beacon */}
        {userLocation && (
          <Marker position={userLocation} icon={liveDriverIcon}>
            <Popup>
              <div className="font-mono text-xs p-1">
                <span className="font-bold text-sky-600 block">Current Vehicle Location</span>
                <span>
                  {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Emergency SOS Divert Stations */}
        {emergencyStations &&
          emergencyStations.map((st) => (
            <Marker
              key={st.station_id}
              position={st.coordinates}
              icon={sosChargerIcon(st.is_reachable)}
            >
              <Popup>
                <div className="font-mono text-xs p-1 min-w-[200px]">
                  <span
                    className={`font-bold block ${
                      st.is_reachable ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    🚨 {st.name}
                  </span>
                  <div className="text-slate-700 text-[11px] mt-1 space-y-0.5">
                    <div>Distance: {st.distance_km} km</div>
                    <div>Arrival Battery: {st.arrival_soc_percent}%</div>
                    <div>Power: {st.power_kw} kW</div>
                    {st.is_reachable ? (
                      <div className="text-emerald-600 font-semibold">
                        Reachable{" "}
                        {st.recommended_eco_speed_kmh < 60
                          ? `[Cap speed to ${st.recommended_eco_speed_kmh} km/h]`
                          : ""}
                      </div>
                    ) : (
                      <div className="text-rose-600 font-semibold">
                        Unreachable (Depletes before arrival)
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>

      {/* Bottom Left Layers Pill */}
      <div className="absolute bottom-6 left-4 z-[1000] pointer-events-auto">
        <button
          type="button"
          onClick={handleNextLayer}
          title={`Active: ${currentLayer.name} - Click to switch`}
          className="flex items-center space-x-2.5 px-3 py-2 bg-white hover:bg-slate-50 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.25)] text-xs font-semibold text-slate-800 transition cursor-pointer select-none"
        >
          <div className="w-5 h-5 bg-slate-900 rounded flex items-center justify-center text-white text-[9px] font-mono">
            ▦
          </div>
          <span>Layers</span>
          <span className="text-[10px] text-slate-500 font-normal">({currentLayer.name.split(" ")[0]})</span>
        </button>
      </div>
    </div>
  );
}
