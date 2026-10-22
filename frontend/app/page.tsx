'use client';

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import UnStrandedHero from "../components/UnStrandedHero";
import {
  fetchVehicles,
  evaluateRoutePhysics,
  fetchDriverBriefing,
  searchLocations,
  Vehicle,
  RouteSummary,
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
  ChevronUp,
  ChevronDown,
  Activity,
  Gauge,
  Compass,
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

function RoutePlanner() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('tata_nexon_ev');
  const [passengers, setPassengers] = useState<number>(2);
  const [tempC, setTempC] = useState<number>(34);
  const [initialSoc, setInitialSoc] = useState<number>(25);

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
  const [showChart, setShowChart] = useState<boolean>(false);
  const [showMetrics, setShowMetrics] = useState<boolean>(true);
  const [journeyRunId, setJourneyRunId] = useState<number>(0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [originSearchError, setOriginSearchError] = useState<string | null>(null);
  const [destSearchError, setDestSearchError] = useState<string | null>(null);

  const originTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const destTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchVehicles()
      .then((data) => {
        setVehicles(data);
        if (data.length > 0) setSelectedVehicle(data[1].id);
      })
      .catch((err) => console.error('Failed to load vehicles', err));
  }, []);

  // Debounced search for Origin
  const handleOriginChange = (text: string) => {
    setOriginSearch(text);
    if (originTimeoutRef.current) clearTimeout(originTimeoutRef.current);
    if (text.trim().length < 2) {
      setOriginSuggestions([]);
      setShowOriginDropdown(false);
      setOriginSearchError(null);
      return;
    }
    setOriginLoading(true);
    originTimeoutRef.current = setTimeout(async () => {
      try {
        setOriginSearchError(null);
        const results = await searchLocations(text);
        setOriginSuggestions(results);
        setShowOriginDropdown(true);
      } catch (err) {
        console.error('Origin search failed', err);
        setOriginSearchError('Location search unavailable. Please try again.');
        setShowOriginDropdown(true);
      } finally {
        setOriginLoading(false);
      }
    }, 350);
  };

  // Debounced search for Destination
  const handleDestChange = (text: string) => {
    setDestSearch(text);
    if (destTimeoutRef.current) clearTimeout(destTimeoutRef.current);
    if (text.trim().length < 2) {
      setDestSuggestions([]);
      setShowDestDropdown(false);
      setDestSearchError(null);
      return;
    }
    setDestLoading(true);
    destTimeoutRef.current = setTimeout(async () => {
      try {
        setDestSearchError(null);
        const results = await searchLocations(text);
        setDestSuggestions(results);
        setShowDestDropdown(true);
      } catch (err) {
        console.error('Destination search failed', err);
        setDestSearchError('Location search unavailable. Please try again.');
        setShowDestDropdown(true);
      } finally {
        setDestLoading(false);
      }
    }, 350);
  };

  const selectOrigin = (loc: GeocodeLocation) => {
    setOriginName(loc.name);
    setOriginSearch(loc.name);
    setOriginCoords([loc.lon, loc.lat]);
    setShowOriginDropdown(false);
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
  };

  const handleCalculate = async () => {
    setLoading(true);
    setRouteError(null);
    setSummary(null);
    setActiveRouteCoords(undefined);
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

      if (!result.route_coordinates || result.route_coordinates.length < 2) {
        throw new Error("The routing service did not return a road route.");
      }

      setSummary(result);
      setActiveRouteCoords(result.route_coordinates);
      setJourneyRunId((id) => id + 1);

      if (result.driver_briefing) {
        setBriefing(result.driver_briefing);
      } else {
        setBriefingLoading(true);
        fetchDriverBriefing({
          vehicle_model: selectedVehicle,
          passengers,
          ambient_temp_c: tempC,
          route_summary: result,
        })
          .then(setBriefing)
          .catch(() => setBriefing('Briefing is unavailable right now.'))
          .finally(() => setBriefingLoading(false));
      }
    } catch (err) {
      console.error(err);
      const detail = (err as any)?.response?.data?.detail;
      setRouteError(
        detail ??
          (err instanceof Error
            ? err.message
            : "Could not calculate the route. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <a className="skip-link" href="#route-content">
        Skip to route map and results
      </a>
      <div className="route-app">
        {/* LEFT: Controls & Analytics Sidebar */}
        <aside className="route-sidebar">
          <div className="route-brand">
            <h1 className="text-xl font-bold tracking-tight text-emerald-400 flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              EV Physics Route Planner
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-Time 3D Elevation & Dynamic Battery Telemetry
            </p>
          </div>

          {/* Location Search Box */}
          <div className="route-card route-route-card">
            <div className="route-section-title">
              <span className="flex items-center gap-1.5 text-sky-400">
                <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> Route Navigation
              </span>
              <button
                type="button"
                onClick={swapLocations}
                className="route-swap"
                title="Swap origin and destination"
                aria-label="Swap starting point and destination"
              >
                <ArrowUpDown className="h-3 w-3" aria-hidden="true" /> Swap
              </button>
            </div>

            {/* Origin Input */}
            <div className="relative">
              <label htmlFor="origin-search" className="field-label">
                Starting point
              </label>
              <div className="route-input">
                <MapPin className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <input
                  id="origin-search"
                  name="origin"
                  type="search"
                  autoComplete="off"
                  value={originSearch}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  onFocus={() => (originSuggestions.length > 0 || originSearchError !== null) && setShowOriginDropdown(true)}
                  aria-expanded={showOriginDropdown}
                  aria-controls="origin-suggestions"
                  placeholder="Search Origin (e.g., Manipal)"
                  className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                />
                {originLoading && (
                  <Loader2 className="h-3.5 w-3.5 text-emerald-400 animate-spin shrink-0" aria-label="Searching origin locations" />
                )}
              </div>

              {/* Origin Suggestions Dropdown */}
              {showOriginDropdown && (
                <div
                  id="origin-suggestions"
                  role="group"
                  aria-label="Starting point suggestions"
                  className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e3eae6] rounded-lg shadow-2xl max-h-48 overflow-y-auto"
                >
                  {originSuggestions.length > 0 ? (
                    originSuggestions.map((loc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectOrigin(loc)}
                        className="w-full text-left px-3 py-2 text-xs text-[#17241f] hover:bg-[#e8f5ef] border-b border-[#e3eae6] last:border-0 transition"
                      >
                        <div className="font-semibold text-[#087f5b]">{loc.name}</div>
                        <div className="text-[10px] text-[#718078] truncate">{loc.display_name}</div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-xs text-[#718078] text-center">
                      {originSearchError || 'No matching locations found'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Destination Input */}
            <div className="relative">
              <label htmlFor="dest-search" className="field-label">
                Destination
              </label>
              <div className="route-input">
                <MapPin className="h-4 w-4 text-blue-400 shrink-0" aria-hidden="true" />
                <input
                  id="dest-search"
                  name="destination"
                  type="search"
                  autoComplete="off"
                  value={destSearch}
                  onChange={(e) => handleDestChange(e.target.value)}
                  onFocus={() => (destSuggestions.length > 0 || destSearchError !== null) && setShowDestDropdown(true)}
                  aria-expanded={showDestDropdown}
                  aria-controls="dest-suggestions"
                  placeholder="Search Destination (e.g., Malpe Beach)"
                  className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                />
                {destLoading && (
                  <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" aria-label="Searching destinations" />
                )}
              </div>

              {/* Destination Suggestions Dropdown */}
              {showDestDropdown && (
                <div
                  id="dest-suggestions"
                  role="group"
                  aria-label="Destination suggestions"
                  className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e3eae6] rounded-lg shadow-2xl max-h-48 overflow-y-auto"
                >
                  {destSuggestions.length > 0 ? (
                    destSuggestions.map((loc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectDest(loc)}
                        className="w-full text-left px-3 py-2 text-xs text-[#17241f] hover:bg-blue-600/10 border-b border-[#e3eae6] last:border-0 transition"
                      >
                        <div className="font-semibold text-blue-600">{loc.name}</div>
                        <div className="text-[10px] text-[#718078] truncate">{loc.display_name}</div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-xs text-[#718078] text-center">
                      {destSearchError || 'No matching locations found'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Vehicle & Environmental Inputs */}
          <div className="route-card route-settings">
            <div>
              <label htmlFor="vehicle-model" className="field-label">
                Vehicle Model
              </label>
              <select
                id="vehicle-model"
                name="vehicle"
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="route-select"
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
                <label htmlFor="passengers-slider" className="flex items-center gap-1 font-medium">
                  <Users className="h-3 w-3" aria-hidden="true" /> Passengers
                </label>
                <output htmlFor="passengers-slider" className="font-semibold text-emerald-400">
                  {passengers}
                </output>
              </div>
              <input
                id="passengers-slider"
                name="passengers"
                type="range"
                min="1"
                max="5"
                value={passengers}
                onChange={(e) => setPassengers(Number(e.target.value))}
                className="route-range"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300">
                <label htmlFor="temp-slider" className="flex items-center gap-1 font-medium">
                  <Thermometer className="h-3 w-3" aria-hidden="true" /> Ambient Temperature
                </label>
                <output htmlFor="temp-slider" className="font-semibold text-emerald-400">
                  {tempC}°C
                </output>
              </div>
              <input
                id="temp-slider"
                name="ambient_temp"
                type="range"
                min="10"
                max="45"
                value={tempC}
                onChange={(e) => setTempC(Number(e.target.value))}
                className="route-range"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300">
                <label htmlFor="soc-slider" className="flex items-center gap-1 font-medium">
                  <BatteryCharging className="h-3 w-3" aria-hidden="true" /> Starting Battery SoC
                </label>
                <output htmlFor="soc-slider" className="font-semibold text-emerald-400">
                  {initialSoc}%
                </output>
              </div>
              <input
                id="soc-slider"
                name="initial_soc"
                type="range"
                min="10"
                max="100"
                value={initialSoc}
                onChange={(e) => setInitialSoc(Number(e.target.value))}
                className="route-range"
              />
            </div>

            <button
              type="button"
              onClick={handleCalculate}
              disabled={loading}
              className="route-primary-action"
            >
              {loading ? 'Evaluating Forces...' : 'Simulate Route Physics'}
            </button>

            <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {loading ? 'Calculating route.' : summary ? 'Route calculation complete.' : ''}
            </p>

            {routeError && (
              <p className="route-alert" role="alert">
                {routeError}
              </p>
            )}
          </div>

          {/* Route Simulation Results: Planned Stops, Warnings, and Briefing */}
          {summary && (
            <div className="route-results">
              {summary.charging_stops && summary.charging_stops.length > 0 && (
                <div className="route-card route-charging">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                      <BatteryCharging className="h-4 w-4" aria-hidden="true" /> Planned Charging Stops ({summary.charging_stops.length})
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/30">
                      +{summary.total_energy_charged_kwh} kWh Added
                    </span>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {summary.charging_stops.map((stop, idx) => (
                      <div key={idx} className="route-stop">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-slate-800 flex items-center gap-1 truncate max-w-[210px]">
                            ⚡ {stop.name}
                          </span>
                          <span className="text-slate-500 text-[10px] font-mono shrink-0">km {stop.arrival_distance_km}</span>
                        </div>
                        <div className="flex justify-between text-slate-600 text-[11px] mt-1">
                          <span>Recharge: <span className="text-rose-500 font-semibold">{stop.arrival_soc_percent}%</span> → <span className="text-emerald-600 font-semibold">{stop.target_soc_percent}%</span></span>
                          <span className="text-amber-600 font-semibold">~{stop.charging_time_minutes} mins</span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex justify-between pt-1 mt-1 border-t border-slate-100">
                          <span>Speed: {stop.power_kw} kW Ultra-Fast</span>
                          <span>Added: +{stop.energy_added_kwh} kWh</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary.is_unreachable && (
                <div className="route-alert">
                  <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" aria-hidden="true" />
                  <span>
                    Route exceeds vehicle range! No reachable charging stations were found along this corridor before 0% battery.
                  </span>
                </div>
              )}

              {summary.reserve_breached && !summary.is_unreachable && (
                <div className="route-alert">
                  <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" aria-hidden="true" />
                  <span>
                    Reserve breached! Battery fell below 10% safety margin. Please recharge at nearest stop.
                  </span>
                </div>
              )}

              {/* Fleet AI Logistics Briefing */}
              <div className="route-card route-briefing">
                <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                  <Wind className="h-3.5 w-3.5" aria-hidden="true" /> Fleet AI Logistics Briefing
                </div>
                {briefingLoading ? (
                  <div className="text-xs text-slate-400 animate-pulse mt-2">
                    Agent analyzing gradients and payload forces...
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed">{briefing}</p>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* RIGHT: Map, Horizontal Metrics Toolbar & On-Demand Elevation Chart */}
        <main id="route-content" className="route-workspace">
          <h2 className="sr-only">Interactive Map and Route Analysis</h2>
          
          <div className="map-stage">
            <MapComponent
              chargingStops={summary?.charging_stops || []}
              coordinates={activeRouteCoords}
              originName={originName}
              destinationName={destinationName}
              originCoords={originCoords}
              destinationCoords={destCoords}
              journeyRunId={journeyRunId}
            />
          </div>

          {/* On-Demand Metrics & Elevation Chart Section */}
          {summary && (
            <div className="map-ondemand-container">
              {/* Map On-Demand Action & Status Toolbar */}
              <div className="map-toolbar">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMetrics((prev) => !prev)}
                    className={`map-toolbar-btn ${showMetrics ? 'active' : ''}`}
                    title="Toggle route metrics toolbar"
                    aria-expanded={showMetrics}
                  >
                    <Gauge className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <span>Route Metrics</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-semibold">
                      {summary.total_distance_km} km
                    </span>
                    {showMetrics ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChart((prev) => !prev)}
                    className={`map-toolbar-btn ${showChart ? 'active' : ''}`}
                    title="Toggle elevation vs battery charge profile graph"
                    aria-expanded={showChart}
                  >
                    <Activity className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <span>Elevation vs Charge Profile</span>
                    {showChart ? (
                      <ChevronDown className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {/* Horizontal Metrics in Horizontal Orientation Below Map */}
              {showMetrics && (
                <div className="map-horizontal-metrics">
                  <div className="map-horizontal-metric">
                    <span className="metric-label">
                      <Navigation className="h-3 w-3 text-sky-500 shrink-0" aria-hidden="true" /> Distance
                    </span>
                    <span className="metric-value">{summary.total_distance_km} km</span>
                  </div>
                  <div className="map-horizontal-metric">
                    <span className="metric-label">
                      <Zap className="h-3 w-3 text-amber-500 shrink-0" aria-hidden="true" /> Net Energy
                    </span>
                    <span className="metric-value">{summary.net_energy_kwh} kWh</span>
                  </div>
                  <div className="map-horizontal-metric">
                    <span className="metric-label">
                      <BatteryCharging className="h-3 w-3 text-emerald-500 shrink-0" aria-hidden="true" /> Final SoC
                    </span>
                    <span className={`metric-value ${summary.reserve_breached ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {summary.final_soc_percent}%
                    </span>
                  </div>
                  <div className="map-horizontal-metric">
                    <span className="metric-label">
                      <Activity className="h-3 w-3 text-indigo-500 shrink-0" aria-hidden="true" /> Max Gradient
                    </span>
                    <span className="metric-value">{summary.max_gradient_percent}%</span>
                  </div>
                  <div className="map-horizontal-metric">
                    <span className="metric-label">
                      <Compass className="h-3 w-3 text-blue-500 shrink-0" aria-hidden="true" /> Climb / Descent
                    </span>
                    <span className="metric-value">+{summary.total_climb_m}m / -{summary.total_descent_m}m</span>
                  </div>
                  <div className="map-horizontal-metric">
                    <span className="metric-label">
                      <Zap className="h-3 w-3 text-teal-500 shrink-0" aria-hidden="true" /> Regenerated
                    </span>
                    <span className="metric-value">{summary.gross_regenerated_kwh} kWh</span>
                  </div>
                </div>
              )}

              {/* On-Demand Elevation vs SoC Dual Area Chart (Hidden by default, slides out and up on click) */}
              {showChart && summary.telemetry_profile && summary.telemetry_profile.length > 0 && (
                <div className="route-chart chart-drawer-enter">
                  <div className="route-chart-header">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <span className="font-semibold text-slate-700">Road Elevation (m) vs. Dynamic Battery State of Charge (%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 text-[11px] font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        Synchronized Gradient Profile
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowChart(false)}
                        className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition"
                        title="Collapse elevation graph"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={summary.telemetry_profile}
                        margin={{ top: 10, right: 20, bottom: 5, left: -10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                        <XAxis
                          dataKey="distance_km"
                          stroke="#64748b"
                          tick={{ fontSize: 10 }}
                          unit=" km"
                        />
                        {/* Left Y Axis: Elevation */}
                        <YAxis
                          yAxisId="left"
                          stroke="#0284c7"
                          tick={{ fontSize: 10 }}
                          unit="m"
                          domain={['auto', 'auto']}
                        />
                        {/* Right Y Axis: Battery SoC */}
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#059669"
                          tick={{ fontSize: 10 }}
                          unit="%"
                          domain={[0, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderColor: '#cbd5e1',
                            borderRadius: '8px',
                            fontSize: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="elevation_m"
                          name="Elevation (m)"
                          fill="#38bdf8"
                          fillOpacity={0.25}
                          stroke="#0284c7"
                          strokeWidth={2}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="soc_percent"
                          name="Battery SoC (%)"
                          stroke="#059669"
                          strokeWidth={2.5}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Accessible Non-Visual Tabular Alternative for the Chart */}
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-[11px] font-medium text-slate-500 hover:text-slate-800 py-1">
                      View tabular elevation & battery telemetry data ({summary.telemetry_profile.length} points)
                    </summary>
                    <div className="max-h-40 overflow-y-auto mt-2 border border-slate-200 rounded-md bg-white">
                      <table className="w-full text-left text-xs border-collapse">
                        <caption className="sr-only">
                          Route elevation and battery state of charge by distance along corridor
                        </caption>
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500 sticky top-0">
                            <th scope="col" className="p-1.5 font-semibold">Dist (km)</th>
                            <th scope="col" className="p-1.5 font-semibold">Elev (m)</th>
                            <th scope="col" className="p-1.5 font-semibold">SoC (%)</th>
                            <th scope="col" className="p-1.5 font-semibold">Gradient</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.telemetry_profile.map((pt, idx) => (
                            <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                              <td className="p-1.5 font-mono">{pt.distance_km.toFixed(1)}</td>
                              <td className="p-1.5 font-mono">{Math.round(pt.elevation_m)}m</td>
                              <td className="p-1.5 font-mono">{pt.soc_percent.toFixed(1)}%</td>
                              <td className="p-1.5 font-mono">{pt.gradient_percent.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default function HomePage() {
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return <UnStrandedHero onEnter={() => setEntered(true)} />;
  }

  return <RoutePlanner />;
}
