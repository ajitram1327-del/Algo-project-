"""
FastAPI Server for Physics-Aware EV Route Optimization
Consolidates:
- First-principles physics engine with micro-segment densification
- Vector aerodynamics & precipitation rolling friction
- Grey-box Exponential Moving Average (EMA) parameter calibration
- Supabase PostgreSQL persistence (Auth, vehicle profiles, trip logs)
"""

import os
import math
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple
try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = Any
from dotenv import load_dotenv

load_dotenv()

# --- SUPABASE CLIENT INITIALIZATION ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key")

supabase_client: Optional[Any] = None
try:
    if create_client and SUPABASE_URL and not SUPABASE_URL.startswith("https://your-"):
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
except Exception:
    supabase_client = None

# Resilient fallback store for local development, offline runs, or default keys
_in_memory_profiles: Dict[str, Dict[str, Any]] = {}
_in_memory_trips: List[Dict[str, Any]] = []

try:
    from backend.app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from backend.services.geography import GeographyService
    from backend.services.telematics_briefing import generate_fleet_briefing
    from backend.services.weather import WeatherService
except ImportError:
    from app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from services.geography import GeographyService
    from services.telematics_briefing import generate_fleet_briefing
    from services.weather import WeatherService

app = FastAPI(
    title="UnStranded: Grey-Box Adaptive EV Telematics & Route Optimization Server",
    description="Physics-Aware Route Optimization & Adaptive Telematics System",
    version="3.1.0",
)

# Enable CORS for Next.js frontend deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

geo_service = GeographyService()
weather_service = WeatherService()


# =====================================================================
# 1. VEHICLE MODELS & CALIBRATION SCHEMAS
# =====================================================================

class VehicleVariant(BaseModel):
    variant_id: str
    display_name: str
    model_name: str
    nominal_capacity_kwh: float
    usable_capacity_kwh: float
    battery_chemistry: str = "LFP"
    curb_weight_kg: float
    drag_coefficient_cd: float
    frontal_area_m2: float
    base_crr: float = 0.012
    max_charge_power_kw: float = 50.0
    max_regen_power_kw: float = 40.0
    drivetrain_efficiency: float = 0.91
    regen_efficiency: float = 0.75
    rolling_resistance_crr: float = 0.012
    base_auxiliary_power_w: float = 650.0

    @property
    def battery_capacity_kwh(self) -> float:
        return self.nominal_capacity_kwh


