"use client";

import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ChargingStop } from "@/lib/api";

interface MapProps {
  coordinates?: [number, number][]; // GeoJSON format: [longitude, latitude]
  chargingStops?: any[];
  availableStations?: any[];
  originName?: string;
  destinationName?: string;
  originCoords?: [number, number]; // [lng, lat]
  destinationCoords?: [number, number]; // [lng, lat]
}

const DEFAULT_CORRIDOR_COORDS: [number, number][] = [
  [74.7865, 13.3525],
  [74.7780, 13.3510],
  [74.7650, 13.3480],
  [74.7500, 13.3440],
  [74.7320, 13.3460],
  [74.7150, 13.3490],
  [74.7003, 13.3540],
];

// Controller to smoothly fit map bounds to route geometry
function MapBoundsController({ positions }: { positions: [number, number][] }) {
  const map = useMap();

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

export default function RouteMap({
  coordinates,
  chargingStops = [],
  availableStations = [],
  originName = "Manipal",
  destinationName = "Malpe Beach",
  originCoords,
  destinationCoords,
}: MapProps) {
  const activeCoordinates = useMemo(() => {
    return (coordinates && coordinates.length >= 2) ? coordinates : DEFAULT_CORRIDOR_COORDS;
  }, [coordinates]);

  // Convert GeoJSON [lng, lat] coordinates to Leaflet [lat, lng] positions
  const polylinePositions = useMemo<[number, number][]>(() => {
    return activeCoordinates
      .filter((pt) => Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1]))
      .map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [activeCoordinates]);

  // Fallback center near Manipal if no coordinates provided
  const centerPosition: [number, number] =
    polylinePositions.length > 0 ? polylinePositions[0] : [13.3409, 74.7858];

  // Custom marker icons
  const originIcon = useMemo(
    () =>
      L.divIcon({
        className: "origin-marker",
        html: `
          <div style="background-color: #10b981; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; box-shadow: 0 4px 10px rgba(16,185,129,0.5); border: 2.5px solid #ffffff;">
            A
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    []
  );

  const destinationIcon = useMemo(
    () =>
      L.divIcon({
        className: "dest-marker",
        html: `
          <div style="background-color: #3b82f6; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; box-shadow: 0 4px 10px rgba(59,130,246,0.5); border: 2.5px solid #ffffff;">
            B
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    []
  );

  // Recommended charger icon (Active amber pulse)
  const recommendedChargerIcon = useMemo(
    () =>
      L.divIcon({
        className: "charger-marker-recommended",
        html: `
          <div style="background-color: #f59e0b; color: #0f172a; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; box-shadow: 0 0 16px rgba(245,158,11,0.9); border: 2.5px solid #ffffff; animation: pulse 1.5s infinite;">
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

  // Merge stations: give priority to recommended stops if they have dynamic arrival SoC
  const stationsToDisplay = useMemo(() => {
    const map = new Map<string, { station: ChargingStop; isRecommended: boolean }>();

    // Add all corridor stations first as standby
    for (const st of availableStations) {
      map.set(st.id, { station: st, isRecommended: false });
    }

    // Overlay any recommended stops (with active arrival SoC telemetry)
    for (const st of chargingStops) {
      const id = st.id || st.station_id || `stop-${Math.random()}`;
      map.set(id, {
        station: {
          ...st,
          id,
          lat: st.lat !== undefined ? st.lat : (st.coordinates ? st.coordinates[1] : undefined),
          lon: st.lon !== undefined ? st.lon : (st.coordinates ? st.coordinates[0] : undefined),
          arrival_soc: st.arrival_soc_percent ?? st.arrival_soc,
          departure_soc: st.target_soc_percent ?? st.departure_soc,
          charge_time_min: st.charging_time_minutes ?? st.charge_time_min,
        },
        isRecommended: true,
      });
    }

    return Array.from(map.values());
  }, [availableStations, chargingStops]);

  // Derive origin & dest marker positions in [lat, lng]
  const originMarkerPos: [number, number] | null = useMemo(() => {
    if (originCoords && originCoords.length >= 2) {
      return [originCoords[1], originCoords[0]];
    }
    if (polylinePositions.length > 0) {
      return polylinePositions[0];
    }
    return [13.3409, 74.7858];
  }, [originCoords, polylinePositions]);

  const destMarkerPos: [number, number] | null = useMemo(() => {
    if (destinationCoords && destinationCoords.length >= 2) {
      return [destinationCoords[1], destinationCoords[0]];
    }
    if (polylinePositions.length > 0) {
      return polylinePositions[polylinePositions.length - 1];
    }
    return [13.349, 74.7003];
  }, [destinationCoords, polylinePositions]);

  return (
    <div className="relative w-full h-full min-h-[460px] rounded-2xl overflow-hidden border border-slate-700/60 shadow-2xl">
      <MapContainer
        center={centerPosition}
        zoom={13}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Fit map bounds dynamically when route changes */}
        {polylinePositions.length >= 2 && (
          <MapBoundsController positions={polylinePositions} />
        )}

        {/* Route Polyline */}
        {polylinePositions.length >= 2 && (
          <>
            {/* Outer glowing halo */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: "#38bdf8",
                weight: 8,
                opacity: 0.4,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* Core route line */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: "#2563eb",
                weight: 4.5,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </>
        )}

        {/* Origin Marker */}
        {originMarkerPos && (
          <Marker position={originMarkerPos} icon={originIcon}>
            <Popup>
              <div className="text-slate-100 p-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-sm">
                  <span>🟢 Origin</span>
                </div>
                <div className="font-semibold text-slate-200 mt-0.5">{originName}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Elev: ~75m (Manipal Plateau)
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destMarkerPos && (
          <Marker position={destMarkerPos} icon={destinationIcon}>
            <Popup>
              <div className="text-slate-100 p-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-400 text-sm">
                  <span>🏁 Destination</span>
                </div>
                <div className="font-semibold text-slate-200 mt-0.5">{destinationName}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Elev: ~3m (Arabian Sea Shoreline)
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Charging Station Points (Corridor Network & Recommended Stops) */}
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
                <div className="text-slate-100 p-1 min-w-[220px]">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-700 pb-1.5 mb-1.5">
                    <span
                      className={`font-bold text-sm flex items-center gap-1 ${
                        isRecommended ? "text-amber-400" : "text-sky-400"
                      }`}
                    >
                      ⚡ {stop.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-2">
                    {isRecommended ? (
                      <span className="inline-block bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded font-bold border border-amber-500/40">
                        ⚡ Recommended Charging Stop
                      </span>
                    ) : (
                      <span className="inline-block bg-sky-500/20 text-sky-300 text-[10px] px-2 py-0.5 rounded font-mono border border-sky-500/30">
                        Available Corridor Station
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Charging Capacity:</span>
                      <span className="font-semibold text-slate-200">
                        {stop.power_kw} kW Ultra-Fast DC
                      </span>
                    </div>
                    {isRecommended && stop.arrival_soc !== undefined && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Arrival Battery:</span>
                          <span className="text-amber-400 font-semibold">{stop.arrival_soc.toFixed(1)}%</span>
                        </div>
                        {stop.departure_soc !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Target Recharged:</span>
                            <span className="text-emerald-400 font-semibold">{stop.departure_soc.toFixed(1)}%</span>
                          </div>
                        )}
                        {stop.charge_time_min !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Est. Charge Time:</span>
                            <span className="text-slate-200 font-semibold">~{stop.charge_time_min.toFixed(0)} mins</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                      <span>Coordinates:</span>
                      <span className="font-mono text-slate-300">
                        {lat.toFixed(4)}, {lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
