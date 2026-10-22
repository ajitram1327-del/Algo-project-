"""
Consolidated Test Suite for Location-Agnostic EV Physics & Gradient Engine
and Decoupled CrewAI Driver Briefings.
"""

import sys
import os
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(backend_dir))
sys.path.insert(0, backend_dir)

from backend.app.main import app
from backend.app.physics import UniversalEVPhysicsEngine, EV_MODELS

SAMPLE_ROUTE_COORDINATES = [
    [13.3525, 74.7865, 82.0],
    [13.3510, 74.7780, 72.0],
    [13.3500, 74.7700, 34.0],
    [13.3480, 74.7650, 28.0],
    [13.3440, 74.7500, 22.0],
    [13.3540, 74.7003, 3.0],
]

client = TestClient(app)


def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] in ("ok", "healthy")


def test_get_vehicles():
    res = client.get("/api/vehicles")
    assert res.status_code == 200
    vehicles = res.json()
    assert len(vehicles) >= 4
    ids = [v["id"] for v in vehicles]
    assert "tata_nexon_ev" in ids
    assert "mg_zs_ev" in ids


def test_route_evaluate_physics():
    payload = {
        "vehicle_model": "tata_nexon_ev",
        "passengers": 2,
        "ambient_temp_c": 32.0,
        "initial_soc_percent": 30.0,
        "coordinates": SAMPLE_ROUTE_COORDINATES,
        "coord_order": "lat_lon_ele",
    }
    res = client.post("/api/route/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["total_distance_km"] > 0
    assert data["total_descent_m"] > data["total_climb_m"]  # Manipal to Malpe is net descent
    assert data["gross_regenerated_kwh"] > 0
    assert "telemetry_profile" in data
    assert len(data["telemetry_profile"]) >= 2

    # Check telemetry point attributes
    pt = data["telemetry_profile"][1]
    assert "elevation_m" in pt
    assert "gradient_percent" in pt
    assert "soc_percent" in pt
    assert "is_regenerating" in pt


def test_route_reserve_breach_detection():
    # Very low initial SoC (8%) should trigger dynamic charging stop planning
    payload = {
        "vehicle_model": "tata_tiago_ev",
        "passengers": 4,
        "ambient_temp_c": 40.0,
        "initial_soc_percent": 8.0,
        "coordinates": SAMPLE_ROUTE_COORDINATES,
    }
    res = client.post("/api/route/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["charging_stops"]) >= 1
    assert data["charging_stops"][0]["target_soc_percent"] >= 80.0
    assert data["total_charging_time_minutes"] > 0


def test_driver_briefing_endpoint():
    summary_mock = {
        "total_distance_km": 11.8,
        "total_climb_m": 8.0,
        "total_descent_m": 87.0,
        "max_gradient_percent": 4.2,
        "net_energy_kwh": 1.45,
        "final_soc_percent": 22.5,
        "reserve_breached": False,
    }
    payload = {
        "vehicle_model": "tata_nexon_ev",
        "passengers": 2,
        "ambient_temp_c": 32.0,
        "route_summary": summary_mock,
    }
    res = client.post("/api/route/briefing", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "briefing" in data
    assert len(data["briefing"]) > 10


def test_chargers_endpoint():
    res = client.get("/api/chargers?lat=13.3409&lon=74.7858&distance_km=10")
    assert res.status_code == 200
    assert isinstance(res.json(), list)



