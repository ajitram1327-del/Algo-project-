"""
Pydantic schemas for EV Route Optimization API.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class RouteRequest(BaseModel):
    start_node: str = Field(default="N0", description="Origin node identifier (e.g. 'N0')")
    destination_node: str = Field(default="N14", description="Destination node identifier (e.g. 'N14')")
    current_battery_soc: float = Field(
        default=25.0,
        ge=10.0,
        le=100.0,
        description="Current State of Charge percentage (10% to 100%)",
    )
    min_reserve_soc: float = Field(
        default=10.0,
        ge=5.0,
        le=30.0,
        description="Minimum emergency battery reserve threshold (%)",
    )
    target_charge_soc: float = Field(
        default=80.0,
        ge=50.0,
        le=100.0,
        description="Target SoC after stopping at a fast charger (%)",
    )


class ChargingStop(BaseModel):
    node: str
    station_name: str
    arrival_soc: float
    departure_soc: float
    energy_added_kwh: float
    power_kw: float
    charging_time_min: float


class SegmentDetail(BaseModel):
    from_node: str
    to_node: str
    road_name: str
    distance_km: float
    elevation_change_m: float
    speed_kmh: float
    energy_kwh: float
    soc_before: float
    soc_after: float


class RouteResponse(BaseModel):
    feasible: bool
    message: str
    path: List[str]
    path_names: List[str]
    total_distance_km: float
    net_energy_kwh: float
    initial_soc: float
    final_soc: float
    charging_stops: List[ChargingStop]
    segments: List[SegmentDetail]
    execution_time_ms: float
