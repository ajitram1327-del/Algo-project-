"""
OpenStreetMap Overpass API EV Charger Discovery Service
Queries nearby charging stations using OSM amenity=charging_station nodes and ways.
"""

import math
import httpx
from typing import Optional, List, Dict, Any

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates ground distance between two points in meters."""
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


async def find_nearby_chargers(
    user_lat: float,
    user_lon: float,
    radius_meters: int = 25000
) -> List[Dict[str, Any]]:
    """
    Queries Overpass API for EV charging stations around coordinates
    and returns them sorted from closest to farthest.
    """
    query = f"""
    [out:json][timeout:20];
    (
      node["amenity"="charging_station"](around:{radius_meters},{user_lat},{user_lon});
      way["amenity"="charging_station"](around:{radius_meters},{user_lat},{user_lon});
    );
    out center tags;
    """

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(OVERPASS_ENDPOINT, data={"data": query})
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[Overpass warning] Failed to query Overpass API: {e}")
        return []

    chargers = []
    for elem in data.get("elements", []):
        tags = elem.get("tags", {})

        # Nodes provide 'lat'/'lon'; ways provide center coordinates under 'center'
        station_lat = elem.get("lat") or elem.get("center", {}).get("lat")
        station_lon = elem.get("lon") or elem.get("center", {}).get("lon")

        if not station_lat or not station_lon:
            continue

        dist_m = haversine_distance_m(user_lat, user_lon, station_lat, station_lon)

        # Parse power / socket details if tagged
        raw_power = (
            tags.get("capacity:kw")
            or tags.get("socket:type2_combo:output")
            or tags.get("output")
            or 50.0
        )
        try:
            power_kw = float(str(raw_power).lower().replace("kw", "").strip())
        except (ValueError, TypeError):
            power_kw = 50.0

        chargers.append({
            "id": f"{elem.get('type', 'node')}/{elem.get('id', '')}",
            "name": tags.get("name") or tags.get("operator") or "Public EV Charger",
            "operator": tags.get("operator", "Unknown"),
            "lat": float(station_lat),
            "lon": float(station_lon),
            "distance_km": round(dist_m / 1000.0, 2),
            "distance_m": round(dist_m, 1),
            "capacity": tags.get("capacity", "1"),
            "power_kw": power_kw,
            "socket_types": [
                k.replace("socket:", "")
                for k in tags.keys()
                if k.startswith("socket:") and tags[k] not in ("no", "0")
            ],
            "fee": tags.get("fee", "yes"),
            "source": "OpenStreetMap Overpass",
        })

    # Sort ascending by distance
    chargers.sort(key=lambda c: c["distance_m"])
    return chargers
