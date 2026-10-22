"""
Consolidated FastAPI Backend
Serves vehicle profiles, rapid physics-aware route evaluations with telemetry,
and decoupled async CrewAI driver briefings.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Any, Tuple
import uvicorn
from dotenv import load_dotenv

load_dotenv()

try:
    from backend.app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from backend.services.ai_agent import generate_driver_briefing
    from backend.services.openchargemap import fetch_ocm_chargers
    from backend.services.valhalla import check_valhalla_status, get_valhalla_route_3d
    from backend.services.overpass import find_nearby_chargers
    from backend.services.geocoding import (
        search_locations,
        get_osrm_route,
        get_osrm_route_2d,
        fetch_elevations_for_route,
    )
except ImportError:
    from app.physics import UniversalEVPhysicsEngine, EV_MODELS, RoutePhysicsSummary
    from services.ai_agent import generate_driver_briefing
    from services.openchargemap import fetch_ocm_chargers
    from services.valhalla import check_valhalla_status, get_valhalla_route_3d
    from services.overpass import find_nearby_chargers
    from services.geocoding import (
        search_locations,
        get_osrm_route,
        get_osrm_route_2d,
        fetch_elevations_for_route,
    )

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
    starting_soc: Optional[float] = None
    coordinates: Optional[List[List[float]]] = None
    coord_order: str = "lat_lon_ele"
    use_valhalla: bool = False
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    origin: Optional[Any] = None
    destination: Optional[Any] = None


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


@app.get("/api/chargers")
async def get_chargers(
    lat: float = 13.3409,
    lon: float = 74.7858,
    distance_km: float = 25.0,
    source: str = "all",
):
    """
    Returns nearby EV charging stations using Open Charge Map API,
    OpenStreetMap Overpass API, or corridor fallback stations.
    """
    if source == "overpass":
        return await find_nearby_chargers(user_lat=lat, user_lon=lon, radius_meters=int(distance_km * 1000))
    
    if source == "ocm":
        return await fetch_ocm_chargers(lat=lat, lon=lon, distance_km=distance_km)

    # Combined mode ("all")
    ocm_list = await fetch_ocm_chargers(lat=lat, lon=lon, distance_km=distance_km)
    try:
        overpass_list = await find_nearby_chargers(user_lat=lat, user_lon=lon, radius_meters=int(distance_km * 1000))
    except Exception:
        overpass_list = []

    # Merge avoiding duplicate coords
    seen_coords = set()
    combined = []

    for c in ocm_list + overpass_list:
        coord_key = (round(c.get("lat", 0), 3), round(c.get("lon", 0), 3))
        if coord_key not in seen_coords:
            seen_coords.add(coord_key)
            combined.append(c)

    return combined


@app.get("/api/chargers/overpass")
async def get_overpass_chargers(
    lat: float = 13.3409,
    lon: float = 74.7858,
    radius_meters: int = 25000,
):
    """
    Direct endpoint for OpenStreetMap Overpass charging station discovery.
    """
    return await find_nearby_chargers(user_lat=lat, user_lon=lon, radius_meters=radius_meters)


@app.get("/api/chargers/nearest")
async def get_nearest_charger(lat: float, lon: float, radius_km: float = 25.0):
    try:
        chargers = await find_nearby_chargers(lat, lon, radius_meters=int(radius_km * 1000))
        return {
            "origin": {"lat": lat, "lon": lon},
            "closest_station": chargers[0] if chargers else None,
            "all_stations": chargers,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/valhalla/status")
async def get_valhalla_status():
    """
    Checks health and readiness of the self-hosted Valhalla container.
    """
    return await check_valhalla_status()


@app.get("/api/geocode")
async def geocode_query(q: str):
    """
    Search places, cities, and landmarks via OpenStreetMap Nominatim.
    """
    results = await search_locations(query=q)
    return results


@app.post("/api/route/evaluate", response_model=RoutePhysicsSummary)
async def evaluate_route(req: RouteRequest):
    coords = req.coordinates
    
    # Resolve starting SoC
    soc_start = req.starting_soc if req.starting_soc is not None else req.initial_soc_percent

    # Resolve origin & dest coordinates from either direct floats or origin/destination objects
    orig_lat, orig_lon = req.origin_lat, req.origin_lon
    dest_lat, dest_lon = req.dest_lat, req.dest_lon

    if isinstance(req.origin, (list, tuple)) and len(req.origin) >= 2:
        orig_lat, orig_lon = float(req.origin[0]), float(req.origin[1])
    elif isinstance(req.origin, dict):
        orig_lat = float(req.origin.get("lat") or req.origin.get("latitude") or 0.0)
        orig_lon = float(req.origin.get("lon") or req.origin.get("longitude") or 0.0)

    if isinstance(req.destination, (list, tuple)) and len(req.destination) >= 2:
        dest_lat, dest_lon = float(req.destination[0]), float(req.destination[1])
    elif isinstance(req.destination, dict):
        dest_lat = float(req.destination.get("lat") or req.destination.get("latitude") or 0.0)
        dest_lon = float(req.destination.get("lon") or req.destination.get("longitude") or 0.0)

    if orig_lat and orig_lon and dest_lat and dest_lon:
        # 1. Attempt high-resolution 3D routing from local Valhalla if active
        valhalla_coords = await get_valhalla_route_3d(
            origin_lat=orig_lat,
            origin_lon=orig_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
        )
        if valhalla_coords and len(valhalla_coords) >= 2:
            coords = valhalla_coords
        else:
            # 2. Get 2D road geometry from OSRM: [(lat1, lon1), (lat2, lon2), ...]
            coords_2d = await get_osrm_route_2d(orig_lat, orig_lon, dest_lat, dest_lon)
            
            # Sub-sample raw OSRM steps if very long (batch limit safety)
            step = max(1, len(coords_2d) // 45)
            sampled_2d = coords_2d[::step]
            if sampled_2d[-1] != coords_2d[-1]:
                sampled_2d.append(coords_2d[-1])

            # 3. Get elevations via Open Elevation API (with graceful fallback)
            elevations = await fetch_elevations_for_route(sampled_2d)

            # 4. Combine into 3D coordinates: [[lat, lon, ele], ...]
            coords = [
                [lat, lon, ele]
                for (lat, lon), ele in zip(sampled_2d, elevations)
            ]

    if not coords or len(coords) < 2:
        coords = SAMPLE_ROUTE_COORDINATES

    try:
        engine = UniversalEVPhysicsEngine(
            vehicle_model_id=req.vehicle_model,
            passengers=req.passengers,
            ambient_temp_c=req.ambient_temp_c,
        )
        
        # Discover chargers along the corridor for intelligent recharge planning
        ref_lat = orig_lat or coords[0][0]
        ref_lon = orig_lon or coords[0][1]
        try:
            chargers = await fetch_ocm_chargers(lat=ref_lat, lon=ref_lon, distance_km=50.0)
        except Exception:
            chargers = []

        summary = engine.evaluate_route(
            coordinates_3d=coords,
            coord_order=req.coord_order,
            initial_soc_percent=soc_start,
            available_chargers=chargers,
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
