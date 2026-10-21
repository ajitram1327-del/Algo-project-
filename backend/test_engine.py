"""
Comprehensive test script for EV Physics-Aware Route Optimization.
Tests:
1. Physics Engine calculations (traction, downhill regen, flat ground)
2. Graph integrity (15 nodes, 3 charging stations, connectivity)
3. RCSP algorithm with both high battery (no stop needed) and low battery (mandatory charging stop)
4. FastAPI endpoint execution
"""

import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.physics import PhysicsEngine
from app.graph import build_manipal_malpe_graph, get_graph_summary
from app.algorithm import RCSPRouter
from app.main import app
from fastapi.testclient import TestClient


def test_physics():
    print("--- [1] Testing Physics Engine ---")
    pe = PhysicsEngine()

    # Case A: Flat road 5 km at 50 km/h
    e_flat = pe.calculate_segment_energy(distance_km=5.0, elevation_change_m=0.0, speed_kmh=50.0)
    soc_delta_flat = pe.calculate_soc_delta(e_flat)
    print(f"Flat 5km @ 50km/h: Energy = {e_flat:.4f} kWh, SoC Delta = {soc_delta_flat:.2f}%")
    assert e_flat > 0, "Flat segment must consume positive energy"

    # Case B: Steep uphill 2 km (+100m) @ 40 km/h
    e_uphill = pe.calculate_segment_energy(distance_km=2.0, elevation_change_m=100.0, speed_kmh=40.0)
    print(f"Uphill 2km (+100m) @ 40km/h: Energy = {e_uphill:.4f} kWh")
    assert e_uphill > e_flat * 0.4, "Uphill segment must consume significant gravitational energy"

    # Case C: Steep downhill 2 km (-100m) @ 40 km/h
    e_downhill = pe.calculate_segment_energy(distance_km=2.0, elevation_change_m=-100.0, speed_kmh=40.0)
    soc_delta_down = pe.calculate_soc_delta(e_downhill)
    print(f"Downhill 2km (-100m) @ 40km/h: Energy = {e_downhill:.4f} kWh, SoC Delta = {soc_delta_down:.2f}%")
    assert e_downhill < e_flat * 0.4, "Downhill segment must have lower energy / regenerative gain"
    print("Physics Engine tests PASSED!\n")


def test_graph():
    print("--- [2] Testing Synthetic Graph ---")
    g = build_manipal_malpe_graph()
    summary = get_graph_summary(g)

    print(f"Total Nodes: {g.number_of_nodes()}")
    print(f"Total Directed Edges: {g.number_of_edges()}")
    stations = summary["charging_stations"]
    print(f"Charging Stations ({len(stations)}): {[s['id'] + ': ' + s['name'] for s in stations]}")

    assert g.number_of_nodes() == 15, f"Expected 15 nodes, got {g.number_of_nodes()}"
    assert len(stations) == 3, f"Expected 3 charging stations, got {len(stations)}"
    assert "N0" in g and "N14" in g, "Start (N0) or Dest (N14) missing in graph"
    print("Graph tests PASSED!\n")


def test_rcsp_scenarios():
    print("--- [3] Testing RCSP Algorithm Scenarios ---")
    g = build_manipal_malpe_graph()
    pe = PhysicsEngine()
    router = RCSPRouter(graph=g, physics_engine=pe, min_reserve_soc=10.0, target_charge_soc=80.0)

    # Scenario 1: Abundant Battery (80%) -> Should reach destination directly with 0 charging stops
    res_high = router.find_optimal_route(start_node="N0", dest_node="N14", initial_soc=80.0)
    assert res_high is not None, "High SoC route must be feasible"
    assert len(res_high["charging_stops"]) == 0, "High SoC should not stop to charge"
    print(f"[Scenario 1: High Battery (80%)]")
    print(f"  Path: {' -> '.join(res_high['path'])}")
    print(f"  Total Distance: {res_high['total_distance_km']} km")
    print(f"  Final SoC: {res_high['final_soc']}% (Initial: 80%)")
    print(f"  Charging Stops: {len(res_high['charging_stops'])}")

    # Scenario 2: Low Battery (11.0%) -> With 10% reserve threshold and ~1.6% trip consumption,
    # vehicle cannot complete trip without dropping below 10%, so it MUST charge!
    res_low = router.find_optimal_route(start_node="N0", dest_node="N14", initial_soc=11.0)
    assert res_low is not None, "Low SoC route should find charging stop and succeed"
    assert len(res_low["charging_stops"]) >= 1, "Low SoC must make at least one charging stop"
    print(f"\n[Scenario 2: Low Battery (11.0%)]")
    print(f"  Path: {' -> '.join(res_low['path'])}")
    print(f"  Total Distance: {res_low['total_distance_km']} km")
    print(f"  Final SoC: {res_low['final_soc']}%")
    print(f"  Charging Stops: {res_low['charging_stops']}")

    print("\nRCSP Algorithm tests PASSED!\n")


def test_fastapi_endpoints():
    print("--- [4] Testing FastAPI Endpoints ---")
    client = TestClient(app)

    # Health check
    res = client.get("/health")
    assert res.status_code == 200
    print(f"GET /health: {res.json()}")

    # Graph endpoint
    res_graph = client.get("/graph")
    assert res_graph.status_code == 200
    graph_data = res_graph.json()
    print(f"GET /graph: {graph_data['node_count']} nodes, {len(graph_data['charging_stations'])} charging stations")

    # Route calculation endpoint
    payload = {
        "start_node": "N0",
        "destination_node": "N14",
        "current_battery_soc": 18.0,
        "min_reserve_soc": 10.0,
        "target_charge_soc": 80.0,
    }
    res_route = client.post("/calculate-route", json=payload)
    assert res_route.status_code == 200
    route_json = res_route.json()
    print(f"POST /calculate-route: Feasible={route_json['feasible']}, Distance={route_json['total_distance_km']}km, Stops={len(route_json['charging_stops'])}, ExecTime={route_json['execution_time_ms']}ms")
    print("FastAPI endpoints test PASSED!\n")


if __name__ == "__main__":
    test_physics()
    test_graph()
    test_rcsp_scenarios()
    test_fastapi_endpoints()
    print("ALL TESTS COMPLETED SUCCESSFULLY!")
