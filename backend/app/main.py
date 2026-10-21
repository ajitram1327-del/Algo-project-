"""
FastAPI application for EV Physics-Aware Route Optimization.
Endpoints:
- POST /calculate-route : RCSP search with energy consumption and charging stop recommendations.
- GET  /graph           : Detailed nodes, edges, elevations, and charging station data for frontend maps.
- GET  /health          : API status check.
"""

import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.physics import PhysicsEngine
from app.graph import build_manipal_malpe_graph, get_graph_summary
from app.algorithm import RCSPRouter
from app.models import RouteRequest, RouteResponse

app = FastAPI(
    title="Physics-Aware EV Route Optimizer API",
    version="1.0.0",
    description="Deterministic route optimization using vehicle physics, elevation models, and RCSP search.",
)

# Enable CORS for Next.js frontend (default port 3000) and other local clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize global graph and physics engine
graph = build_manipal_malpe_graph()
physics = PhysicsEngine()


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "EV Route Optimization Engine",
        "nodes_loaded": graph.number_of_nodes(),
        "edges_loaded": graph.number_of_edges(),
    }


@app.get("/graph")
def get_graph():
    """
    Returns graph topology, nodes, geographical coordinates, and charging stations.
    Useful for frontend map rendering with react-leaflet.
    """
    return get_graph_summary(graph)


@app.post("/calculate-route", response_model=RouteResponse)
def calculate_route(payload: RouteRequest):
    """
    Computes optimal route between start_node and destination_node
    constrained by EV battery state of charge (SoC) and elevation dynamics.
    """
    start_time = time.perf_counter()

    if payload.start_node not in graph:
        raise HTTPException(
            status_code=400,
            detail=f"Starting node '{payload.start_node}' not found in network graph.",
        )

    if payload.destination_node not in graph:
        raise HTTPException(
            status_code=400,
            detail=f"Destination node '{payload.destination_node}' not found in network graph.",
        )

    router = RCSPRouter(
        graph=graph,
        physics_engine=physics,
        min_reserve_soc=payload.min_reserve_soc,
        target_charge_soc=payload.target_charge_soc,
    )

    result = router.find_optimal_route(
        start_node=payload.start_node,
        dest_node=payload.destination_node,
        initial_soc=payload.current_battery_soc,
    )

    elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    if not result:
        return RouteResponse(
            feasible=False,
            message="No viable route found: Battery state of charge would breach the safety reserve threshold (10%) before reaching destination or an accessible charging station.",
            path=[],
            path_names=[],
            total_distance_km=0.0,
            net_energy_kwh=0.0,
            initial_soc=payload.current_battery_soc,
            final_soc=0.0,
            charging_stops=[],
            segments=[],
            execution_time_ms=elapsed_ms,
        )

    return RouteResponse(
        feasible=True,
        message="Optimal physics-aware route successfully calculated.",
        path=result["path"],
        path_names=result["path_names"],
        total_distance_km=result["total_distance_km"],
        net_energy_kwh=result["net_energy_kwh"],
        initial_soc=result["initial_soc"],
        final_soc=result["final_soc"],
        charging_stops=result["charging_stops"],
        segments=result["segments"],
        execution_time_ms=elapsed_ms,
    )
