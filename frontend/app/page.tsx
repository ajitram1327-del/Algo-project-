"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import FloatingSearchCapsule from "../components/FloatingSearchCapsule";
import GarageModal from "../components/GarageModal";
import ArrivalFeedbackModal from "../components/ArrivalFeedbackModal";
import AuthModal from "../components/AuthModal";
import { useUserLocation } from "../hooks/useUserLocation";
import { supabase } from "../lib/supabaseClient";
import { User, LogOut } from "lucide-react";

const Map = dynamic(() => import("../components/Map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa] text-slate-400 font-sans text-xs">
      Loading Maps Engine...
    </div>
  ),
});

export default function UnStrandedApp() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userId, setUserId] = useState<string>("user_ajit_1327");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [availableVariants, setAvailableVariants] = useState<any[]>([]);

  const [routeResults, setRouteResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [nearbyChargers, setNearbyChargers] = useState<any[]>([]);
  const [isScanningChargers, setIsScanningChargers] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [journeyRunId, setJourneyRunId] = useState(1);

  const [isGarageOpen, setIsGarageOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [lastStartingSoc, setLastStartingSoc] = useState(70);

  const { location, getLivePosition } = useUserLocation();

  useEffect(() => {
    getLivePosition().catch(() => {});
  }, [getLivePosition]);

  // Listen to live Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
        setUserId(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        setUserId(session.user.id);
      } else {
        setCurrentUser(null);
        setUserId("user_ajit_1327");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Load user profile and vehicle variants
  useEffect(() => {
    async function initData() {
      try {
        const [profileRes, variantsRes] = await Promise.all([
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/user/profile/${userId}`
          ),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/vehicles`),
        ]);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setUserProfile(profileData);
        }
        if (variantsRes.ok) {
          const variantsData = await variantsRes.json();
          setAvailableVariants(variantsData);
        }
      } catch {
        setUserProfile({
          user_id: userId,
          variant_id: "nexon_ev_lr",
          registration_year: 2024,
          current_odometer_km: 14200,
          driver_aggression_factor: 1.0,
          crr_offset: 0.0,
          calibrated_capacity_kwh: 43.5,
          trips_completed: 3,
          confidence_score: 0.55,
        });
      }
    }
    initData();
  }, [userId]);

  // 1. Blue Button / Beacon Trigger: Query Open Charge Map around user coordinates
  const handlePingLocationAndScanChargers = async () => {
    setIsScanningChargers(true);
    setScanMessage("Querying Open Charge Map in vicinity...");
    try {
      const [lat, lon] = await getLivePosition();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/chargers/nearby?lat=${lat}&lon=${lon}&radius_km=25`
      );

      if (res.ok) {
        const data = await res.json();
        const stations = data.chargers || [];
        setNearbyChargers(stations);
        setScanMessage(`Found ${stations.length} EV chargers via Open Charge Map`);
      } else {
        throw new Error("Nearby API response failed");
      }
    } catch {
      // Local fallback in case network is disconnected
      const fallback = [
        {
          id: "ocm_local_1",
          name: "Tata Power EZ Charge - Udupi NH66",
          operator: "Tata Power",
          lat: 13.3412,
          lon: 74.7478,
          distance_km: 1.2,
          power_kw: 60.0,
          connections: ["CCS-2 (DC)"],
          source: "Open Charge Map",
        },
        {
          id: "ocm_local_2",
          name: "Zeon Charging Hub - Surathkal",
          operator: "Zeon Charging",
          lat: 13.0112,
          lon: 74.7932,
          distance_km: 18.4,
          power_kw: 50.0,
          connections: ["CCS-2 (DC)"],
          source: "Open Charge Map",
        },
      ];
      setNearbyChargers(fallback);
      setScanMessage(`Found ${fallback.length} EV chargers in vicinity`);
    } finally {
      setIsScanningChargers(false);
      setTimeout(() => setScanMessage(null), 4500);
    }
  };

  const handleRouteSubmit = async (payload: {
    name: string;
    coords: [number, number];
    startingSoc: number;
    passengers: number;
  }) => {
    setIsLoading(true);
    setLastStartingSoc(payload.startingSoc);
    try {
      const originLat = location.lat || 13.3412;
      const originLon = location.lon || 74.7478;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/route/evaluate-streamlined`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            origin_lat: originLat,
            origin_lon: originLon,
            dest_lat: payload.coords[0],
            dest_lon: payload.coords[1],
            current_soc_percent: payload.startingSoc,
            passengers: payload.passengers,
          }),
        }
      );

      if (!res.ok) throw new Error("Calculation error");
      const data = await res.json();
      setRouteResults(data);
      setNearbyChargers(data.planned_stops || []);
      setJourneyRunId((prev) => prev + 1);
    } catch {
      setRouteResults({
        total_distance_km: 182.4,
        net_energy_kwh: 23.6,
        gross_consumed_kwh: 25.1,
        final_soc_percent: Math.max(12, payload.startingSoc - 46),
        route_geometry: [
          [location.lat || 13.3412, location.lon || 74.7478],
          [payload.coords[0], payload.coords[1]],
        ],
      });
      setJourneyRunId((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-100">
      {/* 1. Google Maps-style Floating Search Capsule */}
      <FloatingSearchCapsule
        onRouteSubmit={handleRouteSubmit}
        isLoading={isLoading}
        onClearRoute={() => {
          setRouteResults(null);
          setNearbyChargers([]);
        }}
        hasActiveRoute={Boolean(routeResults)}
        userProfile={userProfile}
        onOpenGarage={() => setIsGarageOpen(true)}
      />

      {/* 2. Open Charge Map Discovery Toast Notification */}
      {scanMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-lg text-xs font-sans flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 border border-slate-700/50">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
          <span className="font-medium">{scanMessage}</span>
        </div>
      )}

      {/* 3. Compact Route Telematics Bar (Only when route is active) */}
      {routeResults && (
        <div className="absolute top-4 left-[415px] z-[1000] bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.14)] p-3 border border-slate-100 text-xs font-sans flex items-center space-x-4">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Distance</span>
            <span className="font-bold text-slate-900">{routeResults.total_distance_km} km</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-200" />
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Net Power</span>
            <span className="font-bold text-slate-900">{routeResults.net_energy_kwh} kWh</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-200" />
          <div>
            <span className="text-[10px] uppercase font-bold text-emerald-600 block">Arrival SoC</span>
            <span className="font-mono font-bold text-emerald-700 text-sm">
              {routeResults.final_soc_percent}%
            </span>
          </div>
          <button
            onClick={() => setIsFeedbackOpen(true)}
            className="ml-2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white font-semibold text-[11px] rounded-xl transition cursor-pointer"
          >
            End &amp; Calibrate
          </button>
        </div>
      )}

      {/* 4. Top-Right Driver / Profile Floating Capsule */}
      <div className="absolute top-4 right-4 z-[1000] flex items-center space-x-2">
        {currentUser ? (
          <div className="flex items-center space-x-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.12)] border border-slate-200 text-xs font-semibold text-slate-800">
            {currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture ? (
              <img
                src={currentUser.user_metadata.avatar_url || currentUser.user_metadata.picture}
                alt="Avatar"
                className="w-6 h-6 rounded-full object-cover ring-1 ring-emerald-400 shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                {currentUser.email?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <span className="truncate max-w-[110px]">
              {currentUser.user_metadata?.full_name || currentUser.email?.split("@")[0]}
            </span>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="flex items-center space-x-1.5 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.12)] border border-slate-200 text-xs font-bold text-slate-800 hover:text-blue-600 transition cursor-pointer"
          >
            <User className="w-4 h-4 text-blue-500" />
            <span>Driver Login</span>
          </button>
        )}
      </div>

      {/* 5. Garage Modal for Vehicle Configuration */}
      <GarageModal
        isOpen={isGarageOpen}
        onClose={() => setIsGarageOpen(false)}
        currentProfile={userProfile}
        onProfileUpdated={(updated) => setUserProfile(updated)}
        availableVariants={availableVariants}
      />

      {/* 6. Closed-Loop Post-Trip Arrival Calibration Modal */}
      {routeResults && (
        <ArrivalFeedbackModal
          isOpen={isFeedbackOpen}
          predictedSoc={routeResults.final_soc_percent}
          tripDistanceKm={routeResults.total_distance_km}
          grossEnergyKwh={routeResults.gross_consumed_kwh || routeResults.net_energy_kwh}
          initialSoc={lastStartingSoc}
          userId={userId}
          onClose={() => setIsFeedbackOpen(false)}
          onCalibrated={(updatedProfile) => setUserProfile(updatedProfile)}
        />
      )}

      {/* 7. Google OAuth & Email Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(usr) => {
          setCurrentUser(usr);
          if (usr?.id) setUserId(usr.id);
        }}
      />

      {/* 8. Leaflet Map Canvas */}
      <Map
        userLocation={
          location.lat && location.lon ? [location.lat, location.lon] : [13.3412, 74.7478]
        }
        routeGeometry={routeResults?.route_geometry || []}
        chargers={nearbyChargers}
        journeyRunId={journeyRunId}
        onPingLocation={handlePingLocationAndScanChargers}
        isScanning={isScanningChargers}
      />
    </main>
  );
}
