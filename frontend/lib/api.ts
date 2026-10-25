import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Vehicle {
  id: string;
  name: string;
  display_name?: string;
  brand?: string;
  model_name?: string;
  trim_name?: string;
  battery_kwh: number;
  battery_capacity_kwh?: number;
  battery_chemistry?: string;
  curb_weight_kg: number;
  max_charge_power_kw?: number;
  max_regen_kw?: number;
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
  ambient_temp_c?: number;
  effective_airspeed_kmh?: number;
  headwind_component_kmh?: number;
  road_condition?: string;
  dynamic_crr?: number;
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

export interface BatteryHealthAudit {
  vehicle_age_years: number;
  odometer_km: number;
  estimated_soh_percent: number;
  nominal_capacity_kwh: number;
  effective_usable_capacity_kwh: number;
  capacity_lost_kwh: number;
  impedance_loss_factor: number;
  effective_max_regen_kw: number;
}

export interface WeatherImpactSummary {
  average_headwind_kmh: number;
  max_headwind_kmh: number;
  wet_route_percentage: number;
  extra_weather_energy_kwh: number;
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
  battery_health?: BatteryHealthAudit;
  weather_impact?: WeatherImpactSummary;
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
  vehicle_age_years?: number;
  odometer_km?: number;
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

export interface UserVehicleProfile {
  id?: string;
  user_id: string;
  variant_id: string;
  registration_year: number;
  initial_odometer_km: number;
  current_odometer_km: number;
  driver_aggression_factor: number;
  crr_offset: number;
  calibrated_capacity_kwh: number;
  trips_completed: number;
  confidence_score: number;
}

export const fetchUserProfile = async (userId: string): Promise<UserVehicleProfile | null> => {
  try {
    const res = await axios.get(`${API_BASE}/api/user/profile/${userId}`);
    return res.data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

export const saveUserProfile = async (payload: {
  user_id: string;
  variant_id: string;
  registration_year: number;
  odometer_km: number;
}): Promise<UserVehicleProfile> => {
  const res = await axios.post(`${API_BASE}/api/user/profile`, payload);
  return res.data;
};

export const closeTripAndCalibrate = async (payload: {
  trip_id: string;
  user_id: string;
  predicted_final_soc: number;
  actual_final_soc: number;
  initial_soc: number;
  distance_km: number;
  gross_predicted_energy_kwh: number;
  origin_name?: string;
  destination_name?: string;
}): Promise<UserVehicleProfile> => {
  const res = await axios.post(`${API_BASE}/api/trip/close`, payload);
  return res.data;
};

export const evaluateStreamlinedRoute = async (payload: {
  user_id: string;
  origin_lat: number;
  origin_lon: number;
  dest_lat: number;
  dest_lon: number;
  current_soc_percent: number;
  passengers?: number;
  variant_id?: string;
  vehicle_model?: string;
  ambient_temp_c?: number;
}): Promise<RouteSummary & { calibration_status?: any }> => {
  const res = await axios.post(`${API_BASE}/api/route/evaluate-streamlined`, payload);
  return res.data;
};

