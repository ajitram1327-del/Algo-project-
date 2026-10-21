"""
Geocoding & Location Search Service using OpenStreetMap Nominatim
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


async def get_osrm_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> Optional[List[List[float]]]:
    """
    Queries OSRM public routing API and returns sampled [[lat, lon, ele], ...] coordinates.
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
                        # Downsample to ~30-50 nodes if very long for fast physics evaluation
                        step = max(1, len(raw_coords) // 40)
                        sampled = raw_coords[::step]
                        if sampled[-1] != raw_coords[-1]:
                            sampled.append(raw_coords[-1])
                        
                        # Return in [lat, lon, ele] format
                        return [[pt[1], pt[0], 0.0] for pt in sampled]
    except Exception as e:
        print(f"[OSRM routing error] {e}")

    return None