VEHICLE_VARIANTS_DB: Dict[str, VehicleVariant] = {
    "nexon_ev_mr": VehicleVariant(
        variant_id="nexon_ev_mr",
        display_name="Tata Nexon EV Medium Range (30.2 kWh)",
        model_name="Tata Nexon EV",
        nominal_capacity_kwh=30.2,
        usable_capacity_kwh=29.0,
        battery_chemistry="LFP",
        curb_weight_kg=1400.0,
        drag_coefficient_cd=0.32,
        frontal_area_m2=2.40,
        max_charge_power_kw=30.0,
        max_regen_power_kw=30.0,
    ),
    "nexon_ev_lr": VehicleVariant(
        variant_id="nexon_ev_lr",
        display_name="Tata Nexon EV Long Range (45.0 kWh)",
        model_name="Tata Nexon EV",
        nominal_capacity_kwh=45.0,
        usable_capacity_kwh=43.5,
        battery_chemistry="LFP",
        curb_weight_kg=1480.0,
        drag_coefficient_cd=0.32,
        frontal_area_m2=2.42,
        max_charge_power_kw=60.0,
        max_regen_power_kw=42.0,
    ),
    "punch_ev_mr": VehicleVariant(
        variant_id="punch_ev_mr",
        display_name="Tata Punch EV Medium Range (25.0 kWh)",
        model_name="Tata Punch EV",
        nominal_capacity_kwh=25.0,
        usable_capacity_kwh=24.0,
        battery_chemistry="LFP",
        curb_weight_kg=1270.0,
        drag_coefficient_cd=0.34,
        frontal_area_m2=2.35,
        max_charge_power_kw=30.0,
        max_regen_power_kw=25.0,
    ),
    "punch_ev_lr": VehicleVariant(
        variant_id="punch_ev_lr",
        display_name="Tata Punch EV Long Range (35.0 kWh)",
        model_name="Tata Punch EV",
        nominal_capacity_kwh=35.0,
        usable_capacity_kwh=33.5,
        battery_chemistry="LFP",
        curb_weight_kg=1340.0,
        drag_coefficient_cd=0.34,
        frontal_area_m2=2.38,
        max_charge_power_kw=50.0,
        max_regen_power_kw=35.0,
    ),
    "curvv_ev_45": VehicleVariant(
        variant_id="curvv_ev_45",
        display_name="Tata Curvv EV Standard Range (45.0 kWh)",
        model_name="Tata Curvv EV",
        nominal_capacity_kwh=45.0,
        usable_capacity_kwh=43.0,
        battery_chemistry="LFP",
        curb_weight_kg=1490.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.45,
        max_charge_power_kw=70.0,
        max_regen_power_kw=42.0,
    ),
    "curvv_ev_55": VehicleVariant(
        variant_id="curvv_ev_55",
        display_name="Tata Curvv EV Long Range (55.0 kWh)",
        model_name="Tata Curvv EV",
        nominal_capacity_kwh=55.0,
        usable_capacity_kwh=53.0,
        battery_chemistry="LFP",
        curb_weight_kg=1550.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.45,
        max_charge_power_kw=70.0,
        max_regen_power_kw=45.0,
    ),
    "tiago_ev_mr": VehicleVariant(
        variant_id="tiago_ev_mr",
        display_name="Tata Tiago EV Medium Range (19.2 kWh)",
        model_name="Tata Tiago EV",
        nominal_capacity_kwh=19.2,
        usable_capacity_kwh=18.5,
        battery_chemistry="LFP",
        curb_weight_kg=1120.0,
        drag_coefficient_cd=0.34,
        frontal_area_m2=2.12,
        max_charge_power_kw=25.0,
        max_regen_power_kw=20.0,
    ),
    "tiago_ev_lr": VehicleVariant(
        variant_id="tiago_ev_lr",
        display_name="Tata Tiago EV Long Range (24.0 kWh)",
        model_name="Tata Tiago EV",
        nominal_capacity_kwh=24.0,
        usable_capacity_kwh=23.0,
        battery_chemistry="LFP",
        curb_weight_kg=1160.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.15,
        max_charge_power_kw=25.0,
        max_regen_power_kw=22.0,
    ),
    "xuv400_ec": VehicleVariant(
        variant_id="xuv400_ec",
        display_name="Mahindra XUV400 EC Pro (34.5 kWh)",
        model_name="Mahindra XUV400",
        nominal_capacity_kwh=34.5,
        usable_capacity_kwh=33.0,
        battery_chemistry="NMC",
        curb_weight_kg=1540.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.44,
        max_charge_power_kw=50.0,
        max_regen_power_kw=38.0,
    ),
    "xuv400_el": VehicleVariant(
        variant_id="xuv400_el",
        display_name="Mahindra XUV400 EL Pro (39.4 kWh)",
        model_name="Mahindra XUV400",
        nominal_capacity_kwh=39.4,
        usable_capacity_kwh=38.0,
        battery_chemistry="NMC",
        curb_weight_kg=1578.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.44,
        max_charge_power_kw=50.0,
        max_regen_power_kw=40.0,
    ),
    "comet_ev": VehicleVariant(
        variant_id="comet_ev",
        display_name="MG Comet EV (17.3 kWh)",
        model_name="MG Comet EV",
        nominal_capacity_kwh=17.3,
        usable_capacity_kwh=16.8,
        battery_chemistry="LFP",
        curb_weight_kg=815.0,
        drag_coefficient_cd=0.36,
        frontal_area_m2=2.10,
        max_charge_power_kw=17.0,
        max_regen_power_kw=15.0,
    ),
    "mg_zs_ev_50": VehicleVariant(
        variant_id="mg_zs_ev_50",
        display_name="MG ZS EV Exclusive (50.3 kWh)",
        model_name="MG ZS EV",
        nominal_capacity_kwh=50.3,
        usable_capacity_kwh=48.0,
        battery_chemistry="NMC",
        curb_weight_kg=1610.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.45,
        max_charge_power_kw=50.0,
        max_regen_power_kw=45.0,
    ),
    "atto3_dynamic": VehicleVariant(
        variant_id="atto3_dynamic",
        display_name="BYD Atto 3 Dynamic (49.92 kWh)",
        model_name="BYD Atto 3",
        nominal_capacity_kwh=49.92,
        usable_capacity_kwh=48.0,
        battery_chemistry="LFP",
        curb_weight_kg=1680.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.52,
        max_charge_power_kw=70.0,
        max_regen_power_kw=45.0,
    ),
    "atto3_superior": VehicleVariant(
        variant_id="atto3_superior",
        display_name="BYD Atto 3 Superior/Premium (60.48 kWh)",
        model_name="BYD Atto 3",
        nominal_capacity_kwh=60.48,
        usable_capacity_kwh=58.5,
        battery_chemistry="LFP",
        curb_weight_kg=1750.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.52,
        max_charge_power_kw=80.0,
        max_regen_power_kw=50.0,
    ),
    "byd_seal_dynamic": VehicleVariant(
        variant_id="byd_seal_dynamic",
        display_name="BYD Seal Dynamic (61.44 kWh)",
        model_name="BYD Seal",
        nominal_capacity_kwh=61.44,
        usable_capacity_kwh=59.0,
        battery_chemistry="LFP",
        curb_weight_kg=1920.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.29,
        max_charge_power_kw=110.0,
        max_regen_power_kw=55.0,
    ),
    "byd_seal_premium": VehicleVariant(
        variant_id="byd_seal_premium",
        display_name="BYD Seal Premium/Performance (82.56 kWh)",
        model_name="BYD Seal",
        nominal_capacity_kwh=82.56,
        usable_capacity_kwh=80.0,
        battery_chemistry="LFP",
        curb_weight_kg=2055.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.29,
        max_charge_power_kw=150.0,
        max_regen_power_kw=60.0,
    ),
    "hyundai_ioniq_5": VehicleVariant(
        variant_id="hyundai_ioniq_5",
        display_name="Hyundai Ioniq 5 (72.6 kWh)",
        model_name="Hyundai Ioniq 5",
        nominal_capacity_kwh=72.6,
        usable_capacity_kwh=70.0,
        battery_chemistry="NMC",
        curb_weight_kg=1910.0,
        drag_coefficient_cd=0.288,
        frontal_area_m2=2.55,
        max_charge_power_kw=233.0,
        max_regen_power_kw=70.0,
    ),
    "kia_ev6_lr": VehicleVariant(
        variant_id="kia_ev6_lr",
        display_name="Kia EV6 Long Range (77.4 kWh)",
        model_name="Kia EV6",
        nominal_capacity_kwh=77.4,
        usable_capacity_kwh=74.0,
        battery_chemistry="NMC",
        curb_weight_kg=1980.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.48,
        max_charge_power_kw=233.0,
        max_regen_power_kw=75.0,
    ),
    "tesla_model_3_sr": VehicleVariant(
        variant_id="tesla_model_3_sr",
        display_name="Tesla Model 3 Standard Range (60.0 kWh)",
        model_name="Tesla Model 3",
        nominal_capacity_kwh=60.0,
        usable_capacity_kwh=57.5,
        battery_chemistry="LFP",
        curb_weight_kg=1610.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.22,
        max_charge_power_kw=170.0,
        max_regen_power_kw=65.0,
    ),
    "tesla_model_3_lr": VehicleVariant(
        variant_id="tesla_model_3_lr",
        display_name="Tesla Model 3 Long Range (78.1 kWh)",
        model_name="Tesla Model 3",
        nominal_capacity_kwh=78.1,
        usable_capacity_kwh=75.0,
        battery_chemistry="NMC",
        curb_weight_kg=1765.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.22,
        max_charge_power_kw=250.0,
        max_regen_power_kw=70.0,
    ),
    "tesla_model_y_lr": VehicleVariant(
        variant_id="tesla_model_y_lr",
        display_name="Tesla Model Y Long Range (78.1 kWh)",
        model_name="Tesla Model Y",
        nominal_capacity_kwh=78.1,
        usable_capacity_kwh=75.0,
        battery_chemistry="NMC",
        curb_weight_kg=1980.0,
        drag_coefficient_cd=0.23,
        frontal_area_m2=2.54,
        max_charge_power_kw=250.0,
        max_regen_power_kw=75.0,
    ),
    "volvo_ex40": VehicleVariant(
        variant_id="volvo_ex40",
        display_name="Volvo EX40 Recharge (82.0 kWh)",
        model_name="Volvo EX40",
        nominal_capacity_kwh=82.0,
        usable_capacity_kwh=78.0,
        battery_chemistry="NMC",
        curb_weight_kg=2040.0,
        drag_coefficient_cd=0.329,
        frontal_area_m2=2.56,
        max_charge_power_kw=200.0,
        max_regen_power_kw=65.0,
    ),
    "bmw_i4": VehicleVariant(
        variant_id="bmw_i4",
        display_name="BMW i4 eDrive40 (83.9 kWh)",
        model_name="BMW i4",
        nominal_capacity_kwh=83.9,
        usable_capacity_kwh=81.0,
        battery_chemistry="NMC",
        curb_weight_kg=2050.0,
        drag_coefficient_cd=0.24,
        frontal_area_m2=2.31,
        max_charge_power_kw=205.0,
        max_regen_power_kw=80.0,
    ),
    "mercedes_eqb": VehicleVariant(
        variant_id="mercedes_eqb",
        display_name="Mercedes-Benz EQB 350 (66.5 kWh)",
        model_name="Mercedes-Benz EQB",
        nominal_capacity_kwh=66.5,
        usable_capacity_kwh=64.0,
        battery_chemistry="NMC",
        curb_weight_kg=2175.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.53,
        max_charge_power_kw=100.0,
        max_regen_power_kw=55.0,
    ),
}


