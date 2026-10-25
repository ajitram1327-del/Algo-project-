"""
Consolidated UnStranded EV Telematics API Server
"""

import os
import math
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from dotenv import load_dotenv

load_dotenv()

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = Any

try:
    from app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from app.adaptive_profile import (
        VEHICLE_VARIANTS_DB,
        CalibrationFactors,
        execute_grey_box_calibration,
    )
    from services.geography import GeographyService
    from services.weather import WeatherService
    from services.telematics_briefing import generate_fleet_briefing
except ImportError:
    from backend.app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from backend.app.adaptive_profile import (
        VEHICLE_VARIANTS_DB,
        CalibrationFactors,
        execute_grey_box_calibration,
    )
    from backend.services.geography import GeographyService
    from backend.services.weather import WeatherService
    from backend.services.telematics_briefing import generate_fleet_briefing

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://crnibxrmhljyuhhccpdi.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

supabase: Optional[Any] = None
try:
    if create_client and SUPABASE_URL and not SUPABASE_URL.startswith("https://your-"):
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
except Exception:
    supabase = None

# Resilient in-memory store for local development or offline execution
_in_memory_profiles: Dict[str, Dict[str, Any]] = {}
_in_memory_trips: List[Dict[str, Any]] = []

geo_service = GeographyService()
weather_service = WeatherService()

app = FastAPI(title="UnStranded Engine API", version="3.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UserSignupRequest(BaseModel):
    user_id: str
    variant_id: str
    registration_year: int
    odometer_km: float = 0.0


class StreamlinedRouteRequest(BaseModel):
    user_id: str = "user_ajit_1327"
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    current_soc_percent: float
    passengers: int = 1


class TripClosureRecord(BaseModel):
    trip_id: str
    user_id: str
    predicted_final_soc: float
    actual_final_soc: float
    initial_soc: float
    distance_km: float
    gross_predicted_energy_kwh: float
    origin_name: Optional[str] = None
    destination_name: Optional[str] = None


class EmergencyDivertRequest(BaseModel):
    user_id: Optional[str] = "user_ajit_1327"
    current_lat: float
    current_lon: float
    current_soc_percent: float
    passengers: int = 1
    vehicle_model: Optional[str] = "tata_nexon_ev"
    ambient_temp_c: Optional[float] = 30.0


class RouteSimulationRequest(BaseModel):
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    origin: Optional[Any] = None
    destination: Optional[Any] = None
    vehicle_model: str = "tata_nexon_ev"
    passengers: int = 2
    ambient_temp_c: float = 30.0
    initial_soc_percent: float = 50.0
    starting_soc: Optional[float] = None
    coordinates: Optional[List[List[float]]] = None
    coord_order: str = "lat_lon_ele"
    vehicle_age_years: float = 0.0
    odometer_km: Optional[float] = None


class BriefingRequest(BaseModel):
    vehicle_model: str = "tata_nexon_ev"
    passengers: int = 2
    ambient_temp_c: float = 30.0
    route_summary: dict = {}


@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "engine": "unstranded-unified-v3.2"}


@app.get("/api/vehicles")
async def get_vehicles():
    return [
        {
            "id": k,
            "variant_id": k,
            "name": v.display_name,
            "display_name": v.display_name,
            "brand": getattr(v, "brand", "") or (v.display_name.split()[0] if v.display_name else "Other"),
            "model_name": getattr(v, "model_name", v.display_name),
            "trim_name": getattr(v, "trim_name", v.display_name),
            "nominal_kwh": v.nominal_capacity_kwh,
            "usable_kwh": v.usable_capacity_kwh,
            "battery_kwh": v.usable_capacity_kwh,
            "battery_capacity_kwh": v.nominal_capacity_kwh,
            "chemistry": v.battery_chemistry,
            "curb_weight_kg": v.curb_weight_kg,
            "max_charge_power_kw": getattr(v, "max_charge_power_kw", 50.0),
            "max_regen_kw": getattr(v, "max_regen_power_kw", 30.0),
        }
        for k, v in VEHICLE_VARIANTS_DB.items()
    ]


