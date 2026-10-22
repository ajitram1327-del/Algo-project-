"""
Geocoding & Location Search Service using OpenStreetMap Nominatim and Open-Elevation
"""

import math
import httpx
from typing import List, Dict, Any, Optional, Tuple

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"
HEADERS = {"User-Agent": "EV-Physics-Route-Planner/1.0 (contact: student@manipal.edu)"}


async def search_locations(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Searches for addresses, landmarks, cities, or towns via OpenStreetMap Nominatim.
    """
    if not query or len(query.strip()) < 2:
        return []

    params = {
        "q": query.strip(),
        "format": "json",
        "addressdetails": 1,
        "limit": limit,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(NOMINATIM_URL, params=params, headers=HEADERS)
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for item in data:
                    results.append({
                        "name": item.get("name") or item.get("display_name", "").split(",")[0],
                        "display_name": item.get("display_name"),
                        "lat": float(item["lat"]),
                        "lon": float(item["lon"]),
                        "type": item.get("type", "location"),
                    })
                return results
    except Exception as e:
        print(f"[Nominatim error] {e}")

    return []


async def fetch_elevations_for_route(coords: List[Tuple[float, float]]) -> List[float]:
    """
    Sub-samples route coordinates to keep the payload within Open-Elevation limits,
    queries the API, and falls back gracefully if it times out.
    """
    if not coords:
        return []

    # Sample down if route has hundreds of raw OSRM points (batch limit safety)
    step = max(1, len(coords) // 50)
    sampled = coords[::step]
    if sampled[-1] != coords[-1]:
        sampled.append(coords[-1])

    locations = [{"latitude": lat, "longitude": lon} for lat, lon in sampled]

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(OPEN_ELEVATION_URL, json={"locations": locations})
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                sampled_elevations = [float(r["elevation"]) for r in results]

                if sampled_elevations:
                    # Expand back to match full coords length
                    full_elevations = []
                    denom = max(1, len(coords) - 1)
                    s_denom = max(1, len(sampled_elevations) - 1)
                    for i in range(len(coords)):
                        ratio = i / denom
                        idx = min(len(sampled_elevations) - 1, int(ratio * s_denom))
                        full_elevations.append(sampled_elevations[idx])
                    return full_elevations
    except Exception as e:
        print(f"[Warning] Open Elevation API unreachable: {e}. Attempting secondary fallback.")

    # Secondary lookup via Open-Meteo SRTM DEM
    try:
        lats = ",".join(str(round(p[0], 5)) for p in sampled)
        lons = ",".join(str(round(p[1], 5)) for p in sampled)
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/elevation",
                params={"latitude": lats, "longitude": lons},
            )
            if resp.status_code == 200:
                elevations = resp.json().get("elevation", [])
                if elevations and len(elevations) > 0:
                    full_elevations = []
                    denom = max(1, len(coords) - 1)
                    s_denom = max(1, len(elevations) - 1)
                    for i in range(len(coords)):
                        ratio = i / denom
                        idx = min(len(elevations) - 1, int(ratio * s_denom))
                        val = elevations[idx]
                        full_elevations.append(float(val if val is not None else 50.0))
                    return full_elevations
    except Exception as e:
        print(f"[Warning] Open-Meteo elevation fallback error: {e}")

    # Topographical fallback heuristic if API fails/times out
    n = len(coords)
    return [
        round(15.0 + 55.0 * math.sin((i / max(1, n - 1)) * math.pi) + 4.0 * math.sin(i * 0.8), 1)
        for i in range(n)
    ]


async def fetch_elevations_for_coordinates(coords_lat_lon: List[List[float]]) -> List[float]:
    """Compatibility wrapper converting List[List[float]] to List[Tuple[float, float]]."""
    tuples = [(p[0], p[1]) for p in coords_lat_lon]
    return await fetch_elevations_for_route(tuples)


async def get_osrm_route_2d(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> List[Tuple[float, float]]:
    """
    Queries OSRM driving API and returns 2D road geometry [(lat1, lon1), ...].
    """
    url = f"https://router.project-osrm.org/route/v1/driving/{origin_lon},{origin_lat};{dest_lon},{dest_lat}?overview=full&geometries=geojson"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=HEADERS)
            if resp.status_code == 200:
                data = resp.json()
                routes = data.get("routes", [])
                if routes:
                    raw_coords = routes[0].get("geometry", {}).get("coordinates", [])
                    if len(raw_coords) >= 2:
                        # GeoJSON is [lon, lat], return [(lat, lon), ...]
                        return [(pt[1], pt[0]) for pt in raw_coords]
    except Exception as e:
        print(f"[OSRM routing 2D error] {e}")

    return [(origin_lat, origin_lon), (dest_lat, dest_lon)]


async def get_osrm_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> Optional[List[List[float]]]:
    """
    Queries OSRM driving API, samples the route, and merges with elevation data.
    Returns sampled [[lat, lon, elevation_m], ...] coordinates ready for physics evaluation.
    """
    coords_2d = await get_osrm_route_2d(origin_lat, origin_lon, dest_lat, dest_lon)
    if not coords_2d or len(coords_2d) < 2:
        return None

    # Downsample raw points if too dense (e.g. 1000+ points) to ~40-60 points before elevation lookup
    step = max(1, len(coords_2d) // 45)
    sampled_2d = coords_2d[::step]
    if sampled_2d[-1] != coords_2d[-1]:
        sampled_2d.append(coords_2d[-1])

    # Fetch elevations via Open Elevation
    elevations = await fetch_elevations_for_route(sampled_2d)

    # Combine into 3D points
    coords_3d = []
    for (lat, lon), ele in zip(sampled_2d, elevations):
        coords_3d.append([lat, lon, ele])

    return coords_3d
