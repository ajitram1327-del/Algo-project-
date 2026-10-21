"""
Pydantic models for the EV Route Optimizer application.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class RouteRequest(BaseModel):
    vehicle_id: str = Field(default="demo-tata-nexon-ev", description="Vehicle ID from Chargetrip or Demo fleet")
    temperature_c: float = Field(default=30.0, ge=-20.0, le=55.0, description="Ambient temperature in Celsius")
    passengers: int = Field(default=2, ge=1, le=8, description="Number of passengers onboard (including driver)")
    current_soc: float = Field(default=40.0, ge=0.0, le=100.0, description="Current Battery State of Charge (%)")
    origin_lat: float = Field(default=13.3409, description="Origin latitude (Manipal default: 13.3409)")
    origin_lng: float = Field(default=74.7858, description="Origin longitude (Manipal default: 74.7858)")
    dest_lat: float = Field(default=13.3490, description="Destination latitude (Malpe Beach default: 13.3490)")
    dest_lng: float = Field(default=74.7003, description="Destination longitude (Malpe Beach default: 74.7003)")


class Vehicle(BaseModel):
    id: str
    make: str
    model: str
    version: Optional[str] = None
    battery_usable_kwh: float
    battery_full_kwh: float
    nominal_range_km: float
    consumption_kwh_per_100km: float
    image_url: Optional[str] = None
    is_demo: bool = False


class ChargingStop(BaseModel):
    id: str
    name: str
    coordinates: List[float]  # GeoJSON order: [longitude, latitude]
    power_kw: float
    arrival_soc: float
    departure_soc: float
    charge_time_min: float
    energy_added_kwh: float
    is_mock: bool = False


class PhysicsEstimate(BaseModel):
    base_energy_kwh: float
    temp_impact_pct: float
    passenger_impact_pct: float
    elevation_gain_loss_kwh: float
    net_energy_kwh: float
    soc_consumed_pct: float
    projected_final_soc: float
    assumptions: List[str]
    methodology: str


class DriverBriefing(BaseModel):
    briefing: str  # Exactly 3 sentences
    is_fallback: bool
    agent_role: str = "Fleet Logistics Analyst"
    sentence_count: int = 3


class GeoJSONGeometry(BaseModel):
    type: str = "LineString"
    coordinates: List[List[float]]  # Array of [longitude, latitude]


class RouteResponse(BaseModel):
    is_fallback: bool
    data_source: str  # "Chargetrip Live API" or "Deterministic Local Demonstration Engine"
    status: str
    distance_km: float
    duration_min: float
    geometry: GeoJSONGeometry
    origin_name: str = "Manipal, Karnataka"
    destination_name: str = "Malpe Beach, Udupi"
    origin_coordinates: List[float]       # [lng, lat]
    destination_coordinates: List[float]  # [lng, lat]
    charging_stops: List[ChargingStop]
    available_charging_stations: List[ChargingStop] = []
    vehicle: Vehicle
    physics_estimate: PhysicsEstimate
    driver_briefing: DriverBriefing
    warnings: List[str] = []


class HealthResponse(BaseModel):
    status: str
    chargetrip_configured: bool
    openai_configured: bool
    default_origin: Dict[str, Any]
    default_destination: Dict[str, Any]
    version: str = "1.0.0"