@app.post("/api/user/profile")
async def register_or_update_profile(payload: UserSignupRequest):
    variant = VEHICLE_VARIANTS_DB.get(payload.variant_id)
    if not variant:
        raise HTTPException(status_code=400, detail="Unknown vehicle variant")

    age = max(0, 2026 - payload.registration_year)
    initial_degradation = max(0.65, 1.0 - (0.023 * math.sqrt(age) + 0.008 * age))
    initial_calibrated_kwh = round(variant.usable_capacity_kwh * initial_degradation, 2)

    profile_row = {
        "user_id": payload.user_id,
        "variant_id": payload.variant_id,
        "registration_year": payload.registration_year,
        "initial_odometer_km": payload.odometer_km,
        "current_odometer_km": payload.odometer_km,
        "driver_aggression_factor": 1.0,
        "crr_offset": 0.0,
        "calibrated_capacity_kwh": initial_calibrated_kwh,
        "trips_completed": 0,
        "confidence_score": 0.35 if age < 1 else 0.45,
    }

    _in_memory_profiles[payload.user_id] = profile_row

    if supabase is not None:
        try:
            res = supabase.table("vehicle_profiles").upsert(profile_row).execute()
            if res.data:
                return res.data[0]
        except Exception:
            pass

    return profile_row


@app.get("/api/user/profile/{user_id}")
async def get_profile(user_id: str):
    if supabase is not None:
        try:
            res = supabase.table("vehicle_profiles").select("*").eq("user_id", user_id).execute()
            if res.data:
                return res.data[0]
        except Exception:
            pass

    if user_id in _in_memory_profiles:
        return _in_memory_profiles[user_id]

    # Sensible default fallback
    variant = VEHICLE_VARIANTS_DB.get("nexon_ev_lr") or list(VEHICLE_VARIANTS_DB.values())[0]
    return {
        "user_id": user_id,
        "variant_id": variant.variant_id,
        "registration_year": 2024,
        "current_odometer_km": 14000.0,
        "driver_aggression_factor": 1.0,
        "crr_offset": 0.0,
        "calibrated_capacity_kwh": variant.usable_capacity_kwh,
        "trips_completed": 0,
        "confidence_score": 0.35,
    }


@app.post("/api/route/evaluate-streamlined")
async def evaluate_streamlined_route(payload: StreamlinedRouteRequest):
    profile = await get_profile(payload.user_id)
    variant = VEHICLE_VARIANTS_DB.get(profile["variant_id"], VEHICLE_VARIANTS_DB.get("nexon_ev_lr"))

    calibration = CalibrationFactors(
        driver_aggression_factor=profile["driver_aggression_factor"],
        crr_offset=profile["crr_offset"],
        calibrated_capacity_kwh=profile["calibrated_capacity_kwh"],
        trips_completed=profile["trips_completed"],
        confidence_score=profile["confidence_score"],
    )

    coords_2d = await geo_service.fetch_route_geometry(
        payload.origin_lat, payload.origin_lon, payload.dest_lat, payload.dest_lon
    )
    mid_lat = (payload.origin_lat + payload.dest_lat) / 2.0
    mid_lon = (payload.origin_lon + payload.dest_lon) / 2.0

    elevations, candidate_chargers, weather_profile = await asyncio.gather(
        geo_service.fetch_elevation_profile(coords_2d),
        geo_service.fetch_chargers_along_corridor(mid_lat, mid_lon),
        weather_service.fetch_corridor_weather(coords_2d),
    )

    coords_3d = [[lat, lon, ele] for (lat, lon), ele in zip(coords_2d, elevations)]
    avg_temp = sum(w["temp_c"] for w in weather_profile) / max(1, len(weather_profile))

    engine = UniversalEVPhysicsEngine(
        variant_specs=variant,
        calibration=calibration,
        passengers=payload.passengers,
        ambient_temp_c=avg_temp,
    )

    report = engine.evaluate_route(
        coordinates_3d=coords_3d,
        weather_profile=weather_profile,
        initial_soc_percent=payload.current_soc_percent,
        candidate_chargers=candidate_chargers,
    )

    briefing_payload = {
        "vehicle_name": variant.display_name,
        "passengers": payload.passengers,
        "ambient_temp_c": avg_temp,
        "total_distance_km": report.total_distance_km,
        "net_energy_kwh": report.net_energy_kwh,
        "gross_regenerated_kwh": report.gross_regenerated_kwh,
        "max_uphill_gradient_percent": report.max_uphill_gradient_percent,
        "max_downhill_gradient_percent": report.max_downhill_gradient_percent,
        "final_soc_percent": report.final_soc_percent,
        "reserve_breached": report.reserve_breached,
        "planned_stops": [stop.model_dump() for stop in report.planned_stops],
    }

    res_dict = report.model_dump()
    res_dict["driver_briefing"] = generate_fleet_briefing(briefing_payload)
    res_dict["route_geometry"] = coords_2d
    res_dict["calibration_status"] = calibration.model_dump()
    return res_dict


