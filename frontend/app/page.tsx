'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import UnStrandedHero from "../components/UnStrandedHero";
import FloatingSearchBar from "../components/FloatingSearchBar";
import AuthModal from "../components/AuthModal";
import CalibrationModal from "../components/CalibrationModal";
import { supabase } from "../lib/supabaseClient";
import { useUserLocation } from "../hooks/useUserLocation";
import {
  fetchVehicles,
  evaluateRoutePhysics,
  fetchDriverBriefing,
  searchLocations,
  fetchUserProfile,
  UserVehicleProfile,
  evaluateStreamlinedRoute,
  Vehicle,
  RouteSummary,
  GeocodeLocation,
} from '../lib/api';
import { DEFAULT_VEHICLES } from '../lib/defaultVehicles';
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
  X,
  SlidersHorizontal,
  Sliders,
  User,
  Info,
} from 'lucide-react';

// Dynamic Leaflet Map Import (no SSR) with fallback placeholder
const MapComponent = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa] text-slate-400 font-sans text-sm">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
        Loading Maps...
      </div>
    </div>
  ),
});

interface EmergencyCandidate {
  station_id: string;
  name: string;
  distance_km: number;
  arrival_soc_percent: number;
  is_reachable: boolean;
  recommended_eco_speed_kmh: number;
  power_kw: number;
  coordinates: [number, number];
}

