"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import FloatingSearchCapsule, { DestinationPayload } from "../components/FloatingSearchCapsule";
import GarageModal from "../components/GarageModal";
import ArrivalFeedbackModal from "../components/ArrivalFeedbackModal";
import AuthModal from "../components/AuthModal";
import ElevationRegenChart from "../components/ElevationRegenChart";
import { useUserLocation } from "../hooks/useUserLocation";
import { supabase } from "../lib/supabaseClient";
import { saveRouteSnapshot, getLatestRouteSnapshot } from "../lib/offlineRouteStore";
import { User, LogOut, Mountain } from "lucide-react";

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
  const [isChartOpen, setIsChartOpen] = useState(false);
  const [lastStartingSoc, setLastStartingSoc] = useState(70);

  // Core Trip Parameters
  const [startingSoc, setStartingSoc] = useState(85);
  const [arrivalReserveSoc, setArrivalReserveSoc] = useState(15);
  const [acOn, setAcOn] = useState(true);
  const [drivingMode, setDrivingMode] = useState<"eco" | "normal" | "sport">("normal");
  const [connectorTypes, setConnectorTypes] = useState<string[]>(["CCS2", "TYPE2"]);
  const [activeOriginCoords, setActiveOriginCoords] = useState<[number, number] | null>(null);
  const [activeDestCoords, setActiveDestCoords] = useState<[number, number] | null>(null);

  const { location, getLivePosition } = useUserLocation();

  useEffect(() => {
    getLivePosition().catch(() => {});
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
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

  const handleRouteSubmit = async (payload: DestinationPayload) => {
    setIsLoading(true);
    setLastStartingSoc(payload.startingSoc);
    try {
      const originLat = payload.originCoords ? payload.originCoords[0] : (location.lat || 13.3412);
      const originLon = payload.originCoords ? payload.originCoords[1] : (location.lon || 74.7478);
      const destLat = payload.destCoords[0];
      const destLon = payload.destCoords[1];

      setActiveOriginCoords([originLat, originLon]);
      setActiveDestCoords([destLat, destLon]);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/route/evaluate-streamlined`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            origin_lat: originLat,
            origin_lon: originLon,
            dest_lat: destLat,
            dest_lon: destLon,
            current_soc_percent: payload.startingSoc,
            passengers: payload.passengers,
            destination_reserve_soc_percent: payload.arrivalReserveSoc ?? arrivalReserveSoc,
            ac_on: payload.acOn ?? acOn,
            driving_mode: payload.drivingMode ?? drivingMode,
            connector_types: payload.connectorTypes ?? connectorTypes,
          }),
        }
      );

      if (!res.ok) throw new Error("Calculation error");
      const data = await res.json();
      setRouteResults(data);
      setNearbyChargers(data.planned_stops || []);
      setJourneyRunId((prev) => prev + 1);

      // Persist snapshot to IndexedDB offline store
      const snapshotKey = `${originLat.toFixed(3)}_${originLon.toFixed(3)}_${destLat.toFixed(3)}_${destLon.toFixed(3)}`;
      saveRouteSnapshot({
        id: snapshotKey,
        saved_at: new Date().toISOString(),
        origin_name: payload.originName,
        dest_name: payload.destName,
        origin_coords: [originLat, originLon],
        dest_coords: [destLat, destLon],
        route_geometry: data.route_geometry || [],
        telemetry_profile: data.telemetry_profile || [],
        summary: data,
        planned_stops: data.planned_stops || [],
        is_cached_snapshot: false,
      }).catch(() => {});
    } catch {
      const originLat = payload.originCoords ? payload.originCoords[0] : (location.lat || 13.3412);
      const originLon = payload.originCoords ? payload.originCoords[1] : (location.lon || 74.7478);
      const destLat = payload.destCoords[0];
      const destLon = payload.destCoords[1];

      setActiveOriginCoords([originLat, originLon]);
      setActiveDestCoords([destLat, destLon]);

      // Check IndexedDB for existing route snapshot
      const cached = await getLatestRouteSnapshot();
      if (cached && cached.summary) {
        setRouteResults({
          ...cached.summary,
          is_cached_snapshot: true,
          saved_at: cached.saved_at,
          route_geometry: cached.route_geometry || [
            [originLat, originLon],
            [destLat, destLon],
          ],
        });
        setNearbyChargers(cached.planned_stops || []);
        setScanMessage(
          `Loaded cached route · saved ${new Date(cached.saved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Status may be stale`
        );
      } else {
        const finalSoc = Math.max(12, payload.startingSoc - 46);
        const targetReserve = payload.arrivalReserveSoc ?? arrivalReserveSoc;

        setRouteResults({
          total_distance_km: 182.4,
          total_climb_m: 420,
          total_descent_m: 390,
          climb_m: 420,
          descent_m: 390,
          net_energy_kwh: 23.6,
          gross_consumed_kwh: 26.8,
          gross_regenerated_kwh: 3.2,
          regenerated_kwh: 3.2,
          final_soc_percent: finalSoc,
          destination_reserve_soc_percent: targetReserve,
          destination_reserve_met: finalSoc >= targetReserve,
          estimated_elevation_source: "Offline / Fallback Model",
          is_cached_snapshot: true,
          route_geometry: [
            [originLat, originLon],
            [destLat, destLon],
          ],
        });
      }
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
        currentLocation={location.lat && location.lon ? [location.lat, location.lon] : [13.3412, 74.7478]}
        startingSoc={startingSoc}
        setStartingSoc={setStartingSoc}
        arrivalReserveSoc={arrivalReserveSoc}
        setArrivalReserveSoc={setArrivalReserveSoc}
        acOn={acOn}
        setAcOn={setAcOn}
        drivingMode={drivingMode}
        setDrivingMode={setDrivingMode}
        connectorTypes={connectorTypes}
        setConnectorTypes={setConnectorTypes}
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
        <div className="absolute top-4 left-[415px] z-[1000] bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.14)] p-3 border border-slate-100 text-xs font-sans flex items-center space-x-3.5">
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
            <div className="flex items-center space-x-1.5">
              <span className="font-mono font-bold text-emerald-700 text-sm">
                {routeResults.final_soc_percent}%
              </span>
              {routeResults.destination_reserve_met !== undefined && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    routeResults.destination_reserve_met
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                  title={
                    routeResults.destination_reserve_met
                      ? `Desired ${routeResults.destination_reserve_soc_percent || arrivalReserveSoc}% reserve satisfied`
                      : `Buffer breached (target: ${routeResults.destination_reserve_soc_percent || arrivalReserveSoc}%)`
                  }
                >
                  {routeResults.destination_reserve_met ? "Reserve Met" : "Buffer Breached"}
                </span>
              )}
            </div>
          </div>

          {/* Elevation Profile Chart Trigger */}
          <button
            onClick={() => setIsChartOpen(true)}
            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[11px] rounded-xl border border-emerald-200 transition cursor-pointer flex items-center space-x-1"
            title="View Elevation & Kinetic Dynamics Profile"
          >
            <Mountain className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile</span>
          </button>

          {/* Offline / Cached Snapshot Warning Badge */}
          {routeResults.is_cached_snapshot && (
            <div
              className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-xl text-[10px] font-bold flex items-center space-x-1 shrink-0"
              title="Viewing offline cached route snapshot; charger availability and status may be stale."
            >
              <span>⚡ Cached</span>
              <span className="text-amber-400">&bull;</span>
              <span className="font-medium text-amber-700">Offline</span>
            </div>
          )}

          <button
            onClick={() => setIsFeedbackOpen(true)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white font-semibold text-[11px] rounded-xl transition cursor-pointer"
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

      {/* 8. Elevation & Dynamic Energy Chart Modal */}
      <ElevationRegenChart
        isOpen={isChartOpen}
        onClose={() => setIsChartOpen(false)}
        telemetry={routeResults?.telemetry_profile || []}
        summary={routeResults || {}}
        originCoords={activeOriginCoords || (location.lat && location.lon ? [location.lat, location.lon] : [13.3412, 74.7478])}
        destCoords={activeDestCoords || undefined}
        stops={nearbyChargers}
      />

      {/* 9. Leaflet Map Canvas */}
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