@app.post("/api/route/evaluate")
async def evaluate_route_endpoint(payload: RouteSimulationRequest):
    try:
        soc_start = payload.starting_soc if payload.starting_soc is not None else payload.initial_soc_percent

        orig_lat, orig_lon = payload.origin_lat, payload.origin_lon
        dest_lat, dest_lon = payload.dest_lat, payload.dest_lon

        if isinstance(payload.origin, (list, tuple)) and len(payload.origin) >= 2:
            orig_lat, orig_lon = float(payload.origin[0]), float(payload.origin[1])
        elif isinstance(payload.origin, dict):
            orig_lat = float(payload.origin.get("lat") or payload.origin.get("latitude") or 0.0)
            orig_lon = float(payload.origin.get("lon") or payload.origin.get("longitude") or 0.0)

        if isinstance(payload.destination, (list, tuple)) and len(payload.destination) >= 2:
            dest_lat, dest_lon = float(payload.destination[0]), float(payload.destination[1])
        elif isinstance(payload.destination, dict):
            dest_lat = float(payload.destination.get("lat") or payload.destination.get("latitude") or 0.0)
            dest_lon = float(payload.destination.get("lon") or payload.destination.get("longitude") or 0.0)

        if orig_lat and orig_lon and dest_lat and dest_lon:
            coords_2d = await geo_service.fetch_route_geometry(orig_lat, orig_lon, dest_lat, dest_lon)
            if len(coords_2d) < 2:
                raise HTTPException(status_code=503, detail="Route could not be retrieved")

            mid_lat = (orig_lat + dest_lat) / 2.0
            mid_lon = (orig_lon + dest_lon) / 2.0

            elevations, candidate_chargers, weather_profile = await asyncio.gather(
                geo_service.fetch_elevation_profile(coords_2d),
                geo_service.fetch_chargers_along_corridor(mid_lat, mid_lon, route_coords=coords_2d),
                weather_service.fetch_corridor_weather(coords_2d),
            )
            coords_3d = [[lat, lon, ele] for (lat, lon), ele in zip(coords_2d, elevations)]
        elif payload.coordinates and len(payload.coordinates) >= 2:
            coords_3d = payload.coordinates
            coords_2d = [(pt[0], pt[1]) for pt in coords_3d]
            mid_lat = sum(pt[0] for pt in coords_2d) / len(coords_2d)
            mid_lon = sum(pt[1] for pt in coords_2d) / len(coords_2d)

            candidate_chargers, weather_profile = await asyncio.gather(
                geo_service.fetch_chargers_along_corridor(mid_lat, mid_lon, route_coords=coords_2d),
                weather_service.fetch_corridor_weather(coords_2d),
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid origin or destination coordinates")

        engine = UniversalEVPhysicsEngine(
            vehicle_model_id=payload.vehicle_model,
            passengers=payload.passengers,
            ambient_temp_c=payload.ambient_temp_c,
            vehicle_age_years=payload.vehicle_age_years,
            odometer_km=payload.odometer_km,
        )

        physics_report = engine.evaluate_route(
            coordinates_3d=coords_3d,
            weather_profile=weather_profile,
            coord_order=payload.coord_order,
            initial_soc_percent=soc_start,
            candidate_chargers=candidate_chargers,
        )

        briefing_data = {
            "vehicle_name": getattr(engine.specs, "name", getattr(engine.specs, "display_name", "EV")),
            "passengers": payload.passengers,
            "ambient_temp_c": payload.ambient_temp_c,
            "total_distance_km": physics_report.total_distance_km,
            "net_energy_kwh": physics_report.net_energy_kwh,
            "gross_regenerated_kwh": physics_report.gross_regenerated_kwh,
            "max_uphill_gradient_percent": physics_report.max_uphill_gradient_percent,
            "max_downhill_gradient_percent": physics_report.max_downhill_gradient_percent,
            "final_soc_percent": physics_report.final_soc_percent,
            "reserve_breached": physics_report.reserve_breached,
        }

        response = physics_report.model_dump()
        response["driver_briefing"] = generate_fleet_briefing(briefing_data)
        response["route_geometry"] = coords_2d
        response["route_coordinates"] = [[pt[1], pt[0]] for pt in coords_2d]
        response["available_chargers"] = candidate_chargers
        response["charging_stops"] = [stop.model_dump() for stop in physics_report.planned_stops]
        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")


@app.post("/api/route/briefing")
def get_briefing(req: BriefingRequest):
    if req.vehicle_model in VEHICLE_VARIANTS_DB:
        vehicle_name = VEHICLE_VARIANTS_DB[req.vehicle_model].display_name
    else:
        vehicle = EV_MODELS.get(req.vehicle_model, EV_MODELS["tata_nexon_ev"])
        vehicle_name = vehicle.name

    briefing_data = {
        "vehicle_name": vehicle_name,
        "passengers": req.passengers,
        "ambient_temp_c": req.ambient_temp_c,
        "total_distance_km": req.route_summary.get("total_distance_km", 0.0),
        "net_energy_kwh": req.route_summary.get("net_energy_kwh", 0.0),
        "gross_regenerated_kwh": req.route_summary.get("gross_regenerated_kwh", 0.0),
        "max_uphill_gradient_percent": req.route_summary.get("max_uphill_gradient_percent", 0.0),
        "max_downhill_gradient_percent": req.route_summary.get("max_downhill_gradient_percent", 0.0),
        "final_soc_percent": req.route_summary.get("final_soc_percent", 0.0),
        "reserve_breached": req.route_summary.get("reserve_breached", False),
        "planned_stops": req.route_summary.get("planned_stops", req.route_summary.get("charging_stops", [])),
    }
    return {"briefing": generate_fleet_briefing(briefing_data)}


@app.post("/api/trip/close")
async def close_trip_and_calibrate(payload: TripClosureRecord):
    profile = await get_profile(payload.user_id)
    update_data = execute_grey_box_calibration(
        user_row=profile,
        predicted_soc=payload.predicted_final_soc,
        actual_soc=payload.actual_final_soc,
        initial_soc=payload.initial_soc,
        gross_energy_kwh=payload.gross_predicted_energy_kwh,
        distance_km=payload.distance_km,
    )

    profile.update(update_data)
    _in_memory_profiles[payload.user_id] = profile

    if supabase is not None:
        try:
            supabase.table("vehicle_profiles").update(update_data).eq("user_id", payload.user_id).execute()
            supabase.table("trip_logs").insert({
                "user_id": payload.user_id,
                "origin_name": payload.origin_name,
                "destination_name": payload.destination_name,
                "distance_km": payload.distance_km,
                "gross_energy_kwh": payload.gross_predicted_energy_kwh,
                "initial_soc": payload.initial_soc,
                "predicted_soc": payload.predicted_final_soc,
                "actual_soc": payload.actual_final_soc,
                "soc_variance": round(payload.predicted_final_soc - payload.actual_final_soc, 2),
            }).execute()
        except Exception:
            pass

    return update_data


@app.post("/api/route/emergency-divert")
async def emergency_divert(payload: EmergencyDivertRequest):
    uid = payload.user_id or "user_ajit_1327"
    profile = await get_profile(uid)
    variant_key = payload.vehicle_model or profile.get("variant_id", "nexon_ev_lr")
    variant = VEHICLE_VARIANTS_DB.get(variant_key, VEHICLE_VARIANTS_DB.get("nexon_ev_lr"))

    calibration = CalibrationFactors(
        driver_aggression_factor=profile.get("driver_aggression_factor", 1.0),
        crr_offset=profile.get("crr_offset", 0.0),
        calibrated_capacity_kwh=profile.get("calibrated_capacity_kwh", variant.usable_capacity_kwh),
        trips_completed=profile.get("trips_completed", 0),
        confidence_score=profile.get("confidence_score", 0.35),
    )

    chargers = await geo_service.fetch_chargers_along_corridor(payload.current_lat, payload.current_lon, radius_m=35000)
    if not chargers:
        return []

    engine = UniversalEVPhysicsEngine(
        variant_specs=variant,
        calibration=calibration,
        passengers=payload.passengers,
        ambient_temp_c=payload.ambient_temp_c or 30.0,
    )

    results = []
    for chg in chargers[:5]:
        coords_2d = await geo_service.fetch_route_geometry(payload.current_lat, payload.current_lon, chg["lat"], chg["lon"])
        elevations = await geo_service.fetch_elevation_profile(coords_2d)
        coords_3d = [[lat, lon, ele] for (lat, lon), ele in zip(coords_2d, elevations)]

        normal_sim = engine.evaluate_route(coordinates_3d=coords_3d, cruising_speed_kmh=60.0, initial_soc_percent=payload.current_soc_percent)
        arrival_soc = normal_sim.final_soc_percent
        is_reachable = arrival_soc > 1.0
        eco_speed = 60.0

        if not is_reachable:
            eco_sim = engine.evaluate_route(coordinates_3d=coords_3d, cruising_speed_kmh=40.0, initial_soc_percent=payload.current_soc_percent)
            if eco_sim.final_soc_percent > 1.0:
                is_reachable = True
                arrival_soc = eco_sim.final_soc_percent
                eco_speed = 40.0

        results.append({
            "station_id": chg["id"],
            "name": chg["name"],
            "distance_km": normal_sim.total_distance_km,
            "arrival_soc_percent": round(arrival_soc, 1),
            "is_reachable": is_reachable,
            "recommended_eco_speed_kmh": eco_speed,
            "power_kw": chg.get("power_kw", 50.0),
            "coordinates": [chg["lat"], chg["lon"]],
        })

    results.sort(key=lambda x: (x["is_reachable"], x["arrival_soc_percent"]), reverse=True)
    return results


@app.get("/api/geocode")
async def geocode_query(q: str):
    """Search places, cities, and landmarks bounded strictly to India."""
    return await geo_service.search_locations(query=q)


@app.get("/api/chargers")
async def get_chargers(lat: float = 13.3409, lon: float = 74.7858, distance_km: float = 25.0):
    return await geo_service.fetch_chargers_along_corridor(lat, lon, radius_m=int(distance_km * 1000))
