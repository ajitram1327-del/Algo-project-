'use client';

import React, { useState } from 'react';
import { UserVehicleProfile, closeTripAndCalibrate } from '../lib/api';
import {
  X,
  Gauge,
  Zap,
  Activity,
  ShieldCheck,
  TrendingUp,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
} from 'lucide-react';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserVehicleProfile | null;
  userEmail: string;
  onSignOut: () => void;
  onProfileUpdated: (updated: UserVehicleProfile) => void;
  lastRouteSummary?: any;
}

export default function CalibrationModal({
  isOpen,
  onClose,
  profile,
  userEmail,
  onSignOut,
  onProfileUpdated,
  lastRouteSummary,
}: CalibrationModalProps) {
  const [actualSoc, setActualSoc] = useState<number>(() => {
    return lastRouteSummary ? Math.round(lastRouteSummary.final_soc_percent) : 50;
  });
  const [loading, setLoading] = useState(false);
  const [calibratedSuccess, setCalibratedSuccess] = useState<string | null>(null);
  const [calibratedError, setCalibratedError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTripClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);
    setCalibratedSuccess(null);
    setCalibratedError(null);

    try {
      const predSoc = lastRouteSummary ? lastRouteSummary.final_soc_percent : 55.0;
      const dist = lastRouteSummary ? lastRouteSummary.total_distance_km : 30.0;
      const energy = lastRouteSummary ? lastRouteSummary.gross_consumed_kwh : 4.5;

      const updated = await closeTripAndCalibrate({
        trip_id: `trip_${Date.now()}`,
        user_id: profile.user_id,
        predicted_final_soc: Number(predSoc),
        actual_final_soc: Number(actualSoc),
        initial_soc: Number(predSoc + (energy / (profile.calibrated_capacity_kwh || 30)) * 100),
        distance_km: Number(dist),
        gross_predicted_energy_kwh: Number(energy),
        origin_name: 'Origin GPS',
        destination_name: 'Destination GPS',
      });

      onProfileUpdated(updated);
      setCalibratedSuccess(
        `Calibrated! Driver aggression adjusted to ${updated.driver_aggression_factor.toFixed(2)}x.`
      );
    } catch (err: any) {
      console.error('Calibration error:', err);
      setCalibratedError(err.message || 'Calibration sync failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header decoration */}
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          {/* User badge */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Grey-Box Active
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-1 truncate max-w-[240px]">
                {userEmail}
              </h2>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold p-1.5 rounded-lg hover:bg-rose-50 transition"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>

          {/* Telematics Metrics Grid */}
          {profile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-sky-500" /> Driver Aggression
                  </span>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {profile.driver_aggression_factor?.toFixed(2) || '1.00'}x
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {profile.driver_aggression_factor > 1.05
                      ? 'Aggressive / High Dynamic Drag'
                      : profile.driver_aggression_factor < 0.95
                      ? 'Eco-conscious Glide'
                      : 'Nominal Benchmark'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500" /> Usable Battery
                  </span>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {profile.calibrated_capacity_kwh?.toFixed(1) || '--'} kWh
                  </div>
                  <span className="text-[10px] text-slate-500">Degradation & SOH Compensated</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-blue-500" /> Odometer Reading
                  </span>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {Math.round(profile.current_odometer_km || 0).toLocaleString()} km
                  </div>
                  <span className="text-[10px] text-slate-500">Reg. Year: {profile.registration_year || 2023}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" /> Calibrated Trips
                  </span>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {profile.trips_completed || 0}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Confidence: {Math.round((profile.confidence_score || 0.35) * 100)}%
                  </span>
                </div>
              </div>

              {/* Trip Feedback & EMA Recalibration Section */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                  <Activity className="w-3.5 h-3.5 text-sky-600" />
                  <span>Grey-Box Trip Feedback &amp; Calibration</span>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  Log your real-world ending SoC after completing a drive. Our Exponential Moving Average (EMA) grey-box model will adapt your personal physics profile.
                </p>

                {calibratedSuccess && (
                  <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{calibratedSuccess}</span>
                  </div>
                )}

                {calibratedError && (
                  <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{calibratedError}</span>
                  </div>
                )}

                <form onSubmit={handleTripClosure} className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Actual Final SoC (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={actualSoc}
                      onChange={(e) => setActualSoc(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="self-end py-1.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
                    Calibrate
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
              Loading vehicle profile from Supabase...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
