"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  fetchHealth,
  fetchVehicles,
  calculateRoute,
  Vehicle,
  RouteResponse,
  HealthResponse,
} from "@/lib/api";
import {
  BatteryCharging,
  Car,
  Compass,
  Cpu,
  Gauge,
  Info,
  MapPin,
  RefreshCw,
  Sliders,
  Thermometer,
  Users,
  Zap,
  AlertTriangle,
  Navigation,
} from "lucide-react";

// Client-only dynamic map component to prevent SSR window/leaflet errors
const RouteMap = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[460px] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-3">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-medium">Initializing Interactive Leaflet Engine...</span>
    </div>
  ),
});

export default function DashboardPage() {
  // App state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(30);
  const [passengers, setPassengers] = useState<number>(2);
  const [currentSoc, setCurrentSoc] = useState<number>(35);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);

  // Load initial health and vehicle list
  useEffect(() => {
    async function init() {
      try {
        const [healthData, vehicleData] = await Promise.allSettled([
          fetchHealth(),
          fetchVehicles(),
        ]);

        if (healthData.status === "fulfilled") {
          setHealth(healthData.value);
        }

        if (vehicleData.status === "fulfilled" && vehicleData.value.length > 0) {
          setVehicles(vehicleData.value);
          setSelectedVehicleId(vehicleData.value[0].id);

          // Perform initial route calculation for instant interactive preview
          try {
            const initialRoute = await calculateRoute({
              vehicle_id: vehicleData.value[0].id,
              temperature_c: 30,
              passengers: 2,
              current_soc: 35,
              origin_lat: 13.3409,
              origin_lng: 74.7858,
              dest_lat: 13.349,
              dest_lng: 74.7003,
            });
            setRouteResult(initialRoute);
          } catch (routeErr) {
            console.warn("Initial route calculation deferred:", routeErr);
          }
        }
      } catch (err: any) {
        console.error("Initialization error:", err);
        setError("Unable to reach backend service. Please ensure the FastAPI backend is running.");
      } finally {
        setIsInitialLoading(false);
      }
    }

    init();
  }, []);

  const handleCalculateRoute = async () => {
    if (!selectedVehicleId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await calculateRoute({
        vehicle_id: selectedVehicleId,
        temperature_c: temperature,
        passengers: passengers,
        current_soc: currentSoc,
        origin_lat: 13.3409,
        origin_lng: 74.7858,
        dest_lat: 13.349,
        dest_lng: 74.7003,
      });
      setRouteResult(response);
    } catch (err: any) {
      console.error("Route calculation error:", err);
      const msg =
        err.response?.data?.detail ||
        err.message ||
        "Failed to calculate route. Verify that the backend server is reachable on port 8000.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg tracking-tight text-white flex items-center gap-2">
                EV Route Optimizer
                <span className="hidden sm:inline-block text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                  Physics-Aware
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Manipal Plateau to Malpe Beach Coastal Route
              </p>
            </div>
          </div>

          {/* Backend & Integration Status Badge */}
          <div className="flex items-center gap-2 text-xs">
            {health ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  API Active
                </span>
                {health.chargetrip_configured ? (
                  <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Chargetrip Live
                  </span>
                ) : (
                  <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    Chargetrip Demo Fleet
                  </span>
                )}
                {health.openai_configured ? (
                  <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    CrewAI Live LLM
                  </span>
                ) : (
                  <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    CrewAI Fallback
                  </span>
                )}
              </div>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Backend Offline
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Dashboard Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full flex flex-col">
        {/* Error Notification Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-red-500/30 text-red-200 flex items-start justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm text-red-300">Service Communication Notice</h4>
                <p className="text-xs text-red-200/80 mt-0.5">{error}</p>
              </div>
            </div>
            <button
              onClick={handleCalculateRoute}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 border border-red-700 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Global Live vs Demo Data Source Indicator */}
        {routeResult && (
          <div
            className={`mb-6 p-3.5 rounded-xl border flex items-center justify-between flex-wrap gap-2 text-xs transition ${
              routeResult.is_fallback
                ? "bg-amber-950/30 border-amber-500/30 text-amber-200"
                : "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  routeResult.is_fallback ? "bg-amber-400 animate-ping" : "bg-emerald-400"
                }`}
              />
              <span className="font-semibold">
                {routeResult.is_fallback ? "Demonstration Routing Mode" : "Live Routing Mode"}
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-300">
                Data Source: <strong className="text-white">{routeResult.data_source}</strong>
              </span>
            </div>
            {routeResult.is_fallback && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono text-[11px]">
                Deterministic Academic Engine (Manipal to Malpe)
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
          {/* Left Column: Trip Configuration Controls (4 cols on desktop) */}
          <section className="lg:col-span-5 xl:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                Trip Parameters
              </h2>
              <span className="text-[11px] text-slate-500">Autonomous RCSP</span>
            </div>

            {/* Vehicle Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-blue-400" />
                  Electric Vehicle Fleet
                </span>
                {selectedVehicle?.is_demo && (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                    Demo Fleet
                  </span>
                )}
              </label>

              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                disabled={vehicles.length === 0}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} {v.version ? `(${v.version})` : ""}
                  </option>
                ))}
              </select>

              {/* Selected Vehicle Specs Badge */}
              {selectedVehicle && (
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Battery</span>
                    <span className="font-semibold text-slate-200">
                      {selectedVehicle.battery_usable_kwh} kWh
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Rated Range</span>
                    <span className="font-semibold text-slate-200">
                      {selectedVehicle.nominal_range_km} km
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Consumption</span>
                    <span className="font-semibold text-slate-200">
                      {selectedVehicle.consumption_kwh_per_100km} kWh/100
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Origin & Destination Fixed Summary */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Origin:
                </span>
                <span className="font-semibold text-slate-200">Manipal (Tiger Circle)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-blue-400" /> Destination:
                </span>
                <span className="font-semibold text-slate-200">Malpe Beach Sea Walk</span>
              </div>
            </div>

            {/* Ambient Temperature Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                  Ambient Temperature
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-mono">
                  {temperature}°C
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={45}
                step={1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>10°C (Heater)</span>
                <span>22°C (Optimal)</span>
                <span>45°C (High AC)</span>
              </div>
            </div>

            {/* Passenger Count Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  Passenger Count (Payload)
                </span>
                <span className="text-slate-400 font-mono">
                  {passengers} {passengers === 1 ? "occupant" : "occupants"}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setPassengers(count)}
                    className={`py-2 text-xs font-bold rounded-lg border transition ${
                      passengers === count
                        ? "bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-500/30"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Current State of Charge (SoC) Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <BatteryCharging
                    className={`w-3.5 h-3.5 ${
                      currentSoc < 20
                        ? "text-red-400"
                        : currentSoc < 40
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  />
                  Current Battery Charge (SoC)
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md font-mono ${
                    currentSoc < 20
                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : currentSoc < 40
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {currentSoc}%
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={currentSoc}
                onChange={(e) => setCurrentSoc(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span className="text-red-400 font-bold">&lt;15% Reserve Trigger</span>
                <span>50% Mid</span>
                <span>100% Full</span>
              </div>
            </div>

            {/* Calculate Route CTA Button */}
            <button
              onClick={handleCalculateRoute}
              disabled={isLoading || isInitialLoading || !selectedVehicleId}
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98] ${
                isLoading
                  ? "bg-blue-600/60 cursor-not-allowed text-blue-200"
                  : "bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25"
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Optimizing RCSP Route...
                </>
              ) : (
                <>
                  <Compass className="w-4 h-4" />
                  Calculate Physics-Aware Route
                </>
              )}
            </button>
          </section>

          {/* Right Column: Map, Telemetry Cards & AI Briefing (7-8 cols on desktop) */}
          <section className="lg:col-span-7 xl:col-span-8 space-y-6">
            {/* Interactive Leaflet Map Container */}
            <div className="h-[460px] w-full rounded-2xl overflow-hidden shadow-2xl relative border border-slate-800">
              <RouteMap
                coordinates={routeResult?.geometry?.coordinates || []}
                chargingStops={routeResult?.charging_stops || []}
                availableStations={routeResult?.available_charging_stations || []}
                originName={routeResult?.origin_name || "Manipal (Tiger Circle)"}
                destinationName={routeResult?.destination_name || "Malpe Beach Sea Walk"}
                originCoords={routeResult?.origin_coordinates}
                destinationCoords={routeResult?.destination_coordinates}
              />
            </div>

            {/* Telemetry Metrics Grid */}
            {routeResult && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-blue-400" /> Total Distance
                  </span>
                  <div className="text-xl font-extrabold text-white mt-1">
                    {routeResult.distance_km}{" "}
                    <span className="text-xs font-normal text-slate-400">km</span>
                  </div>
                  <span className="text-[10px] text-slate-500">~{routeResult.duration_min} mins transit</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" /> Net Energy
                  </span>
                  <div className="text-xl font-extrabold text-amber-300 mt-1">
                    {routeResult.physics_estimate.net_energy_kwh}{" "}
                    <span className="text-xs font-normal text-slate-400">kWh</span>
                  </div>
                  <span className="text-[10px] text-emerald-400">
                    Regen: {Math.abs(routeResult.physics_estimate.elevation_gain_loss_kwh)} kWh
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-emerald-400" /> Projected Final SoC
                  </span>
                  <div
                    className={`text-xl font-extrabold mt-1 ${
                      routeResult.physics_estimate.projected_final_soc < 15
                        ? "text-red-400"
                        : "text-emerald-300"
                    }`}
                  >
                    {routeResult.physics_estimate.projected_final_soc}%
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Initial: {routeResult.physics_estimate.projected_final_soc > currentSoc ? "charged" : `${currentSoc}%`}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <BatteryCharging className="w-3 h-3 text-indigo-400" /> Charging Stops
                  </span>
                  <div className="text-xl font-extrabold text-white mt-1">
                    {routeResult.charging_stops.length}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {routeResult.charging_stops.length === 0 ? "Direct trip" : "En-route recharge"}
                  </span>
                </div>
              </div>
            )}

            {/* Driver Route Briefing Card */}
            {routeResult?.driver_briefing && (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border border-blue-500/30 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/30">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">Driver Route Briefing</h3>
                      <span className="text-[11px] text-slate-400">
                        {routeResult.driver_briefing.agent_role}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                      routeResult.driver_briefing.is_fallback
                        ? "bg-slate-800 text-slate-400 border-slate-700"
                        : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                    }`}
                  >
                    {routeResult.driver_briefing.is_fallback
                      ? "Deterministic Briefing"
                      : "CrewAI Live Synthesis"}
                  </span>
                </div>

                <p className="text-sm text-slate-200 leading-relaxed font-sans">
                  {routeResult.driver_briefing.briefing}
                </p>
              </div>
            )}

            {/* Warnings Section if Battery Low */}
            {routeResult?.warnings && routeResult.warnings.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs space-y-1">
                {routeResult.warnings.map((warn, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recommended Charging Station Details */}
            {routeResult && routeResult.charging_stops.length > 0 && (
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h3 className="font-bold text-sm text-amber-400 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Recommended Charging Intervention
                </h3>
                {routeResult.charging_stops.map((stop) => (
                  <div
                    key={stop.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-100 text-sm">{stop.name}</div>
                      <div className="text-slate-400 mt-0.5">
                        {stop.power_kw} kW Ultra-Fast DC Charger
                        {stop.is_mock && " (Demo Location on Karavali Bypass)"}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-300">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Arrival SoC</span>
                        <span className="font-bold text-amber-400">{stop.arrival_soc}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Target SoC</span>
                        <span className="font-bold text-emerald-400">{stop.departure_soc}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Est. Time</span>
                        <span className="font-bold text-slate-100">~{stop.charge_time_min} mins</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Physics Engine Assumptions & Transparency Accordion */}
            {routeResult?.physics_estimate && (
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-400" />
                    Physics-Aware Model Assumptions
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Independent Academic Estimate
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-400">
                  {routeResult.physics_estimate.assumptions.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                  Methodology: {routeResult.physics_estimate.methodology}. Model applies aerodynamic drag,
                  rolling friction, ambient HVAC compressors, and gravitational regenerative recapture.
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        Academic Prototype: Intelligent EV Charger Recommendation Using Physics-Aware Route Optimization
      </footer>
    </div>
  );
}