class CalibrationFactors(BaseModel):
    driver_aggression_factor: float = Field(default=1.0)
    crr_offset: float = Field(default=0.0)
    calibrated_capacity_kwh: float
    trips_completed: int = 0
    confidence_score: float = Field(default=0.35)


class UserSignupRequest(BaseModel):
    user_id: str
    variant_id: str
    registration_year: int
    odometer_km: float = 0.0


class StreamlinedRouteRequest(BaseModel):
    user_id: str
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


def execute_grey_box_calibration(
    user_row: Dict[str, Any],
    predicted_soc: float,
    actual_soc: float,
    initial_soc: float,
    gross_energy_kwh: float,
    distance_km: float,
) -> Dict[str, Any]:
    trips_completed = user_row.get("trips_completed", 0) + 1
    new_odometer = float(user_row.get("current_odometer_km", 0.0)) + distance_km

    # Adaptive learning rate decaying with completed trips
    alpha = max(0.08, 0.35 / (1.0 + 0.2 * trips_completed))

    # SoC residual error: positive means battery depleted faster than anticipated
    soc_error_pct = predicted_soc - actual_soc

    # 1. Update Driver Aggression Factor
    current_aggression = float(user_row.get("driver_aggression_factor", 1.0))
    if abs(soc_error_pct) > 0.5:
        correction = (soc_error_pct / 100.0) * 1.5
        new_aggression = max(0.85, min(1.35, current_aggression + (alpha * correction)))
    else:
        new_aggression = current_aggression

    # 2. Update Usable Battery Capacity
    variant = VEHICLE_VARIANTS_DB.get(user_row.get("variant_id"))
    usable_cap = variant.usable_capacity_kwh if variant else float(user_row.get("calibrated_capacity_kwh", 40.0))
    actual_soc_delta = max(1.0, initial_soc - actual_soc)
    inferred_capacity = (gross_energy_kwh / actual_soc_delta) * 100.0
    inferred_capacity = max(usable_cap * 0.55, min(usable_cap * 1.02, inferred_capacity))

    current_capacity = float(user_row.get("calibrated_capacity_kwh", usable_cap))
    new_capacity = (1.0 - alpha) * current_capacity + (alpha * inferred_capacity)

    # 3. Update Confidence Score
    new_confidence = min(0.98, 0.30 + (0.15 * math.log(trips_completed + 1)))

    return {
        "trips_completed": trips_completed,
        "current_odometer_km": round(new_odometer, 1),
        "driver_aggression_factor": round(new_aggression, 3),
        "calibrated_capacity_kwh": round(new_capacity, 2),
        "confidence_score": round(new_confidence, 2),
        "updated_at": "now()",
    }


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


