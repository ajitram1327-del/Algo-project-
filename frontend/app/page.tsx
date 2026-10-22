'use client';

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  fetchVehicles,
  evaluateRoutePhysics,
  fetchDriverBriefing,
  fetchOcmChargers,
  searchLocations,
  Vehicle,
  RouteSummary,
  OcmCharger,
  GeocodeLocation,
} from '../lib/api';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  Zap,
  AlertTriangle,
  BatteryCharging,
  Wind,
  Thermometer,
  Users,
  MapPin,
  Navigation,
  Search,
  ArrowUpDown,
  Loader2,
} from 'lucide-react';

// Dynamic Leaflet Map Import (no SSR) with fallback placeholder
const MapComponent = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[460px] rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        Initializing Interactive Corridor Map...
      </div>
    </div>
  ),
});

export default function RouteDashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('tata_nexon_ev');
  const [passengers, setPassengers] = useState<number>(2);
  const [tempC, setTempC] = useState<number>(34);
  const [initialSoc, setInitialSoc] = useState<number>(25);
  const [chargers, setChargers] = useState<OcmCharger[]>([]);

  // Location Search State
  const [originName, setOriginName] = useState<string>('Manipal (Syndicate Circle)');
  const [destinationName, setDestinationName] = useState<string>('Malpe Beach (Sea Walk)');
  const [originCoords, setOriginCoords] = useState<[number, number]>([74.7865, 13.3525]); // [lng, lat]
  const [destCoords, setDestCoords] = useState<[number, number]>([74.7003, 13.3540]);     // [lng, lat]
  const [activeRouteCoords, setActiveRouteCoords] = useState<[number, number][] | undefined>(undefined);

  // Autocomplete UI State
  const [originSearch, setOriginSearch] = useState<string>('Manipal');
  const [destSearch, setDestSearch] = useState<string>('Malpe Beach');
  const [originSuggestions, setOriginSuggestions] = useState<GeocodeLocation[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<GeocodeLocation[]>([]);
  const [originLoading, setOriginLoading] = useState<boolean>(false);
  const [destLoading, setDestLoading] = useState<boolean>(false);
  const [showOriginDropdown, setShowOriginDropdown] = useState<boolean>(false);
  const [showDestDropdown, setShowDestDropdown] = useState<boolean>(false);

  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [briefing, setBriefing] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [briefingLoading, setBriefingLoading] = useState<boolean>(false);

  const originTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const destTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchVehicles()
      .then((data) => {
        setVehicles(data);
        if (data.length > 0) setSelectedVehicle(data[1].id);
      })
      .catch((err) => console.error('Failed to load vehicles', err));

    fetchOcmChargers(13.3525, 74.7865, 25)
      .then((data) => setChargers(data))
      .catch((err) => console.error('Failed to load OCM chargers', err));
  }, []);

  // Debounced search for Origin
  const handleOriginChange = (text: string) => {
    setOriginSearch(text);
    if (originTimeoutRef.current) clearTimeout(originTimeoutRef.current);
    if (text.trim().length < 2) {
      setOriginSuggestions([]);
      setShowOriginDropdown(false);
      return;
    }
    setOriginLoading(true);
    originTimeoutRef.current = setTimeout(async () => {
      const results = await searchLocations(text);
      setOriginSuggestions(results);
      setShowOriginDropdown(true);
      setOriginLoading(false);
    }, 350);
  };

  // Debounced search for Destination
  const handleDestChange = (text: string) => {
    setDestSearch(text);
    if (destTimeoutRef.current) clearTimeout(destTimeoutRef.current);
    if (text.trim().length < 2) {
      setDestSuggestions([]);
      setShowDestDropdown(false);
      return;
    }
    setDestLoading(true);
    destTimeoutRef.current = setTimeout(async () => {
      const results = await searchLocations(text);
      setDestSuggestions(results);
      setShowDestDropdown(true);
      setDestLoading(false);
    }, 350);
  };

  const selectOrigin = (loc: GeocodeLocation) => {
    setOriginName(loc.name);
    setOriginSearch(loc.name);
    setOriginCoords([loc.lon, loc.lat]);
    setShowOriginDropdown(false);
    // Reload nearby chargers for the new origin
    fetchOcmChargers(loc.lat, loc.lon, 25)
      .then((data) => setChargers(data))
      .catch((err) => console.error('Failed to refresh chargers', err));
  };

  const selectDest = (loc: GeocodeLocation) => {
    setDestinationName(loc.name);
    setDestSearch(loc.name);
    setDestCoords([loc.lon, loc.lat]);
    setShowDestDropdown(false);
  };

  const swapLocations = () => {
    const tmpName = originName;
    const tmpSearch = originSearch;
    const tmpCoords = originCoords;

    setOriginName(destinationName);
    setOriginSearch(destSearch);
    setOriginCoords(destCoords);

    setDestinationName(tmpName);
    setDestSearch(tmpSearch);
    setDestCoords(tmpCoords);

    // Refresh chargers for new origin
    fetchOcmChargers(destCoords[1], destCoords[0], 25)
      .then((data) => setChargers(data))
      .catch((err) => console.error('Failed to refresh chargers', err));
  };

  const handleCalculate = async () => {
    setLoading(true);
    setBriefing('');
    try {
      const result = await evaluateRoutePhysics({
        vehicle_model: selectedVehicle,
        passengers,
        ambient_temp_c: tempC,
        initial_soc_percent: initialSoc,
        origin_lat: originCoords[1],
        origin_lon: originCoords[0],
        dest_lat: destCoords[1],
        dest_lon: destCoords[0],
      });
      setSummary(result);

      if ((result as any).available_chargers && (result as any).available_chargers.length > 0) {
        setChargers((result as any).available_chargers);
      }

      if (result.route_coordinates && result.route_coordinates.length >= 2) {
        setActiveRouteCoords(result.route_coordinates);
      }

      // If instant deterministic driver briefing was generated, display it immediately
      if ((result as any).driver_briefing) {
        setBriefing((result as any).driver_briefing);
      } else {
        // Async fallback fetch
        setBriefingLoading(true);
        fetchDriverBriefing({
          vehicle_model: selectedVehicle,
          passengers,
          ambient_temp_c: tempC,
          route_summary: result,
        })
          .then((text) => setBriefing(text))
          .catch(() => setBriefing('Unable to generate AI briefing at this time.'))
          .finally(() => setBriefingLoading(false));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* LEFT: Controls & Analytics Sidebar */}
      <aside className="w-[440px] h-full flex flex-col border-r border-slate-800 bg-slate-900/90 p-5 overflow-y-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-emerald-400 flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-400" />
            EV Physics Route Planner
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-Time 3D Elevation & Dynamic Battery Telemetry
          </p>
        </div>

        {/* Location Search Box */}
        <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/70 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-1.5 text-sky-400">
              <Navigation className="h-3.5 w-3.5" /> Route Navigation
            </span>
            <button
              onClick={swapLocations}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-400 transition"
              title="Swap origin and destination"
            >
              <ArrowUpDown className="h-3 w-3" /> Swap
            </button>
          </div>

          {/* Origin Input */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-700 rounded-lg px-2.5 py-1.5 focus-within:border-emerald-500 transition">
              <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
              <input
                type="text"
                value={originSearch}
                onChange={(e) => handleOriginChange(e.target.value)}
                onFocus={() => originSuggestions.length > 0 && setShowOriginDropdown(true)}
                placeholder="Search Origin (e.g., Manipal)"
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              {originLoading && <Loader2 className="h-3.5 w-3.5 text-emerald-400 animate-spin shrink-0" />}
            </div>

            {/* Origin Suggestions Dropdown */}
            {showOriginDropdown && originSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                {originSuggestions.map((loc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectOrigin(loc)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-emerald-600/20 border-b border-slate-800/60 last:border-0 transition"
                  >
                    <div className="font-semibold text-emerald-400">{loc.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{loc.display_name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Destination Input */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-700 rounded-lg px-2.5 py-1.5 focus-within:border-blue-500 transition">
              <MapPin className="h-4 w-4 text-blue-400 shrink-0" />
              <input
                type="text"
                value={destSearch}
                onChange={(e) => handleDestChange(e.target.value)}
                onFocus={() => destSuggestions.length > 0 && setShowDestDropdown(true)}
                placeholder="Search Destination (e.g., Malpe Beach)"
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              {destLoading && <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />}
            </div>

            {/* Destination Suggestions Dropdown */}
            {showDestDropdown && destSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                {destSuggestions.map((loc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectDest(loc)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-blue-600/20 border-b border-slate-800/60 last:border-0 transition"
                  >
                    <div className="font-semibold text-blue-400">{loc.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{loc.display_name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Vehicle & Environmental Inputs */}
        <div className="space-y-3.5 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Vehicle Model
            </label>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.battery_kwh} kWh)
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> Passengers
              </span>
              <span className="font-semibold text-emerald-400">{passengers}</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={passengers}
              onChange={(e) => setPassengers(Number(e.target.value))}
              className="w-full accent-emerald-500 mt-1"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1">
                <Thermometer className="h-3 w-3" /> Ambient Temperature
              </span>
              <span className="font-semibold text-emerald-400">{tempC}°C</span>
            </div>
            <input
              type="range"
              min="10"
              max="45"
              value={tempC}
              onChange={(e) => setTempC(Number(e.target.value))}
              className="w-full accent-emerald-500 mt-1"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1">
                <BatteryCharging className="h-3 w-3" /> Starting Battery SoC
              </span>
              <span className="font-semibold text-emerald-400">{initialSoc}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={initialSoc}
              onChange={(e) => setInitialSoc(Number(e.target.value))}
              className="w-full accent-emerald-500 mt-1"
            />
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm transition duration-150 disabled:opacity-50 shadow-lg shadow-emerald-950/40"
          >
            {loading ? 'Evaluating Forces...' : 'Simulate Route Physics'}
          </button>
        </div>

        {/* Telemetry KPI Cards */}
        {summary && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Telemetry & Physics Output
            </h2>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Total Distance</span>
                <span className="text-base font-bold text-slate-100">
                  {summary.total_distance_km} km
                </span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Net Energy</span>
                <span className="text-base font-bold text-emerald-400">
                  {summary.net_energy_kwh} kWh
                </span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Final Battery SoC</span>
                <span
                  className={`text-base font-bold ${
                    summary.reserve_breached ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {summary.final_soc_percent}%
                </span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Max Gradient</span>
                <span className="text-base font-bold text-amber-400">
                  {summary.max_gradient_percent}%
                </span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Climb / Descent</span>
                <span className="text-xs font-bold text-slate-200">
                  +{summary.total_climb_m}m / -{summary.total_descent_m}m
                </span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Energy Regenerated</span>
                <span className="text-base font-bold text-cyan-400">
                  {summary.gross_regenerated_kwh} kWh
                </span>
              </div>
            </div>

            {summary.charging_stops && summary.charging_stops.length > 0 && (
              <div className="p-3.5 bg-amber-950/30 border border-amber-500/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <BatteryCharging className="h-4 w-4" /> Planned Charging Stops ({summary.charging_stops.length})
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    +{summary.total_energy_charged_kwh} kWh Added
                  </span>
                </div>
                <div className="space-y-2">
                  {summary.charging_stops.map((stop, idx) => (
                    <div key={idx} className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-700/80 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-100 flex items-center gap-1 truncate max-w-[240px]">
                          ⚡ {stop.name}
                        </span>
                        <span className="text-slate-400 text-[10px] font-mono shrink-0">km {stop.arrival_distance_km}</span>
                      </div>
                      <div className="flex justify-between text-slate-300 text-[11px]">
                        <span>Recharge: <span className="text-rose-400">{stop.arrival_soc_percent}%</span> → <span className="text-emerald-400 font-semibold">{stop.target_soc_percent}%</span></span>
                        <span className="text-amber-300 font-semibold">~{stop.charging_time_minutes} mins</span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between pt-0.5 border-t border-slate-800">
                        <span>Speed: {stop.power_kw} kW Ultra-Fast</span>
                        <span>Added: +{stop.energy_added_kwh} kWh</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.is_unreachable && (
              <div className="p-3 bg-rose-950/70 border border-rose-600 rounded-lg text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
                <span>
                  Route exceeds vehicle range! No reachable charging stations were found along this corridor before 0% battery.
                </span>
              </div>
            )}

            {summary.reserve_breached && !summary.is_unreachable && (
              <div className="p-3 bg-rose-950/60 border border-rose-700/50 rounded-lg text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
                <span>
                  Reserve breached! Battery fell below 10% safety margin. Please recharge at nearest stop.
                </span>
              </div>
            )}

            {/* CrewAI Logistics Briefing */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3.5 space-y-1.5">
              <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <Wind className="h-3.5 w-3.5" /> Fleet AI Logistics Briefing
              </div>
              {briefingLoading ? (
                <div className="text-xs text-slate-400 animate-pulse">
                  Agent analyzing gradients and payload forces...
                </div>
              ) : (
                <p className="text-xs text-slate-300 leading-relaxed">{briefing}</p>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* RIGHT: Map & Dual-Axis Telemetry Curve */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
        <div className="flex-1 w-full relative">
          <MapComponent
            availableStations={chargers}
            chargingStops={summary?.charging_stops || []}
            coordinates={activeRouteCoords}
            originName={originName}
            destinationName={destinationName}
            originCoords={originCoords}
            destinationCoords={destCoords}
          />
        </div>

        {/* Elevation vs SoC Dual Area Chart */}
        {summary && summary.telemetry_profile.length > 0 && (
          <div className="h-56 bg-slate-900 border-t border-slate-800 p-3 flex flex-col">
            <div className="text-xs font-semibold text-slate-400 mb-1 flex justify-between">
              <span>Road Elevation (m) vs. Dynamic Battery State of Charge (%)</span>
              <span className="text-emerald-400 text-[11px]">Synchronized Gradient Profile</span>
            </div>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={summary.telemetry_profile}
                  margin={{ top: 10, right: 20, bottom: 5, left: -10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
                  <XAxis
                    dataKey="distance_km"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    unit=" km"
                  />
                  {/* Left Y Axis: Elevation */}
                  <YAxis
                    yAxisId="left"
                    stroke="#38bdf8"
                    tick={{ fontSize: 10 }}
                    unit="m"
                    domain={['auto', 'auto']}
                  />
                  {/* Right Y Axis: Battery SoC */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#34d399"
                    tick={{ fontSize: 10 }}
                    unit="%"
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="elevation_m"
                    name="Elevation (m)"
                    fill="#0284c7"
                    fillOpacity={0.25}
                    stroke="#38bdf8"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="soc_percent"
                    name="Battery SoC (%)"
                    stroke="#34d399"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
