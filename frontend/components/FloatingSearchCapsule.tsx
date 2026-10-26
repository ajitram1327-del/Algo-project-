"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Navigation,
  ArrowUpDown,
  MapPin,
  LocateFixed,
  Car,
  X,
  Search,
  Check,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";

export interface NominatimResult {
  place_id?: number | string;
  name?: string;
  display_name: string;
  lat: string | number;
  lon: string | number;
}

export interface DestinationPayload {
  originName: string;
  originCoords: [number, number];
  destName: string;
  destCoords: [number, number];
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
  currentLocation?: [number, number] | null;
}

export default function FloatingSearchCapsule({
  onRouteSubmit,
  isLoading,
  onClearRoute,
  hasActiveRoute,
  userProfile,
  onOpenGarage,
  currentLocation,
}: FloatingSearchProps) {
  // Mode: expanded (A to B planner open) or collapsed
  const [isExpanded, setIsExpanded] = useState(false);

  // Origin (A) State
  const [originMode, setOriginMode] = useState<"current" | "custom">("current");
  const [originQuery, setOriginQuery] = useState("Your Location");
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);

  // Destination (B) State
  const [destQuery, setDestQuery] = useState("");
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);

  // Autocomplete Suggestions
  const [activeField, setActiveField] = useState<"origin" | "dest" | null>(null);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Trip Specs
  const [startingSoc, setStartingSoc] = useState(70);
  const [passengers, setPassengers] = useState(1);

  // Initialize live current location
  const fallbackCoords: [number, number] = [13.3412, 74.7478]; // Manipal default
  const liveLocation = currentLocation || fallbackCoords;

  useEffect(() => {
    if (originMode === "current") {
      setOriginCoords(liveLocation);
      setOriginQuery("Your Location");
    }
  }, [liveLocation, originMode]);

  // India-bounded Geocoding Query (Proxy + Fallback)
  const queryGeocode = (text: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (text.trim().length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        let results: NominatimResult[] = [];
        // 1. Try backend geocode proxy first
        try {
          const apiRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/geocode?q=${encodeURIComponent(
              text.trim()
            )}`
          );
          if (apiRes.ok) {
            results = await apiRes.json();
          }
        } catch {}

        // 2. Direct Nominatim fallback if backend proxy returns empty
        if (!results || results.length === 0) {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              text.trim()
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

  const handleOriginChange = (val: string) => {
    setOriginQuery(val);
    setOriginMode("custom");
    setActiveField("origin");
    queryGeocode(val);
  };

  const handleDestChange = (val: string) => {
    setDestQuery(val);
    setActiveField("dest");
    queryGeocode(val);
  };

  const handleSelectPlace = (place: NominatimResult, target: "origin" | "dest") => {
    const lat = typeof place.lat === "number" ? place.lat : parseFloat(String(place.lat));
    const lon = typeof place.lon === "number" ? place.lon : parseFloat(String(place.lon));
    const shortName = (place.name || place.display_name).split(",")[0].trim();

    if (target === "origin") {
      setOriginQuery(shortName);
      setOriginCoords([lat, lon]);
      setOriginMode("custom");
    } else {
      setDestQuery(shortName);
      setDestCoords([lat, lon]);
    }

    setSuggestions([]);
    setActiveField(null);
  };

  const setOriginToCurrentLocation = () => {
    setOriginMode("current");
    setOriginQuery("Your Location");
    setOriginCoords(liveLocation);
    setSuggestions([]);
    setActiveField(null);
  };

  const handleSwapLocations = () => {
    const tempQuery = originQuery;
    const tempCoords = originCoords;
    const tempMode = originMode;

    if (tempMode === "current") {
      // Swapping when origin was live location
      setOriginQuery(destQuery || "Destination");
      setOriginCoords(destCoords);
      setOriginMode("custom");

      setDestQuery("Your Location");
      setDestCoords(liveLocation);
    } else {
      setOriginQuery(destQuery);
      setOriginCoords(destCoords);
      setOriginMode("custom");

      setDestQuery(tempQuery);
      setDestCoords(tempCoords);
    }
  };

  const handleCalculateRoute = () => {
    const finalOrigin = originCoords || liveLocation;
    if (!finalOrigin || !destCoords) return;

    onRouteSubmit({
      originName: originMode === "current" ? "Your Location" : originQuery,
      originCoords: finalOrigin,
      destName: destQuery || "Destination",
      destCoords,
      startingSoc,
      passengers,
    });

    setIsExpanded(false);
    setSuggestions([]);
  };

  const handleResetAll = () => {
    setDestQuery("");
    setDestCoords(null);
    setOriginToCurrentLocation();
    setSuggestions([]);
    setActiveField(null);
    setIsExpanded(false);
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
    <div className="absolute top-4 left-4 z-[1000] w-[400px] max-w-[calc(100vw-32px)] font-sans antialiased">
      {/* 1. COLLAPSED VIEW: Google Maps Style Search Capsule */}
      {!isExpanded && !hasActiveRoute && (
        <div className="bg-white rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.18),0_4px_16px_rgba(0,0,0,0.08)] flex items-center px-4 py-2.5 space-x-2.5 border border-slate-100 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />

          <input
            type="text"
            value={destQuery}
            onFocus={() => setIsExpanded(true)}
            onChange={(e) => {
              setDestQuery(e.target.value);
              setIsExpanded(true);
              handleDestChange(e.target.value);
            }}
            placeholder="Search destination or plan route..."
            className="flex-1 text-[14px] bg-transparent outline-none text-slate-800 placeholder-slate-400 font-normal"
          />

          {/* Quick Directions Button (Opens A to B Planner) */}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            title="Directions (A to B Journey Planner)"
            className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm transition shrink-0 cursor-pointer"
          >
            <Navigation className="w-4 h-4 rotate-45" fill="currentColor" />
          </button>

          {/* Garage EV Switcher Badge */}
          <button
            type="button"
            onClick={onOpenGarage}
            title="Open Garage / Switch Vehicle"
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full transition flex items-center space-x-1 shrink-0 cursor-pointer"
          >
            <span>🚗</span>
            <span className="truncate max-w-[65px]">{vehicleName.split(" ")[1] || "EV"}</span>
          </button>
        </div>
      )}

      {/* 2. ACTIVE ROUTE VIEW (Compact Pill when a journey is already plotted) */}
      {!isExpanded && hasActiveRoute && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.14)] p-3 border border-slate-100 flex items-center justify-between space-x-3 text-xs">
          <div className="flex items-center space-x-2.5 truncate">
            <div className="flex flex-col items-center space-y-0.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-emerald-500 bg-emerald-100" />
              <span className="w-0.5 h-3 bg-slate-200" />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
            <div className="truncate">
              <div className="font-semibold text-slate-800 truncate text-[11px]">
                {originMode === "current" ? "Your Location" : originQuery}
              </div>
              <div className="font-bold text-slate-900 truncate text-[12px]">{destQuery}</div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded-lg transition cursor-pointer flex items-center space-x-1"
            >
              <SlidersHorizontal className="w-3 h-3 text-slate-500" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              title="Clear Route"
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. EXPANDED A TO B ROUTE PLANNER CARD */}
      {isExpanded && (
        <div className="bg-white rounded-2xl shadow-[0_6px_30px_rgba(0,0,0,0.18)] border border-slate-100 p-4 space-y-3.5 text-slate-800 animate-in fade-in zoom-in-95 duration-150">
          {/* Card Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Navigation className="w-3.5 h-3.5 rotate-45" fill="currentColor" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 leading-tight">Plan EV Route</h3>
                <span className="text-[10px] text-slate-400 font-medium">A to B Navigation</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                setSuggestions([]);
              }}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-full text-xs transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Location A & B Input Matrix with Connectors */}
          <div className="relative flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
            {/* Visual Dot Connector Line */}
            <div className="flex flex-col items-center justify-between self-stretch py-2.5 px-0.5 shrink-0">
              <span className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-white" />
              <span className="w-0.5 flex-1 bg-slate-300 my-1 border-dashed" />
              <span className="w-3 h-3 rounded-full bg-red-500" />
            </div>

            {/* Input Stack */}
            <div className="flex-1 space-y-2">
              {/* Point A (Origin) */}
              <div className="relative flex items-center bg-white rounded-lg px-2.5 py-1.5 border border-slate-200 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                <input
                  type="text"
                  value={originQuery}
                  onFocus={() => {
                    setActiveField("origin");
                    if (originMode === "custom" && originQuery) queryGeocode(originQuery);
                  }}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  placeholder="Starting point in India..."
                  className="flex-1 text-xs bg-transparent outline-none text-slate-800 placeholder-slate-400 font-medium"
                />

                {originMode === "current" ? (
                  <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded shrink-0">
                    <LocateFixed className="w-2.5 h-2.5" />
                    <span>GPS</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={setOriginToCurrentLocation}
                    title="Reset to My Location"
                    className="p-1 hover:bg-slate-100 rounded text-blue-600 transition cursor-pointer shrink-0"
                  >
                    <LocateFixed className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Point B (Destination) */}
              <div className="relative flex items-center bg-white rounded-lg px-2.5 py-1.5 border border-slate-200 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                <input
                  type="text"
                  value={destQuery}
                  onFocus={() => {
                    setActiveField("dest");
                    if (destQuery) queryGeocode(destQuery);
                  }}
                  onChange={(e) => handleDestChange(e.target.value)}
                  placeholder="Choose destination in India..."
                  className="flex-1 text-xs bg-transparent outline-none text-slate-800 placeholder-slate-400 font-medium"
                />
                {destQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setDestQuery("");
                      setDestCoords(null);
                      setSuggestions([]);
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Swap Button (A <-> B) */}
            <button
              type="button"
              onClick={handleSwapLocations}
              title="Swap Origin and Destination"
              className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 transition shrink-0 cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Autocomplete Suggestions Dropdown */}
          {activeField && (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto">
              {/* Option to select live location for Origin */}
              {activeField === "origin" && (
                <button
                  type="button"
                  onClick={setOriginToCurrentLocation}
                  className="w-full px-3 py-2.5 text-left bg-blue-50/60 hover:bg-blue-50 flex items-center space-x-2.5 text-blue-700 font-semibold cursor-pointer transition"
                >
                  <LocateFixed className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Use My Current Location</span>
                </button>
              )}

              {isSearching && (
                <div className="px-3 py-3 flex items-center justify-center space-x-2 text-slate-400 text-[11px]">
                  <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>Searching locations across India...</span>
                </div>
              )}

              {suggestions.map((place, idx) => (
                <button
                  key={place.place_id || idx}
                  type="button"
                  onClick={() => handleSelectPlace(place, activeField)}
                  className="w-full px-3 py-2.5 text-left hover:bg-slate-50 flex items-start space-x-2.5 transition cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="flex-1 truncate">
                    <div className="font-semibold text-slate-800 truncate text-xs">
                      {(place.name || place.display_name).split(",")[0]}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {place.display_name.split(",").slice(1).join(",")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Vehicle Profile Switcher */}
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-sm">🚗</span>
              <div>
                <div className="font-bold text-slate-800 text-[11px] leading-tight">
                  {vehicleName}
                </div>
                <div className="text-[10px] text-emerald-600 font-medium">
                  {calibratedCapacity} kWh usable &bull; Physics Calibrated
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

          {/* Occupants & Starting Battery SoC */}
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
                    className={`py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
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

          {/* Action Buttons */}
          <div className="flex space-x-2 pt-1">
            <button
              type="button"
              onClick={handleResetAll}
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCalculateRoute}
              disabled={isLoading || !destCoords}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Calculating Route...</span>
                </>
              ) : (
                <>
                  <span>Navigate Corridor</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