@app.get("/api/health")
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ev-physics-engine", "crewai_active": False}


@app.get("/api/vehicles")
async def get_supported_vehicles():
    results = []
    # 1. Variant database items
    for k, v in VEHICLE_VARIANTS_DB.items():
        # Derive clean trim name from display_name
        trim = v.display_name
        if v.model_name and trim.startswith(v.model_name):
            trim = trim[len(v.model_name):].strip(" -")
        if not trim or trim.startswith("("):
            trim = f"Standard {trim}".strip()

        results.append({
            "id": k,
            "variant_id": v.variant_id,
            "name": v.display_name,
            "display_name": v.display_name,
            "model_name": v.model_name or v.display_name,
            "trim_name": trim,
            "battery_kwh": v.usable_capacity_kwh,
            "battery_capacity_kwh": v.nominal_capacity_kwh,
            "nominal_kwh": v.nominal_capacity_kwh,
            "usable_kwh": v.usable_capacity_kwh,
            "battery_chemistry": v.battery_chemistry,
            "chemistry": v.battery_chemistry,
            "curb_weight_kg": v.curb_weight_kg,
            "max_charge_power_kw": v.max_charge_power_kw,
            "max_regen_kw": v.max_regen_power_kw,
        })
    # 2. EV_MODELS items
    for k, v in EV_MODELS.items():
        if not any(item["id"] == k or item.get("model_name") == v.name for item in results):
            results.append({
                "id": k,
                "variant_id": k,
                "name": v.name,
                "display_name": v.name,
                "model_name": v.name,
                "trim_name": f"Standard ({v.battery_capacity_kwh} kWh)",
                "battery_kwh": v.battery_capacity_kwh,
                "battery_capacity_kwh": v.battery_capacity_kwh,
                "nominal_kwh": v.battery_capacity_kwh,
                "usable_kwh": v.battery_capacity_kwh,
                "battery_chemistry": v.battery_chemistry,
                "chemistry": v.battery_chemistry,
                "curb_weight_kg": v.curb_weight_kg,
                "max_charge_power_kw": v.max_charge_power_kw,
                "max_regen_kw": v.max_regen_power_kw,
            })
    return results


