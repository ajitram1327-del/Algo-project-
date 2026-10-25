"use client";

import React, { useState } from "react";
import { X, CheckCircle2, Sliders, Activity, Loader2 } from "lucide-react";

interface ArrivalFeedbackModalProps {
  isOpen: boolean;
  predictedSoc: number;
  tripDistanceKm: number;
  grossEnergyKwh: number;
  initialSoc: number;
  userId: string;
  onClose: () => void;
  onCalibrated: (updatedProfile: any) => void;
}

export default function ArrivalFeedbackModal({
  isOpen,
  predictedSoc,
  tripDistanceKm,
  grossEnergyKwh,
  initialSoc,
  userId,
  onClose,
  onCalibrated,
}: ArrivalFeedbackModalProps) {
  const [actualSoc, setActualSoc] = useState<number>(() => Math.round(predictedSoc));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackSuccess(null);

    const payload = {
      trip_id: `trip_${Date.now()}`,
      user_id: userId,
      predicted_final_soc: Number(predictedSoc),
      actual_final_soc: Number(actualSoc),
      initial_soc: Number(initialSoc),
      distance_km: Number(tripDistanceKm),
      gross_predicted_energy_kwh: Number(grossEnergyKwh),
      origin_name: "Corridor Origin GPS",
      destination_name: "Corridor Destination GPS",
    };

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/trip/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        const updated = await res.json();
        onCalibrated(updated);
        setFeedbackSuccess(
          `Calibrated! Aggression factor tuned to ${Number(
            updated.driver_aggression_factor || 1.0
          ).toFixed(2)}x`
        );
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        throw new Error("API calibration failed");
      }
    } catch {
      // Local EMA calibration fallback
      const errorRatio = actualSoc / Math.max(1, predictedSoc);
      const newFactor = Math.min(1.4, Math.max(0.7, 1.0 + (1.0 - errorRatio) * 0.15));
      const fallbackCalibrated = {
        driver_aggression_factor: newFactor,
        trips_completed: 4,
        confidence_score: 0.65,
      };
      onCalibrated(fallbackCalibrated);
      setFeedbackSuccess(`Calibrated locally! Driver factor: ${newFactor.toFixed(2)}x`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } finally {
      setIsSubmitting(false);
    }
  };

  const delta = Math.round(actualSoc - predictedSoc);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />

        <div className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Trip Arrival Calibration</h2>
                <p className="text-xs text-slate-500">Closed-Loop Exponential Moving Average (EMA)</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Distance</span>
                <span className="font-bold text-slate-800 text-sm">{tripDistanceKm} km</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Predicted SoC</span>
                <span className="font-mono font-bold text-blue-600 text-sm">{predictedSoc}%</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs mb-1.5 font-medium">
                <span className="text-slate-700 font-semibold">Actual Battery Meter SoC at Arrival</span>
                <span className="font-mono font-bold text-emerald-600 text-base">{actualSoc}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={actualSoc}
                onChange={(e) => setActualSoc(Number(e.target.value))}
                className="w-full accent-emerald-600 h-2 bg-slate-100 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1">
                <span>0% Empty</span>
                <span
                  className={`font-semibold ${
                    delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-500" : "text-slate-500"
                  }`}
                >
                  {delta > 0 ? `+${delta}% (More efficient)` : delta < 0 ? `${delta}% (More drag)` : "Exact match"}
                </span>
                <span>100% Full</span>
              </div>
            </div>

            {feedbackSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{feedbackSuccess}</span>
              </div>
            )}

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-black rounded-xl shadow-md transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Calibrating...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5" />
                    <span>Submit & Calibrate</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
