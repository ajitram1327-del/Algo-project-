'use client';

import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { saveUserProfile } from '../lib/api';
import {
  X,
  Lock,
  Mail,
  Zap,
  Car,
  Calendar,
  Gauge,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
}

const VEHICLE_OPTIONS = [
  // 1. TATA MOTORS
  { id: 'tiago_ev_mr', name: 'Tata Tiago EV Medium Range (19.2 kWh)', capacity: 19.2 },
  { id: 'tiago_ev_lr', name: 'Tata Tiago EV Long Range (24.0 kWh)', capacity: 24.0 },
  { id: 'tigor_ev', name: 'Tata Tigor EV (26.0 kWh)', capacity: 26.0 },
  { id: 'punch_ev_mr', name: 'Tata Punch EV Medium Range (25.0 kWh)', capacity: 25.0 },
  { id: 'punch_ev_lr', name: 'Tata Punch EV Long Range (35.0 kWh)', capacity: 35.0 },
  { id: 'nexon_ev_mr', name: 'Tata Nexon EV Medium Range (30.2 kWh)', capacity: 30.2 },
  { id: 'nexon_ev_max', name: 'Tata Nexon EV Max (40.5 kWh)', capacity: 40.5 },
  { id: 'nexon_ev_lr', name: 'Tata Nexon EV Long Range (45.0 kWh)', capacity: 45.0 },
  { id: 'curvv_ev_45', name: 'Tata Curvv EV (45.0 kWh)', capacity: 45.0 },
  { id: 'curvv_ev_55', name: 'Tata Curvv EV (55.0 kWh)', capacity: 55.0 },
  { id: 'harrier_ev_65', name: 'Tata Harrier EV RWD (65.0 kWh)', capacity: 65.0 },
  { id: 'harrier_ev_75', name: 'Tata Harrier EV AWD (75.0 kWh)', capacity: 75.0 },

  // 2. MG MOTOR (JSW MG)
  { id: 'mg_comet_ev', name: 'MG Comet EV (17.3 kWh)', capacity: 17.3 },
  { id: 'mg_windsor_38', name: 'MG Windsor EV (38.0 kWh)', capacity: 38.0 },
  { id: 'mg_windsor_53', name: 'MG Windsor EV Pro (52.9 kWh)', capacity: 52.9 },
  { id: 'mg_zs_ev_50', name: 'MG ZS EV Exclusive (50.3 kWh)', capacity: 50.3 },

  // 3. MAHINDRA
  { id: 'xuv400_ec_pro', name: 'Mahindra XUV400 EC Pro (34.5 kWh)', capacity: 34.5 },
  { id: 'xuv400_el_pro', name: 'Mahindra XUV400 EL Pro (39.4 kWh)', capacity: 39.4 },
  { id: 'mahindra_be6e_59', name: 'Mahindra BE 6e (59.0 kWh)', capacity: 59.0 },
  { id: 'mahindra_be6e_79', name: 'Mahindra BE 6e (79.0 kWh)', capacity: 79.0 },
  { id: 'mahindra_xev9e_79', name: 'Mahindra XEV 9e (79.0 kWh)', capacity: 79.0 },

  // 4. HYUNDAI & KIA
  { id: 'hyundai_creta_ev', name: 'Hyundai Creta EV (42.0 kWh)', capacity: 42.0 },
  { id: 'hyundai_ioniq_5', name: 'Hyundai Ioniq 5 RWD (72.6 kWh)', capacity: 72.6 },
  { id: 'kia_ev6', name: 'Kia EV6 GT-Line AWD (77.4 kWh)', capacity: 77.4 },

  // 5. MARUTI SUZUKI & CITROËN
  { id: 'citroen_ec3', name: 'Citroën ëC3 (29.2 kWh)', capacity: 29.2 },
  { id: 'maruti_e_vitara_49', name: 'Maruti Suzuki e Vitara (49.0 kWh)', capacity: 49.0 },
  { id: 'maruti_e_vitara_61', name: 'Maruti Suzuki e Vitara (61.0 kWh)', capacity: 61.0 },

  // 6. BYD
  { id: 'byd_atto_3_dyn', name: 'BYD Atto 3 Dynamic (49.92 kWh)', capacity: 49.92 },
  { id: 'byd_atto_3_sup', name: 'BYD Atto 3 Superior (60.48 kWh)', capacity: 60.48 },
  { id: 'byd_emax_7', name: 'BYD eMAX 7 MPV (71.8 kWh)', capacity: 71.8 },
  { id: 'byd_seal_dyn', name: 'BYD Seal Dynamic RWD (61.44 kWh)', capacity: 61.44 },
  { id: 'byd_seal_prem', name: 'BYD Seal Premium/Perf AWD (82.56 kWh)', capacity: 82.56 },
];

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Signup vehicle configuration fields
  const [variantId, setVariantId] = useState('nexon_ev_lr');
  const [regYear, setRegYear] = useState(2023);
  const [odometer, setOdometer] = useState(15000);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : undefined,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      setErrorMsg(err.message || 'Google sign in failed. Please verify configuration.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        if (!data.user) throw new Error('Signup failed. Please try again.');

        // Initialize user vehicle profile in Grey-Box backend
        try {
          await saveUserProfile({
            user_id: data.user.id,
            variant_id: variantId,
            registration_year: Number(regYear),
            odometer_km: Number(odometer),
          });
        } catch (profileErr) {
          console.warn('Profile initialization note:', profileErr);
        }

        setSuccessMsg('Account created successfully!');
        setTimeout(() => {
          onAuthSuccess(data.user);
          onClose();
        }, 800);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        if (!data.user) throw new Error('Sign in failed.');

        setSuccessMsg('Welcome back!');
        setTimeout(() => {
          onAuthSuccess(data.user);
          onClose();
        }, 600);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setErrorMsg(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header decoration */}
        <div className="h-2 bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-400" />

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
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white flex items-center justify-center shadow-md shadow-sky-500/25">
              <Zap className="w-5 h-5 fill-white text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900 leading-tight">
                UnStranded <span className="text-sky-600">Auth</span>
              </h2>
              <p className="text-xs text-slate-500">Telemetry & Grey-Box Telematics Sync</p>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 my-4">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Message */}
          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Continue with Google Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 rounded-xl shadow-xs text-xs font-semibold text-slate-700 transition cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative my-3 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative bg-white px-2 text-[10px] uppercase font-semibold text-slate-400">
              or with email
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="driver@example.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Additional Vehicle Registration Fields during Sign Up */}
            {mode === 'signup' && (
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Car className="w-3.5 h-3.5 text-sky-600" />
                  <span>Calibrated Vehicle Profile</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">EV Model & Battery</label>
                  <select
                    value={variantId}
                    onChange={(e) => setVariantId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                  >
                    {VEHICLE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" /> Reg. Year
                    </label>
                    <input
                      type="number"
                      min={2018}
                      max={2026}
                      value={regYear}
                      onChange={(e) => setRegYear(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-slate-400" /> Odometer (km)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={400000}
                      step={500}
                      value={odometer}
                      onChange={(e) => setOdometer(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs shadow-md shadow-sky-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'signin' ? 'Sign In to Driver Account' : 'Register Vehicle & Start Telematics'}
            </button>
          </form>

          {/* Footer Info */}
          <p className="mt-4 text-center text-[11px] text-slate-400">
            Backed by Supabase Auth with Row Level Security (RLS).
          </p>
        </div>
      </div>
    </div>
  );
}
