"""
Chargetrip GraphQL API Client and Fallback Routing Engine.
Connects to https://api.chargetrip.io/graphql for live vehicle lookup and route generation.
Gracefully falls back to deterministic local demonstration data when unconfigured or unreachable.
"""

import os
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
import httpx

from models import Vehicle, ChargingStop, GeoJSONGeometry

logger = logging.getLogger("chargetrip")

CHARGETRIP_GRAPHQL_URL = "https://api.chargetrip.io/graphql"

# Built-in demo vehicles for fallback or when Chargetrip credentials are not provided
DEMO_VEHICLES: List[Vehicle] = [
    Vehicle(
        id="demo-tata-nexon-ev",
        make="Tata",
        model="Nexon EV",
        version="Empowered+ LR (40.5 kWh)",
        battery_usable_kwh=40.5,
        battery_full_kwh=40.5,
        nominal_range_km=325.0,
        consumption_kwh_per_100km=13.8,
        image_url="https://images.unsplash.com/photo-1563720223185-11003d516935?w=400&q=80",
        is_demo=True,
    ),
    Vehicle(
        id="demo-mg-zs-ev",
        make="MG",
        model="ZS EV",
        version="Excite / Exclusive (50.3 kWh)",
        battery_usable_kwh=50.3,
        battery_full_kwh=50.3,
        nominal_range_km=360.0,
        consumption_kwh_per_100km=14.5,
        image_url="https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=400&q=80",
        is_demo=True,
    ),
    Vehicle(
        id="demo-hyundai-ioniq5",
        make="Hyundai",
        model="Ioniq 5",
        version="Long Range RWD (72.6 kWh)",
        battery_usable_kwh=70.0,
        battery_full_kwh=72.6,
        nominal_range_km=481.0,
        consumption_kwh_per_100km=16.8,
        image_url="https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=400&q=80",
        is_demo=True,
    ),
    Vehicle(
        id="demo-tesla-model3",
        make="Tesla",
        model="Model 3",
        version="Standard Range Plus (60 kWh)",
        battery_usable_kwh=57.5,
        battery_full_kwh=60.0,
        nominal_range_km=491.0,
        consumption_kwh_per_100km=14.2,
        image_url="https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&q=80",
        is_demo=True,
    ),
    Vehicle(
        id="demo-mahindra-xuv400",
        make="Mahindra",
        model="XUV400",
        version="EL Pro (39.4 kWh)",
        battery_usable_kwh=39.4,
        battery_full_kwh=39.4,
        nominal_range_km=315.0,
        consumption_kwh_per_100km=14.0,
        image_url="https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=400&q=80",
        is_demo=True,
    ),
]

# High-fidelity road coordinates from Manipal to Malpe Beach in GeoJSON [longitude, latitude] format
FALLBACK_ROUTE_COORDINATES: List[List[float]] = [
    [74.7858, 13.3409],  # Manipal Center
    [74.7842, 13.3435],  # Syndicate Circle Link
    [74.7818, 13.3482],  # Coin Circle
    [74.7775, 13.3520],  # Laxmindra Nagar Descent
    [74.7712, 13.3515],  # Indrali Approach
    [74.7640, 13.3502],  # Indrali Railway Bypass
    [74.7570, 13.3475],  # Kalsanka Junction
    [74.7495, 13.3430],  # Udupi City Bus Stand Arterial
    [74.7425, 13.3395],  # Bannanje Cross
    [74.7380, 13.3380],  # Karavali Bypass (Charging station area)
    [74.7295, 13.3368],  # Adi Udupi Link
    [74.7210, 13.3388],  # Kallianpur Road Link
    [74.7135, 13.3422],  # Malpe Coastal Road
    [74.7065, 13.3455],  # Malpe Port Cross
    [74.7003, 13.3490],  # Malpe Beach Sea Walk
]

