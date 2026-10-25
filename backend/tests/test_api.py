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
from backend.app.physics import UniversalEVPhysicsEngine, EV_MODELS, estimate_battery_soh
from backend.services.weather import WeatherService

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


def test_emergency_divert_endpoint():
    payload = {
        "current_lat": 13.3409,
        "current_lon": 74.7858,
        "current_soc_percent": 25.0,
        "vehicle_model": "tata_nexon_ev",
        "passengers": 2,
        "ambient_temp_c": 32.0,
    }
    res = client.post("/api/route/emergency-divert", json=payload)
    assert res.status_code == 200
    candidates = res.json()
    assert isinstance(candidates, list)
    if candidates:
        first = candidates[0]
        assert "station_id" in first
        assert "is_reachable" in first
        assert "arrival_soc_percent" in first
        assert "recommended_eco_speed_kmh" in first
        assert "power_kw" in first
        assert "coordinates" in first


def test_battery_soh_and_degradation():
    # Brand new vehicle
    soh_new = estimate_battery_soh(vehicle_age_years=0.0, odometer_km=0.0, battery_chemistry="LFP")
    assert soh_new == 100.0

    # 3-year-old vehicle with 45,000 km
    soh_aged_lfp = estimate_battery_soh(vehicle_age_years=3.0, odometer_km=45000.0, battery_chemistry="LFP", ambient_temp_c=30.0)
    assert 85.0 <= soh_aged_lfp < 100.0

    # Compare LFP vs NMC under hot ambient (NMC degrades faster in tropical heat)
    soh_aged_nmc = estimate_battery_soh(vehicle_age_years=3.0, odometer_km=45000.0, battery_chemistry="NMC", ambient_temp_c=35.0)
    assert soh_aged_nmc < soh_aged_lfp

    # High mileage vehicle test
    soh_heavy = estimate_battery_soh(vehicle_age_years=8.0, odometer_km=180000.0, battery_chemistry="LFP")
    assert soh_heavy >= 65.0  # Respects 65% floor