@app.post("/api/user/profile")
async def register_profile(payload: UserSignupRequest):
    variant = VEHICLE_VARIANTS_DB.get(payload.variant_id)
    if not variant:
        ev_model = EV_MODELS.get(payload.variant_id)
        if ev_model:
            variant = VehicleVariant(
                variant_id=payload.variant_id,
                display_name=ev_model.name,
                model_name=ev_model.name,
                nominal_capacity_kwh=ev_model.battery_capacity_kwh,
                usable_capacity_kwh=round(ev_model.battery_capacity_kwh * 0.95, 2),
                battery_chemistry=ev_model.battery_chemistry,
                curb_weight_kg=ev_model.curb_weight_kg,
                drag_coefficient_cd=ev_model.drag_coefficient_cd,
                frontal_area_m2=ev_model.frontal_area_m2,
                base_crr=ev_model.rolling_resistance_crr,
                max_charge_power_kw=ev_model.max_charge_power_kw,
                max_regen_power_kw=ev_model.max_regen_power_kw,
            )
        else:
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

    if supabase_client is not None:
        try:
            res = supabase_client.table("vehicle_profiles").upsert(profile_row).execute()
            if res.data:
                return res.data[0]
        except Exception:
            pass

    _in_memory_profiles[payload.user_id] = profile_row
    return profile_row


@app.get("/api/user/profile/{user_id}")
async def get_profile(user_id: str):
    if supabase_client is not None:
        try:
            res = supabase_client.table("vehicle_profiles").select("*").eq("user_id", user_id).execute()
            if res.data:
                return res.data[0]
        except Exception:
            pass

    if user_id in _in_memory_profiles:
        return _in_memory_profiles[user_id]
    raise HTTPException(status_code=404, detail="Vehicle profile not found in Supabase")