# Realistic EV charging stations situated along the Manipal-to-Malpe highway corridor
ALL_CORRIDOR_CHARGING_STATIONS: List[ChargingStop] = [
    ChargingStop(
        id="station-indrali-hub",
        name="Indrali EV Fast Hub",
        coordinates=[74.7620, 13.3515],  # [lng, lat]
        power_kw=60.0,
        arrival_soc=22.0,
        departure_soc=80.0,
        charge_time_min=24.0,
        energy_added_kwh=23.5,
        is_mock=True,
    ),
    ChargingStop(
        id="mock-karavali-ev-plaza",
        name="Karavali Highway Supercharge Plaza",
        coordinates=[74.7380, 13.3380],  # [lng, lat]
        power_kw=120.0,
        arrival_soc=14.5,
        departure_soc=80.0,
        charge_time_min=16.8,
        energy_added_kwh=26.5,
        is_mock=True,
    ),
    ChargingStop(
        id="station-malpe-port",
        name="Malpe Port Coastal Fast Charger",
        coordinates=[74.7100, 13.3450],  # [lng, lat]
        power_kw=50.0,
        arrival_soc=12.0,
        departure_soc=80.0,
        charge_time_min=32.0,
        energy_added_kwh=27.5,
        is_mock=True,
    ),
]

FALLBACK_CHARGING_STATIONS: List[ChargingStop] = [ALL_CORRIDOR_CHARGING_STATIONS[1]]

# GraphQL queries
VEHICLE_LIST_QUERY = """
query getVehicleList($page: Int, $size: Int, $search: String) {
  vehicleList(page: $page, size: $size, search: $search) {
    id
    naming {
      make
      model
      version
      edition
    }
    battery {
      usable_kwh
      full_kwh
    }
    range {
      chargetrip_range {
        best
        worst
      }
    }
    media {
      image {
        thumbnail_url
        url
      }
    }
  }
}
"""

NEW_ROUTE_MUTATION = """
mutation newRoute($input: RouteInput!) {
  newRoute(input: $input)
}
"""

GET_ROUTE_QUERY = """
query getRoute($id: ID!) {
  route(id: $id) {
    id
    status
    route {
      distance
      duration
      charges
      polyline
      legs {
        distance
        duration
        origin {
          geometry {
            coordinates
          }
        }
        destination {
          geometry {
            coordinates
          }
        }
        station {
          name
          power
          coordinates
        }
      }
    }
  }
}
"""


