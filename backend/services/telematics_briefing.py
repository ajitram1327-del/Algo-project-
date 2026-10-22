"""
Deterministic Fleet Telematics Briefing Engine
Generates instantaneous operational debriefs from physical simulation metrics.
Zero external LLM dependencies, zero latency, and zero runtime failures.
"""

from typing import Dict, Any, List


def generate_fleet_briefing(payload: Dict[str, Any]) -> str:
    vehicle_name = payload.get("vehicle_name", "Electric Vehicle")
    passengers = payload.get("passengers", 1)
    ambient_temp = payload.get("ambient_temp_c", 30.0)
    distance_km = payload.get("total_distance_km", 0.0)
    net_kwh = payload.get("net_energy_kwh", 0.0)
    regen_kwh = payload.get("gross_regenerated_kwh", 0.0)
    final_soc = payload.get("final_soc_percent", 0.0)
    reserve_breached = payload.get("reserve_breached", False)
    planned_stops: List[Dict[str, Any]] = payload.get("planned_stops", [])
    max_uphill = payload.get("max_uphill_gradient_percent", 0.0)
    max_downhill = payload.get("max_downhill_gradient_percent", 0.0)

    briefing_parts = [
        f"Route completed for {vehicle_name} carrying {passengers} passenger(s) under {ambient_temp}°C ambient conditions. "
        f"Across {distance_km:.1f} km, net traction and auxiliary demand was {net_kwh:.2f} kWh, "
        f"recovering {regen_kwh:.2f} kWh via regenerative braking across road gradients ranging from {max_downhill:.1f}% to +{max_uphill:.1f}%."
    ]

    if reserve_breached and planned_stops:
        stop = planned_stops[0]
        stop_name = stop.get("name", "Highway Fast Charger")
        stop_km = stop.get("distance_along_route_km", 0.0)
        arrival_soc = stop.get("arrival_soc_percent", 0.0)
        dwell_mins = stop.get("charge_duration_mins", 0.0)
        added_kwh = stop.get("energy_added_kwh", 0.0)

        briefing_parts.append(
            f"The 10.0% battery reserve threshold was reached at km {stop_km:.1f} ({arrival_soc:.1f}% SoC). "
            f"To satisfy the reachability constraint, a mandatory charging stop was scheduled at '{stop_name}' "
            f"for ~{dwell_mins:.1f} mins (+{added_kwh:.1f} kWh replenished to 80.0%), securing arrival at {final_soc:.1f}% SoC."
        )
    else:
        briefing_parts.append(
            f"Battery reserve remained intact above the 10.0% threshold throughout the corridor. "
            f"Destination reached directly with {final_soc:.1f}% SoC without requiring en-route replenishment."
        )

    return " ".join(briefing_parts)
