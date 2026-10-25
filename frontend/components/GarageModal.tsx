"use client";

import React, { useState, useEffect } from "react";
import { X, Car, Calendar, Gauge, Check, Loader2 } from "lucide-react";
import { DEFAULT_VEHICLES } from "../lib/defaultVehicles";

interface GarageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: any;
  onProfileUpdated: (updated: any) => void;
  availableVariants?: any[];
}

export default function GarageModal({
  isOpen,
  onClose,
  currentProfile,
  onProfileUpdated,
  availableVariants = [],
}: GarageModalProps) {
  const [selectedVariant, setSelectedVariant] = useState("nexon_ev_lr");
  const [regYear, setRegYear] = useState(2024);
  const [odometer, setOdometer] = useState(14000);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentProfile) {
      if (currentProfile.variant_id) setSelectedVariant(currentProfile.variant_id);
      if (currentProfile.registration_year) setRegYear(currentProfile.registration_year);
      if (currentProfile.current_odometer_km) setOdometer(currentProfile.current_odometer_km);
    }
  }, [currentProfile]);

  if (!isOpen) return null;

  // Group vehicles by manufacturer for clean optgroup selection
  const vehicleList = availableVariants.length > 0 ? availableVariants : DEFAULT_VEHICLES;
  const brandGroups = (() => {
    const map = new Map<string, any[]>();
    vehicleList.forEach((v: any) => {
      const brand = v.brand || (v.name ? v.name.split(" ")[0] : "Other");
      if (!map.has(brand)) map.set(brand, []);
      map.get(brand)!.push(v);
    });
    return Array.from(map.entries());
  })();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);

    const payload = {
      user_id: currentProfile?.user_id || "user_ajit_1327",
      variant_id: selectedVariant,
      registration_year: Number(regYear),
      odometer_km: Number(odometer),
    };

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/user/profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        const updated = await res.json();
        onProfileUpdated(updated);
        setStatusMsg("Profile updated & calibrated!");
        setTimeout(() => {
          onClose();
        }, 600);
      } else {
        throw new Error("Failed to save profile");
      }
    } catch {
      // Offline fallback
      const fallbackProfile = {
        ...currentProfile,
        ...payload,
        calibrated_capacity_kwh: 43.5,
      };
      onProfileUpdated(fallbackProfile);
      setStatusMsg("Profile updated locally!");
      setTimeout(() => {
        onClose();
      }, 600);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
        <div className="h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500" />

        <div className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Car className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">EV Garage Switcher</h2>
                <p className="text-xs text-slate-500">Configure vehicle variant & degradation profile</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4 mt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Active Vehicle Model
              </label>
              <select
                value={selectedVariant}
                onChange={(e) => setSelectedVariant(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white cursor-pointer"
              >
                {brandGroups.map(([brand, list]) => (
                  <optgroup key={brand} label={brand}>
                    {list.map((v: any) => (
                      <option key={v.id || v.variant_id} value={v.id || v.variant_id}>
                        {v.display_name || v.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Reg. Year</span>
                </label>
                <input
                  type="number"
                  min={2018}
                  max={2026}
                  value={regYear}
                  onChange={(e) => setRegYear(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center space-x-1">
                  <Gauge className="w-3.5 h-3.5 text-slate-400" />
                  <span>Odometer (km)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={300000}
                  step={500}
                  value={odometer}
                  onChange={(e) => setOdometer(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>

            {statusMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-1.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Profile</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