function GoogleMapsEVLayout({ onReturnToHero }: { onReturnToHero?: () => void }) {
  const { location, getLivePosition } = useUserLocation();
  const [emergencyStations, setEmergencyStations] = useState<EmergencyCandidate[]>([]);
  const [isEmergencyScanning, setIsEmergencyScanning] = useState(false);
  const [userLocationCoords, setUserLocationCoords] = useState<[number, number] | null>(null);

  // UI Drawer State
  const [isDirectionsOpen, setIsDirectionsOpen] = useState<boolean>(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  // Map View State
  const [mapCenter, setMapCenter] = useState<[number, number]>([13.3412, 74.7478]); // Udupi / Manipal coordinates
  const [mapZoom, setMapZoom] = useState<number>(13);

  // Vehicle & Route Parameters
  const [vehicles, setVehicles] = useState<Vehicle[]>(DEFAULT_VEHICLES);
  const [selectedBrand, setSelectedBrand] = useState<string>('Tata Motors');
  const [selectedCarModel, setSelectedCarModel] = useState<string>('Tata Nexon EV');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('nexon_ev_lr');
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
  const [journeyRunId, setJourneyRunId] = useState<number>(0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [originSearchError, setOriginSearchError] = useState<string | null>(null);
  const [destSearchError, setDestSearchError] = useState<string | null>(null);

  const originTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const destTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // User Authentication & Grey-Box Profile State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserVehicleProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCalibrationModalOpen, setIsCalibrationModalOpen] = useState(false);

  // Initialize and listen to Supabase Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
        fetchUserProfile(session.user.id)
          .then((p) => {
            if (p) setUserProfile(p);
          })
          .catch((err) => console.warn('Could not retrieve vehicle profile:', err));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        try {
          const p = await fetchUserProfile(session.user.id);
          if (p) setUserProfile(p);
        } catch (e) {
          console.warn('Profile fetch after auth event failed:', e);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUserProfile(null);
    setIsCalibrationModalOpen(false);
  };

  useEffect(() => {
    fetchVehicles()
      .then((data) => {
        if (data && data.length > 0) {
          setVehicles(data);
        }
      })
      .catch((err) => console.warn('Using built-in vehicle database:', err));
  }, []);

  // Distinct brands list (parent tier 1)
  const uniqueBrands = useMemo<string[]>(() => {
    const set = new Set<string>();
    vehicles.forEach((v) => {
      const b = (v.brand || 'Other').trim();
      if (b) set.add(b);
    });
    return Array.from(set);
  }, [vehicles]);

  // Models filtered strictly for selected brand (child tier 2)
  const brandModels = useMemo<string[]>(() => {
    const set = new Set<string>();
    vehicles
      .filter((v) => (v.brand || 'Other').toLowerCase() === selectedBrand.toLowerCase())
      .forEach((v) => {
        const model = (v.model_name || v.name.split(' (')[0] || '').trim();
        if (model) set.add(model);
      });
    return Array.from(set);
  }, [vehicles, selectedBrand]);

  // Trims available for currently selected car model (child tier 3)
  const availableTrims = useMemo<Vehicle[]>(() => {
    const list = vehicles.filter((v) => {
      const model = (v.model_name || v.name.split(' (')[0] || '').trim();
      return model.toLowerCase() === selectedCarModel.trim().toLowerCase();
    });
    // Deduplicate any trims with the exact same display name and capacity
    const seen = new Set<string>();
    const deduped: Vehicle[] = [];
    for (const item of list) {
      const key = `${(item.name || item.display_name || '').toLowerCase()}_${item.battery_capacity_kwh ?? item.battery_kwh}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }
    return deduped;
  }, [vehicles, selectedCarModel]);

  const handleBrandChange = (brandName: string) => {
    setSelectedBrand(brandName);
    const matchingVehicles = vehicles.filter(
      (v) => (v.brand || 'Other').toLowerCase() === brandName.toLowerCase()
    );
    if (matchingVehicles.length > 0) {
      const firstCar = matchingVehicles[0];
      const model = (firstCar.model_name || firstCar.name.split(' (')[0] || '').trim();
      setSelectedCarModel(model);

      const modelTrims = matchingVehicles.filter(
        (v) => (v.model_name || v.name.split(' (')[0] || '').trim().toLowerCase() === model.toLowerCase()
      );
      const preferred =
        modelTrims.find((t) => (t.trim_name || t.name).toLowerCase().includes('long range')) ||
        modelTrims[0] ||
        firstCar;
      setSelectedVehicle(preferred.id);
    }
  };

  const handleCarModelChange = (modelName: string) => {
    setSelectedCarModel(modelName);
    const matching = vehicles.filter((v) => {
      const model = (v.model_name || v.name.split(' (')[0] || '').trim();
      return model.toLowerCase() === modelName.trim().toLowerCase();
    });
    if (matching.length > 0) {
      const b = matching[0].brand;
      if (b && b !== selectedBrand) setSelectedBrand(b);

      const preferred =
        matching.find((t) => (t.trim_name || t.name).toLowerCase().includes('long range')) ||
        matching[0];
      setSelectedVehicle(preferred.id);
    }
  };

  const handleTrimChange = (variantId: string) => {
    setSelectedVehicle(variantId);
    const found = vehicles.find((v) => v.id === variantId);
    if (found) {
      const model = (found.model_name || found.name.split(' (')[0] || '').trim();
      if (model && model.toLowerCase() !== selectedCarModel.trim().toLowerCase()) {
        setSelectedCarModel(model);
      }
      if (found.brand && found.brand !== selectedBrand) {
        setSelectedBrand(found.brand);
      }
    }
  };

  // Synchronize vehicle selection when authenticated profile is available
  useEffect(() => {
    if (userProfile?.variant_id) {
      const match = vehicles.find((v) => v.id === userProfile.variant_id);
      if (match) {
        setSelectedVehicle(match.id);
        const m = (match.model_name || match.name.split(' (')[0] || '').trim();
        if (m) setSelectedCarModel(m);
        if (match.brand) setSelectedBrand(match.brand);
      }
    }
  }, [userProfile, vehicles]);

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
        setOriginSearchError('Location search failed. Check backend connection.');
      } finally {
        setOriginLoading(false);
      }
    }, 400);
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
        setDestSearchError('Location search failed. Check backend connection.');
      } finally {
        setDestLoading(false);
      }
    }, 400);
  };

  const selectOrigin = (loc: GeocodeLocation) => {
    setOriginName(loc.display_name.split(',')[0]);
    setOriginSearch(loc.display_name.split(',')[0]);
    setOriginCoords([loc.lon, loc.lat]);
    setShowOriginDropdown(false);
    setMapCenter([loc.lat, loc.lon]);
  };

  const selectDest = (loc: GeocodeLocation) => {
    setDestinationName(loc.display_name.split(',')[0]);
    setDestSearch(loc.display_name.split(',')[0]);
    setDestCoords([loc.lon, loc.lat]);
    setShowDestDropdown(false);
    setMapCenter([loc.lat, loc.lon]);
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
      let result: RouteSummary;
      if (currentUser && userProfile) {
        result = await evaluateStreamlinedRoute({
          user_id: currentUser.id,
          origin_lat: originCoords[1],
          origin_lon: originCoords[0],
          dest_lat: destCoords[1],
          dest_lon: destCoords[0],
          current_soc_percent: initialSoc,
          passengers,
          variant_id: selectedVehicle,
          vehicle_model: selectedVehicle,
          ambient_temp_c: tempC,
        });
      } else {
        result = await evaluateRoutePhysics({
          vehicle_model: selectedVehicle,
          passengers,
          ambient_temp_c: tempC,
          initial_soc_percent: initialSoc,
          origin_lat: originCoords[1],
          origin_lon: originCoords[0],
          dest_lat: destCoords[1],
          dest_lon: destCoords[0],
        });
      }

      const coordinates = result.route_coordinates || (result as any).route_geometry;
      if (!coordinates || coordinates.length < 2) {
        throw new Error("The routing service did not return a road route.");
      }

      setSummary(result);
      setActiveRouteCoords(coordinates);
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

  const handleEmergencySOS = async () => {
    setIsEmergencyScanning(true);
    try {
      const [lat, lon] = await getLivePosition();
      setUserLocationCoords([lat, lon]);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/route/emergency-divert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_lat: lat,
            current_lon: lon,
            current_soc_percent: initialSoc,
            vehicle_model: selectedVehicle,
            passengers,
            ambient_temp_c: tempC,
          }),
        }
      );

      if (res.ok) {
        const data: EmergencyCandidate[] = await res.json();
        setEmergencyStations(data);
      } else {
        throw new Error("Emergency divert endpoint returned an error");
      }
    } catch (err) {
      console.warn("Using offline SOS demo preset", err);
      setUserLocationCoords([13.3409, 74.7858]);
      setEmergencyStations([
        {
          station_id: "chg_sos_1",
          name: "Tata Power Fast Charger - NH66",
          distance_km: 7.8,
          arrival_soc_percent: Math.max(1.8, Number((initialSoc - 3.2).toFixed(1))),
          is_reachable: true,
          recommended_eco_speed_kmh: 60.0,
          power_kw: 60.0,
          coordinates: [13.3412, 74.7478],
        },
        {
          station_id: "chg_sos_2",
          name: "Zeon Charging Hub - Surathkal",
          distance_km: 28.4,
          arrival_soc_percent: 0.0,
          is_reachable: false,
          recommended_eco_speed_kmh: 40.0,
          power_kw: 50.0,
          coordinates: [13.0112, 74.7932],
        },
      ]);
    } finally {
      setIsEmergencyScanning(false);
    }
  };

  const handleRecenter = () => {
    if (userLocationCoords) {
      setMapCenter(userLocationCoords);
      setMapZoom(14);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMapCenter([pos.coords.latitude, pos.coords.longitude]);
          setMapZoom(14);
        },
        (err) => {
          console.warn("Recenter fallback to origin", err);
          if (originCoords) {
            setMapCenter([originCoords[1], originCoords[0]]);
            setMapZoom(13);
          }
        }
      );
    } else if (originCoords) {
      setMapCenter([originCoords[1], originCoords[0]]);
      setMapZoom(13);
    }
  };

  const handleGlobalSearch = (query: string) => {
    if (!query) return;
    setIsDirectionsOpen(true);
    setDestSearch(query);
    handleDestChange(query);
  };

  const selectedVehicleObj = vehicles.find((v) => v.id === selectedVehicle);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#e5e3df] font-sans">
      {/* Floating Google Maps-style Search Capsule (Visible when directions drawer is closed) */}
      {!isDirectionsOpen && (
        <FloatingSearchBar
          onSearch={handleGlobalSearch}
          onDirectionsClick={() => setIsDirectionsOpen(true)}
          onMenuClick={() => setIsDirectionsOpen(true)}
          placeholder="Search destination or EV charger..."
          isDirectionsOpen={isDirectionsOpen}
        />
      )}

      {/* Floating Directions Panel (Google Maps Style Drawer) */}
      {isDirectionsOpen && (
        <div className="absolute top-3 left-3 z-[1010] w-[410px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] flex flex-col bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.22)] overflow-hidden border border-slate-200/90 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
            <div
              className="flex items-center gap-2.5 cursor-pointer group select-none"
              onClick={onReturnToHero}
              title="Return to UnStranded Home Screen"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white flex items-center justify-center shadow-md shadow-sky-500/25 group-hover:scale-105 transition">
                <Zap className="w-4 h-4 fill-white text-white" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-slate-900 leading-tight flex items-center gap-1.5">
                  UnStranded
                  <span className="text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">EV</span>
                </h1>
                <p className="text-[11px] text-slate-500">Autonomous Range &amp; Charger Dispatch</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => setIsCalibrationModalOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 transition text-xs font-semibold"
                  title="View Driver Profile & Grey-Box Telematics"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="max-w-[75px] truncate">{currentUser.email?.split('@')[0]}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white transition text-xs font-bold shadow-xs"
                  title="Sign In / Register Vehicle"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowAdvancedSettings((prev) => !prev)}
                className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition ${
                  showAdvancedSettings ? 'bg-slate-100 text-blue-600 font-semibold' : ''
                }`}
                title="Vehicle & Simulation Settings"
                aria-label="Settings"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsDirectionsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                title="Collapse into Search Bar"
                aria-label="Close directions panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 scrollbar-thin">
            {/* Origin & Destination Inputs with Swap */}
            <div className="relative bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 space-y-2">
              {/* Origin Row */}
              <div className="relative flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 bg-emerald-100 shrink-0" />
                <input
                  type="text"
                  value={originSearch}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  onFocus={() => originSuggestions.length > 0 && setShowOriginDropdown(true)}
                  placeholder="Choose starting point..."
                  className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
                {originLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />}

                {/* Origin Autocomplete Dropdown */}
                {showOriginDropdown && originSuggestions.length > 0 && (
                  <div className="absolute top-10 left-6 right-0 z-50 bg-white rounded-lg shadow-xl border border-slate-200 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {originSuggestions.map((loc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectOrigin(loc)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50/70 text-slate-700 flex flex-col"
                      >
                        <span className="font-semibold text-slate-900">{loc.display_name.split(',')[0]}</span>
                        <span className="text-[10px] text-slate-500 truncate">{loc.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Destination Row */}
              <div className="relative flex items-center gap-2.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <input
                  type="text"
                  value={destSearch}
                  onChange={(e) => handleDestChange(e.target.value)}
                  onFocus={() => destSuggestions.length > 0 && setShowDestDropdown(true)}
                  placeholder="Choose destination..."
                  className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
                {destLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />}

                {/* Destination Autocomplete Dropdown */}
                {showDestDropdown && destSuggestions.length > 0 && (
                  <div className="absolute top-10 left-6 right-0 z-50 bg-white rounded-lg shadow-xl border border-slate-200 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {destSuggestions.map((loc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectDest(loc)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50/70 text-slate-700 flex flex-col"
                      >
                        <span className="font-semibold text-slate-900">{loc.display_name.split(',')[0]}</span>
                        <span className="text-[10px] text-slate-500 truncate">{loc.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Swap Origin / Destination button */}
              <button
                type="button"
                onClick={swapLocations}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-xs hover:bg-slate-100 flex items-center justify-center text-slate-500 transition"
                title="Swap origin and destination"
                aria-label="Swap locations"
              >
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </div>

            {/* Error notifications */}
            {(originSearchError || destSearchError || routeError) && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{originSearchError || destSearchError || routeError}</span>
              </div>
            )}

            {/* Vehicle & Battery Controls: Parent-Child Brand -> Model -> Trim Matrix */}
            <div className="space-y-2.5 bg-slate-50/60 p-3 rounded-xl border border-slate-200/70 text-xs">
              {/* Step 1: EV Brand / Manufacturer */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 uppercase tracking-wide flex items-center justify-between">
                  <span>EV Brand / Make</span>
                  <span className="text-[10px] text-slate-400 font-normal">Brand Matrix</span>
                </label>
                <select
                  value={selectedBrand}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
                >
                  {uniqueBrands.map((brand: string) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Car Model (Filtered by Brand) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 uppercase tracking-wide flex items-center justify-between">
                  <span>Car Model</span>
                  <span className="text-[10px] text-blue-600 font-medium">
                    {brandModels.length} {brandModels.length === 1 ? 'model' : 'models'}
                  </span>
                </label>
                <select
                  value={selectedCarModel}
                  onChange={(e) => handleCarModelChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
                >
                  {brandModels.map((model: string) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 3: Trim / Battery Variant Dropdown */}
              {availableTrims.length > 0 && (
                <div className="animate-in fade-in duration-150">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 uppercase tracking-wide flex items-center justify-between">
                    <span>Trim / Battery Variant</span>
                    <span className="text-[10px] text-blue-600 font-semibold">
                      {availableTrims.length} {availableTrims.length === 1 ? 'option' : 'options'}
                    </span>
                  </label>
                  <select
                    value={selectedVehicle}
                    onChange={(e) => handleTrimChange(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
                  >
                    {availableTrims.map((t: Vehicle) => {
                      const trimLabel =
                        t.trim_name ||
                        t.name.replace(selectedCarModel, '').trim().replace(/^[-–—]\s*/, '') ||
                        'Standard';
                      const hasKwh = trimLabel.toLowerCase().includes('kwh');
                      const kwh = t.battery_capacity_kwh ?? t.battery_kwh;
                      return (
                        <option key={t.id} value={t.id}>
                          {hasKwh ? trimLabel : `${trimLabel} (${kwh} kWh)`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Initial Battery SoC Slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                    Starting Battery SoC
                  </span>
                  <span
                    className={`font-mono font-bold text-xs ${
                      initialSoc <= 20
                        ? 'text-rose-600'
                        : initialSoc <= 40
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {initialSoc}%
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={initialSoc}
                  onChange={(e) => setInitialSoc(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Advanced Environmental Inputs (Toggled) */}
              {showAdvancedSettings && (
                <div className="pt-2 border-t border-slate-200/80 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <label className="block font-medium text-slate-600 mb-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400" /> Passengers
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={passengers}
                      onChange={(e) => setPassengers(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-600 mb-0.5 flex items-center gap-1">
                      <Thermometer className="w-3 h-3 text-slate-400" /> Temp (°C)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={tempC}
                      onChange={(e) => setTempC(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons: Calculate Route & Emergency SOS */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCalculate}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-3 rounded-xl shadow-sm flex items-center justify-center gap-2 text-xs transition cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Calculating Physics...</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-4 h-4" />
                    <span>Calculate Route</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleEmergencySOS}
                disabled={isEmergencyScanning}
                className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold py-2.5 px-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5 text-xs transition cursor-pointer disabled:opacity-50"
                title="Scan Reachable Chargers with Dynamic SoC Physics"
              >
                {isEmergencyScanning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>SOS Divert</span>
                  </>
                )}
              </button>
            </div>

            {/* Emergency SOS Candidates Display */}
            {emergencyStations.length > 0 && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-900 flex items-center gap-1">
                    🚨 Emergency Divert Stations
                  </span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
                    {emergencyStations.filter((s) => s.is_reachable).length} Reachable
                  </span>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {emergencyStations.map((st) => (
                    <div
                      key={st.station_id}
                      className="bg-white p-2 rounded-lg border border-amber-100 shadow-2xs text-[11px] space-y-0.5"
                    >
                      <div className="flex justify-between items-center font-semibold">
                        <span className="text-slate-800 truncate">{st.name}</span>
                        <span className="font-mono text-slate-500 shrink-0">{st.distance_km} km</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Power: {st.power_kw} kW</span>
                        <span
                          className={`font-semibold ${
                            st.is_reachable ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          Arr. SoC: {st.arrival_soc_percent}%
                        </span>
                      </div>
                      {st.is_reachable && st.recommended_eco_speed_kmh < 60 && (
                        <div className="text-[10px] text-amber-700 font-medium">
                          Eco cap: {st.recommended_eco_speed_kmh} km/h
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Route Physics Summary Results */}
            {summary && (
              <div className="space-y-3 pt-1 border-t border-slate-100 animate-in fade-in duration-200">
                {/* Feasibility Alert */}
                {summary.is_unreachable ? (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Range exceeded! Route requires charging stops beyond corridor capacity.</span>
                  </div>
                ) : summary.reserve_breached ? (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Reserve breached (&lt;10% SoC). Charging stop scheduled.</span>
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <BatteryCharging className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Feasible route with active regenerative telemetry.</span>
                  </div>
                )}

                {/* Primary Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-500 font-medium">Distance</span>
                    <span className="text-sm font-bold text-slate-800 font-mono">
                      {summary.total_distance_km} km
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-500 font-medium">Net Energy</span>
                    <span className="text-sm font-bold text-slate-800 font-mono">
                      {summary.net_energy_kwh} kWh
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-500 font-medium">Final Battery</span>
                    <span
                      className={`text-sm font-bold font-mono ${
                        summary.final_soc_percent < 15 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {summary.final_soc_percent}%
                    </span>
                  </div>
                </div>

                {/* Charging Stops Accordion */}
                {summary.charging_stops && summary.charging_stops.length > 0 && (
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-blue-900 flex items-center gap-1">
                        ⚡ Planned Fast-Charging Stops
                      </span>
                      <span className="text-[10px] text-blue-700 font-medium">
                        ~{summary.total_charging_time_minutes} min total
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {summary.charging_stops.map((stop, idx) => (
                        <div
                          key={idx}
                          className="bg-white p-2 rounded-lg border border-blue-100 shadow-2xs text-[11px] space-y-0.5"
                        >
                          <div className="flex justify-between font-semibold text-slate-800">
                            <span className="truncate">{stop.name}</span>
                            <span className="font-mono text-slate-500 shrink-0">
                              km {stop.arrival_distance_km}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>
                              {stop.arrival_soc_percent}% →{' '}
                              <span className="text-emerald-600 font-semibold">
                                {stop.target_soc_percent}%
                              </span>
                            </span>
                            <span className="text-amber-600 font-semibold">
                              ~{stop.charging_time_minutes} min ({stop.power_kw} kW)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Driver Briefing */}
                {briefing && (
                  <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 text-xs space-y-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1 text-[11px]">
                      <Wind className="w-3.5 h-3.5 text-blue-500" /> AI Driver Briefing
                    </span>
                    <p className="text-slate-600 text-[11px] leading-relaxed">{briefing}</p>
                  </div>
                )}

                {/* Elevation & Telemetry Toggle */}
                <button
                  type="button"
                  onClick={() => setShowChart((prev) => !prev)}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition"
                >
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  <span>{showChart ? "Hide Elevation Profile" : "View Elevation & Battery Profile"}</span>
                  {showChart ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {/* Elevation vs Battery Chart */}
                {showChart && summary.telemetry_profile && summary.telemetry_profile.length > 0 && (
                  <div className="h-44 w-full bg-white p-2 rounded-xl border border-slate-200">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={summary.telemetry_profile}
                        margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="distance_km"
                          unit="km"
                          tick={{ fontSize: 9 }}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="elev"
                          unit="m"
                          tick={{ fontSize: 9 }}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="soc"
                          orientation="right"
                          domain={[0, 100]}
                          unit="%"
                          tick={{ fontSize: 9 }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            fontSize: '11px',
                            backgroundColor: '#0f172a',
                            color: '#ffffff',
                            borderRadius: '8px',
                          }}
                        />
                        <Area
                          yAxisId="elev"
                          type="monotone"
                          dataKey="elevation_m"
                          name="Elevation (m)"
                          fill="#bfdbfe"
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                        />
                        <Line
                          yAxisId="soc"
                          type="monotone"
                          dataKey="soc_percent"
                          name="Battery SoC (%)"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Complete Drive & Grey-Box Calibration Button */}
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => setIsCalibrationModalOpen(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Complete Drive &amp; Recalibrate (EMA)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAuthModalOpen(true)}
                    className="w-full py-2 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <User className="w-3.5 h-3.5" />
                    Sign In to Enable Grey-Box Learning
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top-Right Driver / Profile Floating Capsule */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        {currentUser ? (
          <button
            type="button"
            onClick={() => setIsCalibrationModalOpen(true)}
            className="flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.12)] border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-white transition"
          >
            {currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture ? (
              <img
                src={currentUser.user_metadata.avatar_url || currentUser.user_metadata.picture}
                alt="Avatar"
                className="w-6 h-6 rounded-full object-cover ring-1 ring-emerald-400 shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                {currentUser.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="text-left hidden sm:block">
              <div className="leading-tight font-bold text-slate-900 truncate max-w-[120px]">
                {currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0]}
              </div>
              <div className="text-[10px] text-emerald-600 leading-none">
                {userProfile ? `${userProfile.driver_aggression_factor.toFixed(2)}x Aggression` : 'Grey-Box Active'}
              </div>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.12)] border border-slate-200 text-xs font-bold text-slate-800 hover:bg-white hover:text-sky-600 transition"
          >
            <User className="w-4 h-4 text-sky-500" />
            <span>Driver Login</span>
          </button>
        )}
      </div>

      {/* Fullscreen Map Canvas */}
      <div className="w-full h-full absolute inset-0 z-0">
        <MapComponent
          center={mapCenter}
          zoom={mapZoom}
          coordinates={activeRouteCoords}
          chargingStops={summary?.charging_stops || []}
          originName={originName}
          destinationName={destinationName}
          originCoords={originCoords}
          destinationCoords={destCoords}
          journeyRunId={journeyRunId}
          userLocation={userLocationCoords}
          emergencyStations={emergencyStations}
          onRecenter={handleRecenter}
        />
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={async (usr) => {
          setCurrentUser(usr);
          if (usr?.id) {
            const p = await fetchUserProfile(usr.id);
            if (p) setUserProfile(p);
          }
        }}
      />

      {/* Grey-Box Calibration Modal */}
      <CalibrationModal
        isOpen={isCalibrationModalOpen}
        onClose={() => setIsCalibrationModalOpen(false)}
        profile={userProfile}
        userEmail={currentUser?.email || ''}
        onSignOut={handleSignOut}
        onProfileUpdated={(updated) => setUserProfile(updated)}
        lastRouteSummary={summary}
      />
    </main>
  );
}

export default function HomePage() {
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return <UnStrandedHero onEnter={() => setEntered(true)} />;
  }

  return <GoogleMapsEVLayout onReturnToHero={() => setEntered(false)} />;
}