@app.post("/api/route/evaluate-streamlined")
async def evaluate_streamlined_route(payload: StreamlinedRouteRequest):
    user_row = None
    if supabase_client is not None:
        try:
            res = supabase_client.table("vehicle_profiles").select("*").eq("user_id", payload.user_id).execute()
            if res.data:
                user_row = res.data[0]
        except Exception:
            pass

    if not user_row:
        user_row = _in_memory_profiles.get(payload.user_id)

    if not user_row:
        raise HTTPException(status_code=404, detail="User vehicle profile not configured.")

    variant = VEHICLE_VARIANTS_DB.get(user_row["variant_id"])
    if not variant:
        variant = VEHICLE_VARIANTS_DB["nexon_ev_lr"]

    calibration = CalibrationFactors(
        driver_aggression_factor=user_row.get("driver_aggression_factor", 1.0),
        crr_offset=user_row.get("crr_offset", 0.0),
        calibrated_capacity_kwh=user_row.get("calibrated_capacity_kwh", variant.usable_capacity_kwh),
        trips_completed=user_row.get("trips_completed", 0),
        confidence_score=user_row.get("confidence_score", 0.35),
    )

    # 2. Retrieve geospatial routing, elevations, corridor chargers, and live weather
    coords_2d = await geo_service.fetch_route_geometry(
        payload.origin_lat, payload.origin_lon, payload.dest_lat, payload.dest_lon
    )
    mid_lat = (payload.origin_lat + payload.dest_lat) / 2.0
    mid_lon = (payload.origin_lon + payload.dest_lon) / 2.0

    elevations, candidate_chargers, weather_profile = await asyncio.gather(
        geo_service.fetch_elevation_profile(coords_2d),
        geo_service.fetch_chargers_along_corridor(mid_lat, mid_lon, route_coords=coords_2d),
        weather_service.fetch_corridor_weather(coords_2d),
    )

    coords_3d = [[lat, lon, ele] for (lat, lon), ele in zip(coords_2d, elevations)]
    avg_temp = sum(w["temp_c"] for w in weather_profile) / max(1, len(weather_profile))

    # 3. Execute physics engine using user-specific calibration factors
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

    response_dict = report.model_dump()
    response_dict["route_geometry"] = coords_2d
    response_dict["route_coordinates"] = coords_2d
    response_dict["calibration_status"] = calibration.model_dump()
    return response_dict


@app.post("/api/trip/close")
async def close_trip_and_calibrate(payload: TripClosureRecord):
    user_row = None
    if supabase_client is not None:
        try:
            res = supabase_client.table("vehicle_profiles").select("*").eq("user_id", payload.user_id).execute()
            if res.data:
                user_row = res.data[0]
        except Exception:
            pass

    if not user_row:
        user_row = _in_memory_profiles.get(payload.user_id)

    if not user_row:
        raise HTTPException(status_code=404, detail="Vehicle profile not found")

    # 2. Execute grey-box EMA parameter tuning
    update_payload = execute_grey_box_calibration(
        user_row=user_row,
        predicted_soc=payload.predicted_final_soc,
        actual_soc=payload.actual_final_soc,
        initial_soc=payload.initial_soc,
        gross_energy_kwh=payload.gross_predicted_energy_kwh,
        distance_km=payload.distance_km,
    )

    # 3. Update vehicle_profiles in Supabase or memory
    user_row.update(update_payload)
    _in_memory_profiles[payload.user_id] = user_row

    if supabase_client is not None:
        try:
            supabase_client.table("vehicle_profiles").update(update_payload).eq("user_id", payload.user_id).execute()
            soc_variance = round(payload.predicted_final_soc - payload.actual_final_soc, 2)
            supabase_client.table("trip_logs").insert({
                "user_id": payload.user_id,
                "origin_name": payload.origin_name,
                "destination_name": payload.destination_name,
                "distance_km": payload.distance_km,
                "gross_energy_kwh": payload.gross_predicted_energy_kwh,
                "initial_soc": payload.initial_soc,
                "predicted_soc": payload.predicted_final_soc,
                "actual_soc": payload.actual_final_soc,
                "soc_variance": soc_variance,
            }).execute()
        except Exception:
            pass

    return user_row


@app.get("/api/geocode")
async def geocode_query(q: str):
    """Search places, cities, and landmarks via OpenStreetMap Nominatim."""
    return await geo_service.search_locations(query=q)