class ChargetripService:
    """
    Handles communication with Chargetrip GraphQL API.
    Provides automatic fallback to deterministic academic demo route when unconfigured.
    """

    def __init__(self):
        self.timeout = httpx.Timeout(connect=6.0, read=12.0, write=6.0, pool=10.0)

    @property
    def client_id(self) -> str:
        return os.getenv("CHARGETRIP_CLIENT_ID", "").strip()

    @property
    def app_id(self) -> str:
        return os.getenv("CHARGETRIP_APP_ID", "").strip()

    @property
    def is_configured(self) -> bool:
        """Checks if valid Chargetrip credentials are configured."""
        return bool(self.client_id and self.app_id and self.client_id != "your_chargetrip_client_id_here")

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-client-id": self.client_id,
            "x-app-id": self.app_id,
        }

    async def get_vehicles(self) -> List[Vehicle]:
        """
        Fetches vehicle fleet from Chargetrip.
        If credentials missing or API fails, returns clearly identified demo vehicle fleet.
        """
        if not self.is_configured:
            logger.info("Chargetrip not configured. Returning deterministic demo fleet.")
            return DEMO_VEHICLES

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    CHARGETRIP_GRAPHQL_URL,
                    json={
                        "query": VEHICLE_LIST_QUERY,
                        "variables": {"page": 0, "size": 15},
                    },
                    headers=self._get_headers(),
                )

                if response.status_code == 200:
                    payload = response.json()
                    data = payload.get("data", {})
                    v_list = data.get("vehicleList") or []

                    vehicles: List[Vehicle] = []
                    for item in v_list:
                        naming = item.get("naming") or {}
                        battery = item.get("battery") or {}
                        range_data = item.get("range", {}).get("chargetrip_range") or {}
                        media = item.get("media", {}).get("image") or {}

                        usable_kwh = float(battery.get("usable_kwh") or 50.0)
                        full_kwh = float(battery.get("full_kwh") or usable_kwh)
                        best_range = float(range_data.get("best") or 350.0)
                        # Estimate consumption in kWh/100km
                        consumption = round((usable_kwh / max(best_range, 50.0)) * 100.0, 1)

                        vehicles.append(
                            Vehicle(
                                id=item.get("id", f"ct-{len(vehicles)}"),
                                make=naming.get("make") or "EV",
                                model=naming.get("model") or "Vehicle",
                                version=naming.get("version") or naming.get("edition"),
                                battery_usable_kwh=usable_kwh,
                                battery_full_kwh=full_kwh,
                                nominal_range_km=best_range,
                                consumption_kwh_per_100km=consumption,
                                image_url=media.get("thumbnail_url") or media.get("url"),
                                is_demo=False,
                            )
                        )

                    if vehicles:
                        return vehicles

        except Exception as e:
            logger.warning(f"Chargetrip vehicle list request failed: {e}. Falling back to demo fleet.")

        return DEMO_VEHICLES

    def get_vehicle_by_id(self, vehicle_id: str, fleet: List[Vehicle]) -> Vehicle:
        """Finds vehicle in fleet or defaults to first vehicle."""
        for v in fleet:
            if v.id == vehicle_id:
                return v
        return DEMO_VEHICLES[0]

    async def calculate_route(
        self,
        vehicle: Vehicle,
        current_soc: float,
        temperature_c: float,
        passengers: int,
        origin_lat: float,
        origin_lng: float,
        dest_lat: float,
        dest_lng: float,
    ) -> Dict[str, Any]:
        """
        Attempts to request and poll Chargetrip for live route calculation.
        Gracefully falls back to deterministic local route if unconfigured or API fails.
        """
        if not self.is_configured or vehicle.is_demo:
            logger.info("Using deterministic local route demonstration (Chargetrip unconfigured or demo vehicle).")
            return self._get_fallback_route(
                vehicle=vehicle,
                current_soc=current_soc,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
                dest_lat=dest_lat,
                dest_lng=dest_lng,
            )

        try:
            # Prepare Chargetrip RouteInput
            route_input = {
                "vehicle": vehicle.id,
                "origin": {
                    "type": "Point",
                    "coordinates": [origin_lng, origin_lat],
                },
                "destination": {
                    "type": "Point",
                    "coordinates": [dest_lng, dest_lat],
                },
                "charge_level": {
                    "current": {"percentage": current_soc},
                },
            }

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # 1. Trigger new route calculation
                resp = await client.post(
                    CHARGETRIP_GRAPHQL_URL,
                    json={"query": NEW_ROUTE_MUTATION, "variables": {"input": route_input}},
                    headers=self._get_headers(),
                )

                if resp.status_code == 200:
                    payload = resp.json()
                    route_id = payload.get("data", {}).get("newRoute")

                    if route_id:
                        # 2. Bounded polling for route completion (max 5 attempts, 1.2s sleep)
                        for attempt in range(5):
                            await asyncio.sleep(1.2)
                            poll_resp = await client.post(
                                CHARGETRIP_GRAPHQL_URL,
                                json={"query": GET_ROUTE_QUERY, "variables": {"id": route_id}},
                                headers=self._get_headers(),
                            )

                            if poll_resp.status_code == 200:
                                poll_data = poll_resp.json().get("data", {}).get("route", {})
                                status = poll_data.get("status")

                                if status == "done":
                                    route_obj = poll_data.get("route", {})
                                    return self._parse_chargetrip_route(route_obj, vehicle)
                                elif status in ("error", "not_found"):
                                    logger.warning(f"Chargetrip route status: {status}")
                                    break
        except Exception as err:
            logger.warning(f"Chargetrip route calculation error: {err}. Using deterministic fallback.")

        return self._get_fallback_route(
            vehicle=vehicle,
            current_soc=current_soc,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
        )

    def _get_fallback_route(
        self,
        vehicle: Vehicle,
        current_soc: float,
        origin_lat: float,
        origin_lng: float,
        dest_lat: float,
        dest_lng: float,
    ) -> Dict[str, Any]:
        """
        Returns a deterministic, high-accuracy fallback route from Manipal to Malpe Beach.
        Clearly tags the result with is_fallback=True and data_source details.
        """
        distance_km = 12.2
        duration_min = 22.0

        # Decide whether charging stop is needed based on vehicle battery capacity & current SoC
        # At 12.2 km, typical EV consumes ~1.8 kWh (~3-5% of battery)
        stops: List[ChargingStop] = []
        if current_soc < 15.0:
            # Low battery: recommended stop at Karavali Bypass
            stops = FALLBACK_CHARGING_STATIONS

        return {
            "is_fallback": True,
            "data_source": "Deterministic Local Demonstration Engine (Manipal to Malpe Route)",
            "status": "success",
            "distance_km": distance_km,
            "duration_min": duration_min,
            "geometry": GeoJSONGeometry(
                type="LineString",
                coordinates=FALLBACK_ROUTE_COORDINATES,
            ),
            "charging_stops": stops,
            "available_charging_stations": ALL_CORRIDOR_CHARGING_STATIONS,
            "origin_coordinates": [origin_lng, origin_lat],
            "destination_coordinates": [dest_lng, dest_lat],
            "origin_name": "Manipal (Tiger Circle / Academic Plateau)",
            "destination_name": "Malpe Beach (Sea Walk Promenade)",
        }

    def _parse_chargetrip_route(self, route_obj: Dict[str, Any], vehicle: Vehicle) -> Dict[str, Any]:
        """Parses live Chargetrip route payload into application domain model."""
        distance_meters = float(route_obj.get("distance") or 12200.0)
        duration_seconds = float(route_obj.get("duration") or 1320.0)
        distance_km = round(distance_meters / 1000.0, 2)
        duration_min = round(duration_seconds / 60.0, 1)

        # Legs and charging stations
        charging_stops: List[ChargingStop] = []
        coordinates: List[List[float]] = []

        legs = route_obj.get("legs") or []
        for idx, leg in enumerate(legs):
            dest_coords = leg.get("destination", {}).get("geometry", {}).get("coordinates")
            if dest_coords and len(dest_coords) >= 2:
                coordinates.append([float(dest_coords[0]), float(dest_coords[1])])

            station = leg.get("station")
            if station:
                st_coords = station.get("coordinates") or [74.7380, 13.3380]
                charging_stops.append(
                    ChargingStop(
                        id=f"live-station-{idx}",
                        name=station.get("name") or f"Chargetrip Fast Charger #{idx+1}",
                        coordinates=[float(st_coords[0]), float(st_coords[1])],
                        power_kw=float(station.get("power") or 60.0),
                        arrival_soc=20.0,
                        departure_soc=80.0,
                        charge_time_min=20.0,
                        energy_added_kwh=25.0,
                        is_mock=False,
                    )
                )

        if not coordinates:
            coordinates = FALLBACK_ROUTE_COORDINATES

        return {
            "is_fallback": False,
            "data_source": "Chargetrip Live GraphQL API",
            "status": "success",
            "distance_km": distance_km,
            "duration_min": duration_min,
            "geometry": GeoJSONGeometry(type="LineString", coordinates=coordinates),
            "charging_stops": charging_stops,
            "origin_coordinates": coordinates[0],
            "destination_coordinates": coordinates[-1],
            "origin_name": "Manipal",
            "destination_name": "Malpe Beach",
        }
