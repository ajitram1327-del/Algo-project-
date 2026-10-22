"""
FastAPI Server for Physics-Aware EV Route Optimization
"""

import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

try:
    from backend.app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from backend.services.geography import GeographyService
    from backend.services.telematics_briefing import generate_fleet_briefing
except ImportError:
    from app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from services.geography import GeographyService
    from services.telematics_briefing import generate_fleet_briefing

app = FastAPI(
    title="Intelligent EV Charger Recommendation API",
    description="Physics-Aware Route Optimization & Telematics System",
    version="2.0.0",
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
    return [
        {
            "id": k,
            "name": v.name,
            "battery_kwh": v.battery_capacity_kwh,
            "battery_capacity_kwh": v.battery_capacity_kwh,
            "curb_weight_kg": v.curb_weight_kg,
            "max_charge_power_kw": v.max_charge_power_kw,
            "max_regen_kw": v.max_regen_power_kw,
        }
        for k, v in EV_MODELS.items()
    ]


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

            # Step 2: Fetch 3D elevations and candidate chargers in parallel
            mid_lat = (orig_lat + dest_lat) / 2.0
            mid_lon = (orig_lon + dest_lon) / 2.0

            elevations, candidate_chargers = await asyncio.gather(
                geo_service.fetch_elevation_profile(coords_2d),
                geo_service.fetch_chargers_along_corridor(mid_lat, mid_lon),
            )

            # Step 3: Combine coordinates into 3D representation [[lat, lon, ele], ...]
            coords_3d = [
                [lat, lon, ele]
                for (lat, lon), ele in zip(coords_2d, elevations)
            ]
        elif payload.coordinates and len(payload.coordinates) >= 2:
            coords_3d = payload.coordinates
            coords_2d = [(p[0], p[1]) for p in coords_3d]
            candidate_chargers = await geo_service.fetch_chargers_along_corridor(coords_3d[0][0], coords_3d[0][1])
        else:
            # Default fallback corridor: Manipal to Malpe
            coords_3d = [
                [13.3525, 74.7865, 82.0],
                [13.3510, 74.7780, 72.0],
                [13.3500, 74.7700, 34.0],
                [13.3480, 74.7650, 28.0],
                [13.3440, 74.7500, 22.0],
                [13.3540, 74.7003, 3.0],
            ]
            coords_2d = [(p[0], p[1]) for p in coords_3d]
            candidate_chargers = await geo_service.fetch_chargers_along_corridor(13.3525, 74.7865)

        # Step 4: Run continuous multi-force physics & RCSP constraint solver
        engine = UniversalEVPhysicsEngine(
            vehicle_model_id=payload.vehicle_model,
            passengers=payload.passengers,
            ambient_temp_c=payload.ambient_temp_c,
        )

        physics_report: RoutePhysicsSummary = engine.evaluate_route(
            coordinates_3d=coords_3d,
            coord_order=payload.coord_order,
            initial_soc_percent=soc_start,
            candidate_chargers=candidate_chargers,
        )

        # Step 5: Generate instant, deterministic telematics briefing
        briefing_data = {
            "vehicle_name": EV_MODELS.get(payload.vehicle_model, EV_MODELS["tata_nexon_ev"]).name,
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
        }

        response = physics_report.model_dump()
        response["driver_briefing"] = generate_fleet_briefing(briefing_data)
        response["route_geometry"] = coords_2d
        # Format for Leaflet polyline: [[lon, lat], ...]
        response["route_coordinates"] = [[pt[1], pt[0]] for pt in coords_2d]

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/route/briefing")
def get_briefing(req: BriefingRequest):
    vehicle = EV_MODELS.get(req.vehicle_model, EV_MODELS["tata_nexon_ev"])
    briefing_data = {
        "vehicle_name": vehicle.name,
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