@app.get("/api/chargers")
async def get_chargers(lat: float = 13.3409, lon: float = 74.7858, distance_km: float = 25.0):
    return await geo_service.fetch_chargers_along_corridor(lat, lon, radius_m=int(distance_km * 1000))


@app.post("/api/route/evaluate")
async def evaluate_route_endpoint(payload: RouteSimulationRequest):
    try:
        # Resolve starting SoC
        soc_start = payload.starting_soc if payload.starting_soc is not None else payload.initial_soc_percent

        # Resolve coordinates from either direct floats or origin/destination objects
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
            # Step 1: Fetch real road geometries from OSRM
            coords_2d = await geo_service.fetch_route_geometry(orig_lat, orig_lon, dest_lat, dest_lon)
            if len(coords_2d) < 2:
                raise HTTPException(
                    status_code=503,
                    detail="A road route could not be retrieved. Please try again.",
                )

            # Step 2: Fetch 3D elevations, candidate chargers, and live weather in parallel along the whole corridor
            mid_lat = (orig_lat + dest_lat) / 2.0
            mid_lon = (orig_lon + dest_lon) / 2.0

            elevations, candidate_chargers, weather_profile = await asyncio.gather(
                geo_service.fetch_elevation_profile(coords_2d),
                geo_service.fetch_chargers_along_corridor(mid_lat, mid_lon, route_coords=coords_2d),
                weather_service.fetch_corridor_weather(coords_2d),
            )

            # Step 3: Combine coordinates into 3D representation [[lat, lon, ele], ...]
            coords_3d = [
                [lat, lon, ele]
                for (lat, lon), ele in zip(coords_2d, elevations)
            ]
        elif payload.coordinates and len(payload.coordinates) >= 2:
            coords_3d = payload.coordinates
            coords_2d = [(p[0], p[1]) for p in coords_3d]
            candidate_chargers, weather_profile = await asyncio.gather(
                geo_service.fetch_chargers_along_corridor(coords_3d[0][0], coords_3d[0][1]),
                weather_service.fetch_corridor_weather(coords_2d),
            )
        else:
            raise HTTPException(
                status_code=422,
                detail="Choose an origin and destination before calculating a route.",
            )

        # Step 4: Run continuous multi-force physics & RCSP constraint solver
        engine = UniversalEVPhysicsEngine(
            vehicle_model_id=payload.vehicle_model,
            passengers=payload.passengers,
            ambient_temp_c=payload.ambient_temp_c,
            vehicle_age_years=payload.vehicle_age_years,
            odometer_km=payload.odometer_km,
        )

        physics_report: RoutePhysicsSummary = engine.evaluate_route(
            coordinates_3d=coords_3d,
            weather_profile=weather_profile,
            coord_order=payload.coord_order,
            initial_soc_percent=soc_start,
            candidate_chargers=candidate_chargers,
        )

        # Step 5: Generate instant, deterministic telematics briefing
        briefing_data = {
            "vehicle_name": engine.specs.name,
            "passengers": payload.passengers,
            "ambient_temp_c": payload.ambient_temp_c,
            "total_distance_km": physics_report.total_distance_km,
            "net_energy_kwh": physics_report.net_energy_kwh,
            "gross_regenerated_kwh": physics_report.gross_regenerated_kwh,
            "max_uphill_gradient_percent": physics_report.max_uphill_gradient_percent,
            "max_downhill_gradient_percent": physics_report.max_downhill_gradient_percent,
            "final_soc_percent": physics_report.final_soc_percent,
            "reserve_breached": physics_report.reserve_breached,
            "planned_stops": [stop.model_dump() for stop in physics_report.planned_stops],
            "battery_health": physics_report.battery_health.model_dump() if physics_report.battery_health else None,
            "weather_impact": physics_report.weather_impact.model_dump() if physics_report.weather_impact else None,
        }

        response = physics_report.model_dump()
        response["driver_briefing"] = generate_fleet_briefing(briefing_data)
        response["route_geometry"] = coords_2d
        # Format for Leaflet polyline: [[lon, lat], ...]
        response["route_coordinates"] = [[pt[1], pt[0]] for pt in coords_2d]
        response["available_chargers"] = candidate_chargers
        response["charging_stops"] = [stop.model_dump() for stop in physics_report.planned_stops]

        return response

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class EmergencyDivertRequest(BaseModel):
    current_lat: float
    current_lon: float
    current_soc_percent: float
    vehicle_model: str = "tata_nexon_ev"
    passengers: int = 2
    ambient_temp_c: float = 32.0
    vehicle_age_years: float = 0.0
    odometer_km: Optional[float] = None


