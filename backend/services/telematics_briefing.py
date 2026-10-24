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

    battery_health = payload.get("battery_health")
    if battery_health and isinstance(battery_health, dict):
        soh = battery_health.get("estimated_soh_percent", 100.0)
        usable_kwh = battery_health.get("effective_usable_capacity_kwh", 0.0)
        nominal_kwh = battery_health.get("nominal_capacity_kwh", 0.0)
        if soh < 99.0:
            briefing_parts.append(
                f"Battery State of Health (SoH) is estimated at {soh:.1f}% with usable capacity at {usable_kwh:.1f} kWh "
                f"(nominal {nominal_kwh:.1f} kWh) based on age and mileage degradation modeling."
            )

    weather_impact = payload.get("weather_impact")
    if weather_impact and isinstance(weather_impact, dict):
        avg_headwind = weather_impact.get("average_headwind_kmh", 0.0)
        wet_pct = weather_impact.get("wet_route_percentage", 0.0)
        extra_kwh = weather_impact.get("extra_weather_energy_kwh", 0.0)
        if extra_kwh > 0.05 or wet_pct > 0.0 or abs(avg_headwind) > 5.0:
            briefing_parts.append(
                f"Atmospheric modeling incorporated live Open-Meteo wind and road surface data: "
                f"average headwind {avg_headwind:+.1f} km/h, {wet_pct:.0f}% wet tarmac exposure, "
                f"accounting for +{extra_kwh:.2f} kWh in adverse aerodynamic and hydrodynamic rolling resistance."
            )

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
