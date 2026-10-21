import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  version?: string;
  battery_usable_kwh: number;
  battery_full_kwh: number;
  nominal_range_km: number;
  consumption_kwh_per_100km: number;
  image_url?: string;
  is_demo: boolean;
}

export interface ChargingStop {
  id: string;
  name: string;
  coordinates: [number, number]; // [longitude, latitude]
  power_kw: number;
  arrival_soc: number;
  departure_soc: number;
  charge_time_min: number;
  energy_added_kwh: number;
  is_mock: boolean;
}

export interface PhysicsEstimate {
  base_energy_kwh: number;
  temp_impact_pct: number;
  passenger_impact_pct: number;
  elevation_gain_loss_kwh: number;
  net_energy_kwh: number;
  soc_consumed_pct: number;
  projected_final_soc: number;
  assumptions: string[];
  methodology: string;
}

export interface DriverBriefing {
  briefing: string;
  is_fallback: boolean;
  agent_role: string;
  sentence_count: number;
}

export interface GeoJSONGeometry {
  type: string;
  coordinates: [number, number][]; // Array of [longitude, latitude]
}

export interface RouteResponse {
  is_fallback: boolean;
  data_source: string;
  status: string;
  distance_km: number;
  duration_min: number;
  geometry: GeoJSONGeometry;
  origin_name: string;
  destination_name: string;
  origin_coordinates: [number, number];
  destination_coordinates: [number, number];
  charging_stops: ChargingStop[];
  available_charging_stations?: ChargingStop[];
  vehicle: Vehicle;
  physics_estimate: PhysicsEstimate;
  driver_briefing: DriverBriefing;
  warnings: string[];
}

export interface RouteRequest {
  vehicle_id: string;
  temperature_c: number;
  passengers: number;
  current_soc: number;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
}

export interface HealthResponse {
  status: string;
  chargetrip_configured: boolean;
  openai_configured: boolean;
  default_origin: { lat: number; lng: number; name?: string };
  default_destination: { lat: number; lng: number; name?: string };
  version: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>("/api/health");
  return data;
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  const { data } = await apiClient.get<Vehicle[]>("/api/vehicles");
  return data;
}

export async function calculateRoute(request: RouteRequest): Promise<RouteResponse> {
  const { data } = await apiClient.post<RouteResponse>("/api/route", request);
  return data;
}