class EmergencyChargerCandidate(BaseModel):
    station_id: str
    name: str
    distance_km: float
    arrival_soc_percent: float
    is_reachable: bool
    recommended_eco_speed_kmh: float
    power_kw: float
    coordinates: List[float]


@app.post("/api/route/emergency-divert", response_model=List[EmergencyChargerCandidate])
async def emergency_divert_endpoint(payload: EmergencyDivertRequest):
    try:
        # 1. Query physical charging stations around the user's live GPS position
        chargers = await geo_service.fetch_chargers_along_corridor(
            payload.current_lat, payload.current_lon, radius_m=35000
        )
        if not chargers:
            return []

        # Filter / sort by proximity so we evaluate candidate stations closest to the user
        chargers_with_dist = []
        for chg in chargers:
            dist = GeographyService.haversine_m(
                payload.current_lat, payload.current_lon, chg["lat"], chg["lon"]
            )
            chargers_with_dist.append((dist, chg))
        chargers_with_dist.sort(key=lambda x: x[0])
        candidate_chargers = [c[1] for c in chargers_with_dist[:8]]

        engine = UniversalEVPhysicsEngine(
            vehicle_model_id=payload.vehicle_model,
            passengers=payload.passengers,
            ambient_temp_c=payload.ambient_temp_c,
            vehicle_age_years=payload.vehicle_age_years,
            odometer_km=payload.odometer_km,
        )

        results: List[EmergencyChargerCandidate] = []

        # 2. Evaluate physical reachability for candidate stations
        for chg in candidate_chargers[:5]:
            coords_2d = await geo_service.fetch_route_geometry(
                payload.current_lat, payload.current_lon, chg["lat"], chg["lon"]
            )
            if not coords_2d or len(coords_2d) < 2:
                coords_2d = [
                    (payload.current_lat, payload.current_lon),
                    (chg["lat"], chg["lon"]),
                ]
            elevations = await geo_service.fetch_elevation_profile(coords_2d)
            if not elevations or len(elevations) != len(coords_2d):
                elevations = [25.0] * len(coords_2d)
            coords_3d = [[lat, lon, ele] for (lat, lon), ele in zip(coords_2d, elevations)]

            # First pass: standard highway cruising speed (60 km/h)
            normal_sim = engine.evaluate_route(
                coordinates_3d=coords_3d,
                cruising_speed_kmh=60.0,
                initial_soc_percent=payload.current_soc_percent,
            )

            arrival_soc = normal_sim.final_soc_percent
            is_reachable = arrival_soc > 1.0
            eco_speed = 60.0

            # Second pass: check if dropping speed to 40 km/h reduces aerodynamic drag enough to reach it
            if not is_reachable:
                eco_sim = engine.evaluate_route(
                    coordinates_3d=coords_3d,
                    cruising_speed_kmh=40.0,
                    initial_soc_percent=payload.current_soc_percent,
                )
                if eco_sim.final_soc_percent > 1.0:
                    is_reachable = True
                    arrival_soc = eco_sim.final_soc_percent
                    eco_speed = 40.0

            results.append(
                EmergencyChargerCandidate(
                    station_id=str(chg.get("id", f"sos_{chg['lat']}_{chg['lon']}")),
                    name=chg.get("name", "Corridor EV Fast Charger"),
                    distance_km=round(normal_sim.total_distance_km, 1),
                    arrival_soc_percent=round(arrival_soc, 1),
                    is_reachable=is_reachable,
                    recommended_eco_speed_kmh=eco_speed,
                    power_kw=float(chg.get("power_kw", 50.0)),
                    coordinates=[float(chg["lat"]), float(chg["lon"])],
                )
            )

        # Sort with reachable candidates first, ordered by highest arrival battery reserve
        results.sort(key=lambda x: (x.is_reachable, x.arrival_soc_percent), reverse=True)
        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
