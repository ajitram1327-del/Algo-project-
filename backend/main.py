"""
FastAPI Backend Application for Intelligent EV Charger Recommendation
Using Physics-Aware Route Optimization.

Provides:
- GET  /api/health   : Health & integration configuration status
- GET  /api/vehicles : Live Chargetrip or fallback demo EV models
- POST /api/route    : Route planning with Chargetrip, physics engine, and CrewAI briefing
"""

import os
import time
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env
load_dotenv()

from models import (
    RouteRequest,
    RouteResponse,
    HealthResponse,
    Vehicle,
)
from services.chargetrip import ChargetripService
from services.physics_estimator import calculate_physics_energy_estimate
from services.ai_agent import generate_driver_briefing

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")

app = FastAPI(
    title="Intelligent EV Route & Charger Optimizer",
    version="1.0.0",
    description="Physics-Aware EV Route Optimization with Chargetrip & CrewAI Agent Briefing",
)

# CORS configuration for Next.js frontend
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
# Fallback to wildcard or explicit defaults if empty
if not origins:
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits flexible development port matching
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chargetrip_service = ChargetripService()


@app.get("/api/health", response_model=HealthResponse)
def get_health():
    """
    Reports backend service operational health and reveals whether external API
    credentials are configured without exposing actual secret values.
    """
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    openai_configured = bool(openai_key and openai_key != "your_openai_api_key_here")

    return HealthResponse(
        status="healthy",
        chargetrip_configured=chargetrip_service.is_configured,
        openai_configured=openai_configured,
        default_origin={"lat": 13.3409, "lng": 74.7858, "name": "Manipal"},
        default_destination={"lat": 13.3490, "lng": 74.7003, "name": "Malpe Beach"},
        version="1.0.0",
    )


@app.get("/api/vehicles", response_model=List[Vehicle])
async def list_vehicles():
    """
    Returns available EV models from Chargetrip.
    If Chargetrip is unconfigured or unreachable, returns clearly marked demo vehicles.
    """
    vehicles = await chargetrip_service.get_vehicles()
    return vehicles


@app.post("/api/route", response_model=RouteResponse)
async def calculate_route(payload: RouteRequest):
    """
    End-to-end route optimization pipeline:
    1. Validates vehicle, temperature, passenger payload, and current battery SoC.
    2. Requests route from Chargetrip (or deterministic local demonstration engine).
    3. Runs physics-aware thermodynamic & elevation estimation.
    4. Invokes CrewAI Fleet Logistics Analyst agent to generate a 3-sentence operational driver briefing.
    5. Returns transparent metadata on data sources and fallback status.
    """
    start_time = time.perf_counter()

    # 1. Fetch fleet to resolve selected vehicle
    vehicles = await chargetrip_service.get_vehicles()
    selected_vehicle = chargetrip_service.get_vehicle_by_id(payload.vehicle_id, vehicles)

    # 2. Compute route via Chargetrip GraphQL or fallback
    route_data = await chargetrip_service.calculate_route(
        vehicle=selected_vehicle,
        current_soc=payload.current_soc,
        temperature_c=payload.temperature_c,
        passengers=payload.passengers,
        origin_lat=payload.origin_lat,
        origin_lng=payload.origin_lng,
        dest_lat=payload.dest_lat,
        dest_lng=payload.dest_lng,
    )

    # 3. Physics-Aware Energy & SoC Projection
    physics_estimate = calculate_physics_energy_estimate(
        vehicle=selected_vehicle,
        distance_km=route_data["distance_km"],
        temperature_c=payload.temperature_c,
        passengers=payload.passengers,
        current_soc=payload.current_soc,
    )

    # Warnings if battery reserve drops below 15%
    warnings: List[str] = []
    if physics_estimate.projected_final_soc < 15.0:
        warnings.append(
            f"Caution: Projected arrival battery ({physics_estimate.projected_final_soc:.1f}%) is below the "
            "15% emergency reserve buffer. Charging stop is strongly recommended."
        )

    # 4. Driver Route Briefing via CrewAI Agent or deterministic fallback
    driver_briefing = await generate_driver_briefing(
        vehicle=selected_vehicle,
        distance_km=route_data["distance_km"],
        current_soc=payload.current_soc,
        physics_estimate=physics_estimate,
        charging_stops=route_data["charging_stops"],
        temperature_c=payload.temperature_c,
        passengers=payload.passengers,
        origin_name=route_data.get("origin_name", "Manipal"),
        dest_name=route_data.get("destination_name", "Malpe Beach"),
    )

    return RouteResponse(
        is_fallback=route_data["is_fallback"],
        data_source=route_data["data_source"],
        status=route_data["status"],
        distance_km=route_data["distance_km"],
        duration_min=route_data["duration_min"],
        geometry=route_data["geometry"],
        origin_name=route_data["origin_name"],
        destination_name=route_data["destination_name"],
        origin_coordinates=route_data["origin_coordinates"],
        destination_coordinates=route_data["destination_coordinates"],
        charging_stops=route_data["charging_stops"],
        available_charging_stations=route_data.get("available_charging_stations", route_data["charging_stops"]),
        vehicle=selected_vehicle,
        physics_estimate=physics_estimate,
        driver_briefing=driver_briefing,
        warnings=warnings,
    )
