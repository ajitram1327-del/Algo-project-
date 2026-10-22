import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Vehicle {
  id: string;
  name: string;
  battery_kwh: number;
  curb_weight_kg: number;
}

export interface ChargingStop {
  id: string;
  name: string;
  coordinates?: [number, number];
  lat?: number;
  lon?: number;
  lng?: number;
  power_kw: number;
  arrival_soc?: number;
  departure_soc?: number;
  charge_time_min?: number;
  energy_added_kwh?: number;
  is_mock?: boolean;
}

export interface TelemetryPoint {
  segment_idx: number;
  distance_km: number;
  elevation_m: number;
  gradient_percent: number;
  soc_percent: number;
  is_regenerating: boolean;
  cumulative_energy_kwh: number;
}

export interface ChargingPlanStop {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  power_kw: number;
  arrival_distance_km: number;
  arrival_soc_percent: number;
  target_soc_percent: number;
  energy_added_kwh: number;
  charging_time_minutes: number;
}

export interface RouteSummary {
  total_distance_km: number;
  total_climb_m: number;
  total_descent_m: number;
  max_gradient_percent: number;
  gross_consumed_kwh: number;
  gross_regenerated_kwh: number;
  net_energy_kwh: number;
  final_soc_percent: number;
  reserve_breached: boolean;
  is_unreachable?: boolean;
  total_charging_time_minutes?: number;
  total_energy_charged_kwh?: number;
  charging_stops?: ChargingPlanStop[];
  telemetry_profile: TelemetryPoint[];
  route_coordinates?: [number, number][];
  available_chargers?: OcmCharger[];
  driver_briefing?: string;
}

export const fetchVehicles = async (): Promise<Vehicle[]> => {
  const res = await axios.get(`${API_BASE}/api/vehicles`);
  return res.data;
};

export interface OcmCharger {
  id: string;
  name: string;
  lat: number;
  lon: number;
  power_kw: number;
  source?: string;
}

export const fetchOcmChargers = async (
  lat = 13.3409,
  lon = 74.7858,
  distance_km = 25
): Promise<OcmCharger[]> => {
  const res = await axios.get(`${API_BASE}/api/chargers`, {
    params: { lat, lon, distance_km },
  });
  return res.data;
};

export interface GeocodeLocation {
  name: string;
  display_name: string;
  lat: number;
  lon: number;
  type: string;
}

export const searchLocations = async (query: string): Promise<GeocodeLocation[]> => {
  if (!query || query.trim().length < 2) return [];
  const res = await axios.get(`${API_BASE}/api/geocode`, {
    params: { q: query.trim() },
  });
  return res.data;
};

export const evaluateRoutePhysics = async (payload: {
  vehicle_model: string;
  passengers: number;
  ambient_temp_c: number;
  initial_soc_percent: number;
  origin_lat?: number;
  origin_lon?: number;
  dest_lat?: number;
  dest_lon?: number;
  coordinates?: number[][];
}): Promise<RouteSummary> => {
  const res = await axios.post(`${API_BASE}/api/route/evaluate`, payload);
  return res.data;
};

export const fetchDriverBriefing = async (payload: {
  vehicle_model: string;
  passengers: number;
  ambient_temp_c: number;
  route_summary: RouteSummary;
}): Promise<string> => {
  const res = await axios.post(`${API_BASE}/api/route/briefing`, payload);
  return res.data.briefing;
};
