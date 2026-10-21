'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  fetchVehicles,
  evaluateRoutePhysics,
  fetchDriverBriefing,
  fetchOcmChargers,
  Vehicle,
  RouteSummary,
  OcmCharger,
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
import { Zap, AlertTriangle, BatteryCharging, Wind, Thermometer, Users } from 'lucide-react';

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

  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [briefing, setBriefing] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [briefingLoading, setBriefingLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchVehicles()
      .then((data) => {
        setVehicles(data);
        if (data.length > 0) setSelectedVehicle(data[1].id);
      })
      .catch((err) => console.error('Failed to load vehicles', err));

    fetchOcmChargers()
      .then((data) => setChargers(data))
      .catch((err) => console.error('Failed to load OCM chargers', err));
  }, []);

  const handleCalculate = async () => {
    setLoading(true);
    setBriefing('');
    try {
      const result = await evaluateRoutePhysics({
        vehicle_model: selectedVehicle,
        passengers,
        ambient_temp_c: tempC,
        initial_soc_percent: initialSoc,
      });
      setSummary(result);

      // Async fetch AI briefing decoupled from route generation
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* LEFT: Controls & Analytics Sidebar */}
      <aside className="w-[420px] h-full flex flex-col border-r border-slate-800 bg-slate-900/80 p-5 overflow-y-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-emerald-400 flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-400" />
            EV Physics Route Planner
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Dynamic Gradient & Battery Telemetry Engine
          </p>
        </div>

        {/* Inputs */}
        <div className="space-y-4 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
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
                <BatteryCharging className="h-3 w-3" /> Starting SoC
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
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm transition duration-150 disabled:opacity-50"
          >
            {loading ? 'Evaluating Forces...' : 'Simulate Route Physics'}
          </button>
        </div>

        {/* Telemetry KPI Cards */}
        {summary && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
                <div className="text-[11px] text-slate-400">Net Energy</div>
                <div className="text-lg font-bold text-white">
                  {summary.net_energy_kwh} <span className="text-xs font-normal">kWh</span>
                </div>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
                <div className="text-[11px] text-slate-400">Final SoC</div>
                <div
                  className={`text-lg font-bold ${
                    summary.reserve_breached ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {summary.final_soc_percent}%
                </div>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
                <div className="text-[11px] text-slate-400">Elevation Δ</div>
                <div className="text-sm font-semibold text-slate-200">
                  +{summary.total_climb_m}m / -{summary.total_descent_m}m
                </div>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
                <div className="text-[11px] text-slate-400">Max Gradient</div>
                <div className="text-sm font-semibold text-amber-300">
                  {summary.max_gradient_percent}%
                </div>
              </div>
            </div>

            {summary.reserve_breached && (
              <div className="p-3 bg-rose-950/60 border border-rose-700/50 rounded-lg text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
                <span>
                  Reserve breached! Battery fell below 10% safety margin. Charging required at Udupi.
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
          <MapComponent availableStations={chargers} />
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
                <ComposedChart data={summary.telemetry_profile}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis
                    dataKey="distance_km"
                    unit="km"
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#38bdf8"
                    unit="m"
                    tick={{ fontSize: 11 }}
                    domain={['auto', 'auto']}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#10b981"
                    unit="%"
                    tick={{ fontSize: 11 }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="elevation_m"
                    name="Elevation"
                    fill="#0284c7"
                    stroke="#38bdf8"
                    fillOpacity={0.2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="soc_percent"
                    name="Battery SoC"
                    stroke="#10b981"
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