def test_route_evaluate_with_aged_battery():
    payload = {
        "vehicle_model": "tata_nexon_ev",
        "passengers": 2,
        "ambient_temp_c": 32.0,
        "initial_soc_percent": 60.0,
        "vehicle_age_years": 4.0,
        "odometer_km": 60000.0,
        "coordinates": SAMPLE_ROUTE_COORDINATES,
        "coord_order": "lat_lon_ele",
    }
    res = client.post("/api/route/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "battery_health" in data
    bh = data["battery_health"]
    assert bh["vehicle_age_years"] == 4.0
    assert bh["odometer_km"] == 60000.0
    assert bh["estimated_soh_percent"] < 100.0
    assert bh["effective_usable_capacity_kwh"] < bh["nominal_capacity_kwh"]
    assert bh["capacity_lost_kwh"] > 0
    assert bh["impedance_loss_factor"] < 1.0


def test_weather_bearing_calculation():
    # Due North
    b_north = WeatherService.calculate_bearing_deg(10.0, 75.0, 11.0, 75.0)
    assert round(b_north) == 0 or round(b_north) == 360

    # Due East
    b_east = WeatherService.calculate_bearing_deg(10.0, 75.0, 10.0, 76.0)
    assert abs(b_east - 90.0) < 1.0

    # Due South
    b_south = WeatherService.calculate_bearing_deg(11.0, 75.0, 10.0, 75.0)
    assert abs(b_south - 180.0) < 1.0


def test_weather_physics_wind_and_rain():
    engine = UniversalEVPhysicsEngine(vehicle_model_id="tata_nexon_ev")
    
    # Baseline calm & dry
    calm_weather = [
        {"temp_c": 28.0, "precip_mm": 0.0, "wind_speed_kmh": 0.0, "wind_dir_deg": 0.0}
        for _ in range(len(SAMPLE_ROUTE_COORDINATES))
    ]
    report_calm = engine.evaluate_route(
        coordinates_3d=SAMPLE_ROUTE_COORDINATES,
        weather_profile=calm_weather,
        cruising_speed_kmh=65.0,
        initial_soc_percent=80.0,
    )

    # Adverse stormy weather (heavy rain + headwind from west 270° towards Manipal->Malpe route which heads west)
    storm_weather = [
        {"temp_c": 28.0, "precip_mm": 4.5, "wind_speed_kmh": 40.0, "wind_dir_deg": 270.0}
        for _ in range(len(SAMPLE_ROUTE_COORDINATES))
    ]
    report_storm = engine.evaluate_route(
        coordinates_3d=SAMPLE_ROUTE_COORDINATES,
        weather_profile=storm_weather,
        cruising_speed_kmh=65.0,
        initial_soc_percent=80.0,
    )

    # Adverse weather should result in higher net consumption
    assert report_storm.net_energy_kwh > report_calm.net_energy_kwh
    assert report_storm.weather_impact is not None
    assert report_storm.weather_impact.wet_route_percentage == 100.0
    assert report_storm.weather_impact.extra_weather_energy_kwh > 0.0
    assert any(pt.road_condition == "heavy_rain" for pt in report_storm.telemetry_profile)
    assert any(pt.dynamic_crr > 0.012 for pt in report_storm.telemetry_profile)


def test_user_profile_and_streamlined_route():
    # 1. Register vehicle profile
    profile_payload = {
        "user_id": "test_user_123",
        "variant_id": "nexon_ev_lr",
        "registration_year": 2024,
        "odometer_km": 15000.0,
    }
    res = client.post("/api/user/profile", json=profile_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["user_id"] == "test_user_123"
    assert data["variant_id"] == "nexon_ev_lr"
    assert data["calibrated_capacity_kwh"] > 35.0

    # 2. Get profile
    res_get = client.get("/api/user/profile/test_user_123")
    assert res_get.status_code == 200
    assert res_get.json()["user_id"] == "test_user_123"

    # 3. Streamlined evaluation
    stream_payload = {
        "user_id": "test_user_123",
        "origin_lat": 13.3525,
        "origin_lon": 74.7865,
        "dest_lat": 13.3540,
        "dest_lon": 74.7003,
        "current_soc_percent": 75.0,
        "passengers": 2,
    }
    res_route = client.post("/api/route/evaluate-streamlined", json=stream_payload)
    assert res_route.status_code == 200
    route_data = res_route.json()
    assert route_data["total_distance_km"] > 0
    assert "calibration_status" in route_data
    assert route_data["calibration_status"]["driver_aggression_factor"] == 1.0


def test_trip_closure_and_calibration():
    # Register user
    client.post("/api/user/profile", json={
        "user_id": "driver_alpha",
        "variant_id": "tiago_ev_lr",
        "registration_year": 2023,
        "odometer_km": 20000.0,
    })

    # Close trip where actual SoC is lower than predicted (higher consumption)
    trip_record = {
        "trip_id": "trip_001",
        "user_id": "driver_alpha",
        "predicted_final_soc": 55.0,
        "actual_final_soc": 50.0,  # 5% deficit
        "initial_soc": 80.0,
        "distance_km": 45.0,
        "gross_predicted_energy_kwh": 6.8,
        "origin_name": "Manipal",
        "destination_name": "Mangalore",
    }
    res = client.post("/api/trip/close", json=trip_record)
    assert res.status_code == 200
    updated = res.json()
    assert updated["trips_completed"] == 1
    assert updated["current_odometer_km"] == 20045.0
    # Driver aggression should scale up because battery depleted faster than anticipated
    assert updated["driver_aggression_factor"] > 1.0


def test_nearby_chargers_endpoint():
    res = client.get("/api/chargers/nearby?lat=13.3412&lon=74.7478&radius_km=25")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "chargers" in data
    assert len(data["chargers"]) > 0
    first = data["chargers"][0]
    assert "name" in first
    assert "lat" in first
    assert "lon" in first
    assert "power_kw" in first








