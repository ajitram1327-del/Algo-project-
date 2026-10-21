"""
Focused Test Suite for EV Route Optimization API.
Covers:
1. Request validation (SoC, temperature, passenger boundaries)
2. Fallback route shape and GeoJSON coordinate integrity
3. Physics-aware energy and SoC estimation logic
4. Health check and vehicle catalog endpoints
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from main import app
from models import Vehicle, RouteRequest
from services.physics_estimator import calculate_physics_energy_estimate
from services.chargetrip import ChargetripService, DEMO_VEHICLES
from services.ai_agent import _generate_deterministic_briefing, _enforce_three_sentences

client = TestClient(app)


# -------------------------------------------------------------
# 1. Health & Vehicle Endpoints
# -------------------------------------------------------------
def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "chargetrip_configured" in data
    assert "openai_configured" in data
    assert data["default_origin"]["lat"] == 13.3409
    assert data["default_destination"]["lat"] == 13.3490


def test_vehicles_endpoint():
    response = client.get("/api/vehicles")
    assert response.status_code == 200
    vehicles = response.json()
    assert isinstance(vehicles, list)
    assert len(vehicles) >= 3
    # Check shape of vehicle
    v0 = vehicles[0]
    assert "id" in v0
    assert "make" in v0
    assert "model" in v0
    assert "battery_usable_kwh" in v0
    assert "nominal_range_km" in v0


# -------------------------------------------------------------
# 2. Request Validation Tests
# -------------------------------------------------------------
def test_route_request_valid():
    payload = {
        "vehicle_id": "demo-tata-nexon-ev",
        "temperature_c": 32.0,
        "passengers": 3,
        "current_soc": 55.0,
        "origin_lat": 13.3409,
        "origin_lng": 74.7858,
        "dest_lat": 13.3490,
        "dest_lng": 74.7003,
    }
    response = client.post("/api/route", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["is_fallback"] is True
    assert "Manipal" in data["origin_name"]
    assert "Malpe" in data["destination_name"]


def test_route_request_invalid_soc():
    payload = {
        "vehicle_id": "demo-tata-nexon-ev",
        "temperature_c": 25.0,
        "passengers": 2,
        "current_soc": 110.0,  # Invalid: > 100%
    }
    response = client.post("/api/route", json=payload)
    assert response.status_code == 422


def test_route_request_invalid_passengers():
    payload = {
        "vehicle_id": "demo-tata-nexon-ev",
        "temperature_c": 25.0,
        "passengers": 0,  # Invalid: < 1
        "current_soc": 50.0,
    }
    response = client.post("/api/route", json=payload)
    assert response.status_code == 422


def test_route_request_invalid_temperature():
    payload = {
        "vehicle_id": "demo-tata-nexon-ev",
        "temperature_c": 70.0,  # Invalid: > 55°C
        "passengers": 2,
        "current_soc": 50.0,
    }
    response = client.post("/api/route", json=payload)
    assert response.status_code == 422


# -------------------------------------------------------------
# 3. GeoJSON Coordinate Integrity & Fallback Route Shape
# -------------------------------------------------------------
def test_fallback_route_geojson_order():
    payload = {
        "vehicle_id": "demo-mg-zs-ev",
        "temperature_c": 28.0,
        "passengers": 2,
        "current_soc": 40.0,
    }
    response = client.post("/api/route", json=payload)
    assert response.status_code == 200
    data = response.json()

    geom = data["geometry"]
    assert geom["type"] == "LineString"
    coordinates = geom["coordinates"]
    assert len(coordinates) >= 10

    # Ensure GeoJSON coordinate order is [longitude, latitude]
    for point in coordinates:
        assert len(point) == 2
        lng, lat = point[0], point[1]
        # In Karnataka coastal area, longitude is ~74.7x and latitude is ~13.3x
        assert 74.65 <= lng <= 74.85, f"Expected longitude near 74.7x, got {lng}"
        assert 13.30 <= lat <= 13.40, f"Expected latitude near 13.3x, got {lat}"

    # Origin should be near Manipal (74.78x, 13.34x)
    assert abs(coordinates[0][0] - 74.7858) < 0.02
    assert abs(coordinates[0][1] - 13.3409) < 0.02

    # Destination should be near Malpe Beach (74.70x, 13.34x)
    assert abs(coordinates[-1][0] - 74.7003) < 0.02
    assert abs(coordinates[-1][1] - 13.3490) < 0.02


def test_charging_stop_trigger_on_low_soc():
    # When initial SoC is low (10%), a charging stop should be recommended
    payload = {
        "vehicle_id": "demo-tata-nexon-ev",
        "temperature_c": 30.0,
        "passengers": 2,
        "current_soc": 10.0,
    }
    response = client.post("/api/route", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert len(data["charging_stops"]) >= 1
    stop = data["charging_stops"][0]
    assert stop["is_mock"] is True
    # Stop coordinates must also be [longitude, latitude]
    assert 74.65 <= stop["coordinates"][0] <= 74.85
    assert 13.30 <= stop["coordinates"][1] <= 13.40
    assert len(data["warnings"]) >= 1


# -------------------------------------------------------------
# 4. Physics-Aware Estimation Logic
# -------------------------------------------------------------
def test_physics_estimator_effects():
    vehicle = DEMO_VEHICLES[0]  # Tata Nexon EV (13.8 kWh/100km, 40.5 kWh battery)
    distance = 12.2

    # Baseline at 22°C (optimal) and 1 passenger
    est_base = calculate_physics_energy_estimate(
        vehicle=vehicle,
        distance_km=distance,
        temperature_c=22.0,
        passengers=1,
        current_soc=50.0,
    )
    assert est_base.temp_impact_pct == 0.0
    assert est_base.passenger_impact_pct == 0.0
    # Manipal to Malpe is downhill (-72m), so elevation work is negative (regen recovery)
    assert est_base.elevation_gain_loss_kwh < 0

    # High temperature test (40°C)
    est_hot = calculate_physics_energy_estimate(
        vehicle=vehicle,
        distance_km=distance,
        temperature_c=40.0,
        passengers=1,
        current_soc=50.0,
    )
    assert est_hot.temp_impact_pct > 0
    assert est_hot.net_energy_kwh > est_base.net_energy_kwh

    # High passenger count test (5 passengers)
    est_loaded = calculate_physics_energy_estimate(
        vehicle=vehicle,
        distance_km=distance,
        temperature_c=22.0,
        passengers=5,
        current_soc=50.0,
    )
    assert est_loaded.passenger_impact_pct > 0
    assert est_loaded.net_energy_kwh > est_base.net_energy_kwh


# -------------------------------------------------------------
# 5. Driver Briefing Sentence Count Enforcement
# -------------------------------------------------------------
def test_driver_briefing_sentence_count():
    vehicle = DEMO_VEHICLES[0]
    est = calculate_physics_energy_estimate(vehicle, 12.2, 30.0, 2, 50.0)
    text = _generate_deterministic_briefing(
        vehicle=vehicle,
        distance_km=12.2,
        current_soc=50.0,
        physics_estimate=est,
        charging_stops=[],
        temperature_c=30.0,
        passengers=2,
    )

    enforced = _enforce_three_sentences(text, text)
    import re
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", enforced.strip()) if s.strip()]
    assert len(sentences) == 3, f"Expected exactly 3 sentences, got {len(sentences)}"
