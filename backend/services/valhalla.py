"""
Valhalla Routing & 3D Elevation Client
Communicates with self-hosted Valhalla instance at http://localhost:8002
"""

import os
import math
from typing import List, Dict, Any, Optional
import httpx

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002").rstrip("/")


def decode_valhalla_polyline(encoded: str, precision: float = 1e6) -> List[List[float]]:
    """
    Decodes a Valhalla encoded polyline string (default precision 1e6) into [[lat, lon], ...].
    """
    coords = []
    index, lat, lng = 0, 0, 0
    length = len(encoded)

    while index < length:
        shift, result = 0, 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        shift, result = 0, 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coords.append([lat / precision, lng / precision])

    return coords


async def check_valhalla_status() -> Dict[str, Any]:
    """
    Check if the local Valhalla container is up and responsive.
    Fast timeout so we never block when container is compiling.
    """
    try:
        async with httpx.AsyncClient(timeout=0.8) as client:
            res = await client.get(f"{VALHALLA_URL}/status")
            if res.status_code == 200:
                return {"available": True, "data": res.json()}
    except Exception as e:
        return {"available": False, "error": str(e)}
    return {"available": False}


async def get_elevation_profile(coordinates: List[List[float]]) -> List[float]:
    """
    Queries Valhalla's /height endpoint to retrieve elevations (in meters) for coordinates [[lat, lon], ...].
    """
    if not coordinates:
        return []

    status = await check_valhalla_status()
    if not status.get("available"):
        return [0.0] * len(coordinates)

    # Valhalla expects [{"lat": ..., "lon": ...}, ...]
    shape = [{"lat": round(p[0], 6), "lon": round(p[1], 6)} for p in coordinates]

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.post(
                f"{VALHALLA_URL}/height",
                json={"shape": shape, "range": False},
            )
            if res.status_code == 200:
                data = res.json()
                heights = data.get("heights", [])
                return [float(h if h is not None else 0.0) for h in heights]
    except Exception as err:
        print(f"[Valhalla /height warning] {err}")

    return [0.0] * len(coordinates)


async def get_valhalla_route_3d(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    costing: str = "auto",
) -> Optional[List[List[float]]]:
    """
    Requests a route from Valhalla and pairs each point with its 3D elevation profile:
    Returns [[lat, lon, elevation_m], ...] ready for UniversalEVPhysicsEngine.
    """
    # Fast check: skip immediately if Valhalla is compiling
    status = await check_valhalla_status()
    if not status.get("available"):
        return None

    payload = {
        "locations": [
            {"lat": origin_lat, "lon": origin_lon},
            {"lat": dest_lat, "lon": dest_lon},
        ],
        "costing": costing,
        "directions_options": {"units": "kilometers"},
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.post(f"{VALHALLA_URL}/route", json=payload)
            if res.status_code != 200:
                return None

            data = res.json()
            trip = data.get("trip", {})
            legs = trip.get("legs", [])
            if not legs:
                return None

            encoded_shape = legs[0].get("shape", "")
            if not encoded_shape:
                return None

            # Decode 2D path
            coords_2d = decode_valhalla_polyline(encoded_shape, precision=1e6)
            if not coords_2d:
                return None

            # Batch elevation lookup
            elevations = await get_elevation_profile(coords_2d)

            # Combine into 3D coordinates [lat, lon, elevation]
            coords_3d = []
            for i, pt in enumerate(coords_2d):
                ele = elevations[i] if i < len(elevations) else 0.0
                coords_3d.append([pt[0], pt[1], ele])

            return coords_3d
    except Exception as err:
        print(f"[Valhalla /route warning] {err}")
        return None
