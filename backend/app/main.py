"""
Consolidated FastAPI Backend
Serves vehicle profiles, rapid physics-aware route evaluations with telemetry,
and decoupled async CrewAI driver briefings.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

try:
    from backend.app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from backend.services.ai_agent import generate_driver_briefing
except ImportError:
    from app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from services.ai_agent import generate_driver_briefing

app = FastAPI(title="Physics-Aware EV Route Engine", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Reference corridor coordinates: Manipal to Malpe Beach with topography
SAMPLE_ROUTE_COORDINATES = [
    [13.3525, 74.7865, 82.0],  # Manipal Syndicate Circle (Ridge)
    [13.3510, 74.7780, 72.0],  # Tiger Circle Descent
    [13.3500, 74.7700, 34.0],  # Indrali Ghat Steep Descent (-5.1% slope)
    [13.3480, 74.7650, 28.0],  # Kalsanka Slope
    [13.3440, 74.7500, 22.0],  # Udupi City Center (Valley)
    [13.3460, 74.7320, 16.0],  # Karavali Junction
    [13.3490, 74.7150, 8.0],   # Kolalgiri Stretch
    [13.3540, 74.7003, 3.0],   # Malpe Beach (Sea level)
]


class RouteRequest(BaseModel):
    vehicle_model: str = "tata_nexon_ev"
    passengers: int = 2
    ambient_temp_c: float = 32.0
    initial_soc_percent: float = 25.0
    coordinates: Optional[List[List[float]]] = None
    coord_order: str = "lat_lon_ele"


class BriefingRequest(BaseModel):
    vehicle_model: str
    passengers: int
    ambient_temp_c: float
    route_summary: dict


@app.get("/health")
def health():
    return {"status": "ok", "service": "EV Physics Routing Engine"}


@app.get("/api/vehicles")
def get_vehicles():
    return [
        {
            "id": k,
            "name": v.name,
            "battery_kwh": v.battery_capacity_kwh,
            "curb_weight_kg": v.curb_weight_kg,
            "max_regen_kw": v.max_regen_power_kw,
        }
        for k, v in EV_MODELS.items()
    ]


@app.post("/api/route/evaluate", response_model=RoutePhysicsSummary)
def evaluate_route(req: RouteRequest):
    coords = req.coordinates if req.coordinates and len(req.coordinates) >= 2 else SAMPLE_ROUTE_COORDINATES
    try:
        engine = UniversalEVPhysicsEngine(
            vehicle_model_id=req.vehicle_model,
            passengers=req.passengers,
            ambient_temp_c=req.ambient_temp_c,
        )
        summary = engine.evaluate_route(
            coordinates_3d=coords,
            coord_order=req.coord_order,
            initial_soc_percent=req.initial_soc_percent,
        )
        return summary
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/route/briefing")
def get_briefing(req: BriefingRequest):
    vehicle = EV_MODELS.get(req.vehicle_model, EV_MODELS["tata_nexon_ev"])
    briefing = generate_driver_briefing(
        route_summary=req.route_summary,
        vehicle_name=vehicle.name,
        passengers=req.passengers,
        ambient_temp=req.ambient_temp_c,
    )
    return {"briefing": briefing}


if __name__ == "__main__":
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
