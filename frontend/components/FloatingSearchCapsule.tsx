"use client";

import React, { useState, useRef } from "react";

interface NominatimResult {
  place_id?: number | string;
  name?: string;
  display_name: string;
  lat: string | number;
  lon: string | number;
}

interface DestinationPayload {
  name: string;
  coords: [number, number];
  startingSoc: number;
  passengers: number;
}

interface FloatingSearchProps {
  onRouteSubmit: (payload: DestinationPayload) => void;
  isLoading: boolean;
  onClearRoute: () => void;
  hasActiveRoute: boolean;
  userProfile: any;
  onOpenGarage: () => void;
}

export default function FloatingSearchCapsule({
  onRouteSubmit,
  isLoading,
  onClearRoute,
  hasActiveRoute,
  userProfile,
  onOpenGarage,
}: FloatingSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDest, setSelectedDest] = useState<{
    name: string;
    coords: [number, number];
  } | null>(null);

  const [startingSoc, setStartingSoc] = useState(70);
  const [passengers, setPassengers] = useState(1);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Strict India-only geocoding
  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (val.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        let results: NominatimResult[] = [];
        // Try backend geocode proxy first
        try {
          const apiRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/geocode?q=${encodeURIComponent(
              val.trim()
            )}`
          );
          if (apiRes.ok) {
            results = await apiRes.json();
          }
        } catch {}

        // Fallback to direct Nominatim if needed
        if (!results || results.length === 0) {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              val.trim()
            )}&countrycodes=in&limit=5&addressdetails=1`
          );
          if (res.ok) {
            results = await res.json();
          }
        }
        setSuggestions(results || []);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);
  };

  const handleSelectPlace = (place: NominatimResult) => {
    const lat = typeof place.lat === "number" ? place.lat : parseFloat(String(place.lat));
    const lon = typeof place.lon === "number" ? place.lon : parseFloat(String(place.lon));
    const shortName = (place.name || place.display_name).split(",")[0];

    setSelectedDest({ name: shortName, coords: [lat, lon] });
    setQuery(shortName);
    setSuggestions([]);
  };

  const handleCalculate = () => {
    if (!selectedDest) return;
    onRouteSubmit({
      name: selectedDest.name,
      coords: selectedDest.coords,
      startingSoc,
      passengers,
    });
  };

  const resetAll = () => {
    setSelectedDest(null);
    setQuery("");
    setSuggestions([]);
    onClearRoute();
  };

  const vehicleName = userProfile?.variant_id
    ? userProfile.variant_id.replace(/_/g, " ").toUpperCase()
    : "TATA NEXON EV LR";

  const calibratedCapacity =
    userProfile?.calibration?.calibrated_capacity_kwh ||
    userProfile?.calibrated_capacity_kwh ||
    43.5;

  return (
    <div className="absolute top-4 left-4 z-[1000] w-[390px] max-w-[calc(100vw-32px)] font-sans antialiased">
      {!selectedDest && !hasActiveRoute ? (
        <div className="bg-white rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.18),0_4px_16px_rgba(0,0,0,0.08)] flex items-center px-4 py-2.5 space-x-3 border border-slate-100 transition-all">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>

          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search destination in India..."
            className="flex-1 text-[14px] bg-transparent outline-none text-slate-800 placeholder-slate-400 font-normal"
          />

          {isSearching ? (
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
          ) : query ? (
            <button
              onClick={() => {
                setQuery("");
                setSuggestions([]);
              }}
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 text-xs font-bold"
            >
              ✕
            </button>
          ) : (
            <button
              onClick={onOpenGarage}
              title="Open Garage / Switch Vehicle"
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full transition flex items-center space-x-1 shrink-0"
            >
              <span>🚗</span>
              <span className="truncate max-w-[70px]">{vehicleName.split(" ")[1] || "EV"}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.15)] border border-slate-100 p-4 space-y-4 text-slate-800">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Destination
              </span>
              <h3 className="text-sm font-bold text-slate-900 truncate max-w-[240px]">
                {selectedDest?.name || query}
              </h3>
            </div>
            <button
              onClick={resetAll}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-full text-xs font-bold"
            >
              ✕
            </button>
          </div>

          {/* Active Synced Vehicle Chip */}
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-sm">🚗</span>
              <div>
                <div className="font-bold text-slate-800 text-[11px] leading-tight">
                  {vehicleName}
                </div>
                <div className="text-[10px] text-emerald-600 font-medium">
                  {calibratedCapacity} kWh usable &bull; Profile Calibrated
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenGarage}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[10px] font-semibold transition cursor-pointer"
            >
              Switch
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between items-center text-slate-600 mb-1.5 font-medium">
                <span>Occupants</span>
                <span className="text-slate-900 font-semibold">
                  {passengers} {passengers > 1 ? "People" : "Driver"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPassengers(n)}
                    className={`py-1.5 rounded-lg border text-xs font-semibold transition ${
                      passengers === n
                        ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-slate-600 mb-1 font-medium">
                <span>Starting Battery Level</span>
                <span className="font-mono font-bold text-blue-600 text-sm">{startingSoc}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                value={startingSoc}
                onChange={(e) => setStartingSoc(Number(e.target.value))}
                className="w-full accent-blue-600 h-1.5 bg-slate-100 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div className="flex space-x-2 pt-1">
            <button
              onClick={resetAll}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={handleCalculate}
              disabled={isLoading}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Computing Physics...</span>
                </>
              ) : (
                <span>Navigate Corridor</span>
              )}
            </button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && !selectedDest && (
        <div className="mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden divide-y divide-slate-100 text-xs">
          {suggestions.map((place) => (
            <button
              key={place.place_id}
              onClick={() => handleSelectPlace(place)}
              className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-start space-x-2.5 transition cursor-pointer"
            >
              <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="flex-1 truncate">
                <div className="font-semibold text-slate-800 truncate">
                  {place.display_name.split(",")[0]}
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                  {place.display_name.split(",").slice(1).join(",")}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
