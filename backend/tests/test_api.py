"""
Consolidated Test Suite for Location-Agnostic EV Physics & Gradient Engine
and Decoupled CrewAI Driver Briefings.
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(backend_dir))
sys.path.insert(0, backend_dir)

from backend.app.main import app, SAMPLE_ROUTE_COORDINATES
from backend.app.physics import UniversalEVPhysicsEngine, EV_MODELS

client = TestClient(app)


def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


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
    # Very low initial SoC (5%) should trigger reserve_breached
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
    assert data["reserve_breached"] is True


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


def test_valhalla_status_and_polyline():
    from backend.services.valhalla import decode_valhalla_polyline

    # Test status endpoint returns graceful response even when container is stopped
    res = client.get("/api/valhalla/status")
    assert res.status_code == 200
    assert "available" in res.json()

    # Test polyline decoder
    # Simple encoded shape for ~ (38.5, -120.2)
    coords = decode_valhalla_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", precision=1e5)
    assert len(coords) >= 2
    assert isinstance(coords[0][0], float)
    assert isinstance(coords[0][1], float)

