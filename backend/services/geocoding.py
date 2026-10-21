"""
Geocoding & Location Search Service using OpenStreetMap Nominatim and SRTM Elevation
"""

import httpx
from typing import List, Dict, Any, Optional

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
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


async def fetch_elevations_for_coordinates(coords_lat_lon: List[List[float]]) -> List[float]:
    """
    Fetches real 90m SRTM digital elevation data using Open-Meteo elevation API
    for a list of [[lat, lon], ...] coordinates.
    """
    if not coords_lat_lon:
        return []

    try:
        lats = ",".join(str(round(p[0], 5)) for p in coords_lat_lon)
        lons = ",".join(str(round(p[1], 5)) for p in coords_lat_lon)
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/elevation",
                params={"latitude": lats, "longitude": lons},
            )
            if resp.status_code == 200:
                elevations = resp.json().get("elevation", [])
                if len(elevations) == len(coords_lat_lon):
                    return [float(e if e is not None else 0.0) for e in elevations]
    except Exception as e:
        print(f"[Elevation lookup warning] {e}")

    return [0.0] * len(coords_lat_lon)


async def get_osrm_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> Optional[List[List[float]]]:
    """
    Queries OSRM driving API and merges with real SRTM elevation data.
    Returns sampled [[lat, lon, elevation_m], ...] coordinates ready for physics evaluation.
    """
    url = f"https://router.project-osrm.org/route/v1/driving/{origin_lon},{origin_lat};{dest_lon},{dest_lat}?overview=full&geometries=geojson"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers=HEADERS)
            if resp.status_code == 200:
                data = resp.json()
                routes = data.get("routes", [])
                if routes:
                    # GeoJSON is [lon, lat]
                    raw_coords = routes[0].get("geometry", {}).get("coordinates", [])
                    if len(raw_coords) >= 2:
                        # Downsample to ~35-45 nodes for responsive micro-segment physics
                        step = max(1, len(raw_coords) // 40)
                        sampled = raw_coords[::step]
                        if sampled[-1] != raw_coords[-1]:
                            sampled.append(raw_coords[-1])

                        # Convert to [lat, lon]
                        lat_lons = [[pt[1], pt[0]] for pt in sampled]

                        # Fetch actual terrain elevations for the route
                        elevations = await fetch_elevations_for_coordinates(lat_lons)

                        # Merge into 3D points [lat, lon, elevation]
                        coords_3d = []
                        for i, (lat, lon) in enumerate(lat_lons):
                            ele = elevations[i] if i < len(elevations) else 0.0
                            coords_3d.append([lat, lon, ele])

                        return coords_3d
    except Exception as e:
        print(f"[OSRM routing error] {e}")

    return None
