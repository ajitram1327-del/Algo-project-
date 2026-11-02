"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Mountain, Zap, ExternalLink, X, TrendingUp, TrendingDown, BatteryCharging } from "lucide-react";

interface TelemetryPoint {
  distance_km: number;
  elevation_m: number;
  soc_percent: number;
  is_regenerating?: boolean;
  grade_percent?: number;
  speed_kmh?: number;
}

interface ElevationRegenChartProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: TelemetryPoint[];
  summary: {
    total_distance_km?: number;
    climb_m?: number;
    descent_m?: number;
    gross_consumed_kwh?: number;
    regenerated_kwh?: number;
    net_energy_kwh?: number;
    final_soc_percent?: number;
    destination_reserve_soc_percent?: number;
    destination_reserve_met?: boolean;
    estimated_elevation_source?: string;
  };
  originCoords?: [number, number];
  destCoords?: [number, number];
  stops?: any[];
}

export default function ElevationRegenChart({
  isOpen,
  onClose,
  telemetry,
  summary,
  originCoords,
  destCoords,
  stops = [],
}: ElevationRegenChartProps) {
  if (!isOpen) return null;

  // External Navigation Hand-offs
  const handleOpenGoogleMaps = () => {
    if (!originCoords || !destCoords) return;
    const params = new URLSearchParams({
      api: "1",
      origin: `${originCoords[0]},${originCoords[1]}`,
      destination: `${destCoords[0]},${destCoords[1]}`,
      travelmode: "driving",
    });

    if (stops && stops.length > 0) {
      const waypoints = stops
        .filter((s) => s.lat && s.lon)
        .map((s) => `${s.lat},${s.lon}`)
        .join("|");
      if (waypoints) params.set("waypoints", waypoints);
    }

    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
  };

  const handleOpenAppleMaps = () => {
    if (!destCoords) return;
    const url = `https://maps.apple.com/?daddr=${destCoords[0]},${destCoords[1]}&dirflg=d`;
    window.open(url, "_blank");
  };

  const climb = summary.climb_m ?? 0;
  const descent = summary.descent_m ?? 0;
  const regenKwh = summary.regenerated_kwh ?? Math.max(0, (summary.gross_consumed_kwh || 0) - (summary.net_energy_kwh || 0));
  const elevationSource = summary.estimated_elevation_source || "Open-Elevation Profile";

  // Min and max elevations for YAxis domain
  const elevations = telemetry.map((t) => t.elevation_m || 0);
  const minElevation = elevations.length ? Math.floor(Math.min(...elevations) / 10) * 10 : 0;
  const maxElevation = elevations.length ? Math.ceil(Math.max(...elevations) / 10) * 10 + 20 : 100;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Mountain className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Elevation &amp; Energy Dynamics</h2>
              <span className="text-[10px] text-slate-400 font-medium">Source: {elevationSource}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-50/70 border-b border-slate-100 text-xs">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Climb / Descent</span>
            <div className="flex items-center space-x-2 font-bold text-slate-800">
              <span className="text-amber-600 flex items-center text-[11px]">
                <TrendingUp className="w-3 h-3 mr-0.5" /> +{Math.round(climb)}m
              </span>
              <span className="text-emerald-600 flex items-center text-[11px]">
                <TrendingDown className="w-3 h-3 mr-0.5" /> -{Math.round(descent)}m
              </span>
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Gross / Net Energy</span>
            <div className="font-bold text-slate-800 text-[11px]">
              {summary.gross_consumed_kwh?.toFixed(1) || 0} / {summary.net_energy_kwh?.toFixed(1) || 0} <span className="font-normal text-slate-400">kWh</span>
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-emerald-600 block mb-0.5">Net Regen Reclaimed</span>
            <div className="font-bold text-emerald-700 text-[11px] flex items-center space-x-1">
              <Zap className="w-3 h-3 text-emerald-500 fill-emerald-500" />
              <span>+{regenKwh.toFixed(2)} kWh</span>
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Destination Reserve</span>
            <div className="flex items-center space-x-1">
              <span className="font-mono font-bold text-slate-800 text-[11px]">
                {summary.final_soc_percent?.toFixed(0)}%
              </span>
              {summary.destination_reserve_met !== undefined && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    summary.destination_reserve_met
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {summary.destination_reserve_met ? "Met" : "Breached"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Chart View */}
        <div className="p-4 flex-1 min-h-[220px]">
          <div className="text-[11px] font-bold text-slate-600 mb-2 flex items-center justify-between">
            <span>Route Elevation Gradient (m vs km)</span>
            <span className="text-[10px] font-medium text-emerald-600 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>Green Shading = Kinetic Regen Zones</span>
            </span>
          </div>

          {telemetry && telemetry.length > 0 ? (
            <div className="w-full h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetry} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="distance_km"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    unit=" km"
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[minElevation, maxElevation]}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    unit="m"
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload as TelemetryPoint;
                      return (
                        <div className="bg-slate-900/95 text-white p-2.5 rounded-xl shadow-xl text-[11px] font-sans border border-slate-700 space-y-1">
                          <div className="font-bold text-slate-200">Distance: {d.distance_km.toFixed(1)} km</div>
                          <div className="text-sky-300">Elevation: {Math.round(d.elevation_m)} m</div>
                          <div className="text-emerald-400">Battery SoC: {Math.round(d.soc_percent)}%</div>
                          {d.grade_percent !== undefined && (
                            <div className="text-slate-400">Grade: {d.grade_percent.toFixed(1)}%</div>
                          )}
                          {d.is_regenerating && (
                            <div className="pt-0.5 text-emerald-400 font-bold flex items-center space-x-1">
                              <Zap className="w-3 h-3 fill-emerald-400" />
                              <span>Regenerative Braking Active</span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="elevation_m"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#elevationGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="w-full h-44 flex items-center justify-center text-slate-400 text-xs">
              No continuous elevation telemetry available for this route.
            </div>
          )}
        </div>

        {/* Footer Actions: External Navigation Hand-offs */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-[11px] text-slate-500 font-medium">
            Hand off route to onboard turn-by-turn navigation:
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleOpenGoogleMaps}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center space-x-1.5 shadow-xs transition cursor-pointer"
            >
              <span>Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              onClick={handleOpenAppleMaps}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl flex items-center space-x-1.5 shadow-xs transition cursor-pointer"
            >
              <span>Apple Maps</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
