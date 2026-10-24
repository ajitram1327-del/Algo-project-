"""
Open-Meteo Live Corridor Weather & Road Surface Gateway
Fetches ambient temperature, precipitation, and 10m wind vectors.
Requires zero API keys and supports multi-coordinate batch requests.
"""

import math
from typing import List, Tuple, Dict, Any, Union
import httpx


class WeatherService:
    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    @staticmethod
    def calculate_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculates initial compass heading (0° to 360°) from point 1 to point 2."""
        p1, p2 = math.radians(lat1), math.radians(lat2)
        d_lon = math.radians(lon2 - lon1)
        y = math.sin(d_lon) * math.cos(p2)
        x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(d_lon)
        bearing = math.degrees(math.atan2(y, x))
        return (bearing + 360.0) % 360.0

    async def fetch_corridor_weather(
        self, coordinates_2d: List[Union[Tuple[float, float], List[float]]]
    ) -> List[Dict[str, float]]:
        """
        Samples up to 10 anchor points across the polyline and queries Open-Meteo
        in a single batched HTTP request.
        Coordinates are expected to be (lat, lon).
        """
        n = len(coordinates_2d)
        if n == 0:
            return []

        # Sample 8-10 anchors along the trajectory
        num_anchors = min(10, max(3, n // 20))
        if n <= num_anchors:
            sampled_coords = coordinates_2d
        else:
            indices = [int(i * (n - 1) / (num_anchors - 1)) for i in range(num_anchors)]
            sampled_coords = [coordinates_2d[idx] for idx in indices]

        lats_str = ",".join(f"{float(pt[0]):.4f}" for pt in sampled_coords)
        lons_str = ",".join(f"{float(pt[1]):.4f}" for pt in sampled_coords)

        params = {
            "latitude": lats_str,
            "longitude": lons_str,
            "current": "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m",
        }

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(self.BASE_URL, params=params)
                if res.status_code == 200:
                    data = res.json()
                    items = data if isinstance(data, list) else [data]
                    anchor_weather = []
                    for item in items:
                        curr = item.get("current", {})
                        anchor_weather.append({
                            "temp_c": float(curr.get("temperature_2m", 30.0)),
                            "precip_mm": float(curr.get("precipitation", 0.0)),
                            "wind_speed_kmh": float(curr.get("wind_speed_10m", 0.0)),
                            "wind_dir_deg": float(curr.get("wind_direction_10m", 0.0)),
                        })

                    if anchor_weather:
                        # Interpolate anchor weather across the full coordinates list
                        full_weather = []
                        num_anchors_res = len(anchor_weather)
                        for i in range(n):
                            ratio = i / max(1, n - 1)
                            idx = min(num_anchors_res - 1, int(ratio * num_anchors_res))
                            full_weather.append(anchor_weather[idx])
                        return full_weather
        except Exception:
            pass

        # Resilient neutral weather fallback
        return [
            {
                "temp_c": 30.0,
                "precip_mm": 0.0,
                "wind_speed_kmh": 12.0,
                "wind_dir_deg": 270.0,  # Westerly sea breeze
            }
            for _ in range(n)
        ]
