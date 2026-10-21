"""
Deterministic Physics-Aware Energy Estimator.
Computes environmental (temperature), payload (passenger count), and topographical
(elevation gradient) effects on EV battery consumption.

Note:
These calculations are deterministic physics approximations based on empirical EV thermodynamics
and vehicle kinetics. They provide supplemental analysis when routing APIs do not model HVAC or payload loads.
All estimates are explicitly labeled as model approximations.
"""

from typing import Dict, Any, List
from models import PhysicsEstimate, Vehicle


def calculate_physics_energy_estimate(
    vehicle: Vehicle,
    distance_km: float,
    temperature_c: float,
    passengers: int,
    current_soc: float,
    origin_elevation_m: float = 75.0,     # Manipal plateau elevation (~75m)
    dest_elevation_m: float = 3.0,        # Malpe Beach coastal elevation (~3m)
) -> PhysicsEstimate:
    """
    Computes a transparent physics-aware energy estimate for a route segment.

    Assumptions & Formulas:
    1. Base Consumption: Based on manufacturer/Chargetrip rated consumption (kWh/100km).
    2. Temperature Factor:
       - Optimal baseline is 20°C - 24°C (HVAC minimal).
       - T > 25°C: AC compressor & battery cooling draw ~1.5% additional energy per °C above 25°C.
       - T < 20°C: PTC cabin heating & cold electrolyte resistance draw ~1.2% additional energy per °C below 20°C.
    3. Passenger Payload Factor:
       - Standard rating assumes 1 driver (75 kg).
       - Each additional passenger (+75 kg) increases mass against rolling resistance and grade by +2.0% per person.
    4. Elevation Potential & Regenerative Braking:
       - Manipal (75m) to Malpe (3m) is a net descent of -72m.
       - Downhill work W = m * g * delta_h.
       - Regenerative braking recaptures ~70% of downhill potential energy back into the battery pack.
    """
    # 1. Base energy consumption
    base_consumption_per_km = vehicle.consumption_kwh_per_100km / 100.0
    base_energy_kwh = round(base_consumption_per_km * distance_km, 3)

    # 2. Ambient Temperature Impact
    temp_impact_pct = 0.0
    if temperature_c > 25.0:
        # Hot weather: AC active cooling
        temp_impact_pct = round((temperature_c - 25.0) * 1.5, 2)
    elif temperature_c < 20.0:
        # Cold weather: Cabin heater and battery electrolyte resistance
        temp_impact_pct = round((20.0 - temperature_c) * 1.2, 2)

    # 3. Passenger Payload Impact
    # Baseline assumption: 1 occupant (driver). Additional passengers add mass.
    additional_passengers = max(0, passengers - 1)
    passenger_impact_pct = round(additional_passengers * 2.0, 2)

    # Combined HVAC and payload adjusted energy
    adjusted_energy_kwh = base_energy_kwh * (1.0 + (temp_impact_pct + passenger_impact_pct) / 100.0)

    # 4. Topographical Elevation Change & Regenerative Braking
    elevation_delta_m = dest_elevation_m - origin_elevation_m  # Typically -72.0 m for Manipal -> Malpe
    estimated_curb_mass_kg = 1750.0  # Representative medium EV curb weight
    total_mass_kg = estimated_curb_mass_kg + (passengers * 75.0)
    gravity_mps2 = 9.81

    # Work done against gravity: W = m * g * delta_h (Joules)
    work_gravity_joules = total_mass_kg * gravity_mps2 * elevation_delta_m
    work_gravity_kwh = work_gravity_joules / 3_600_000.0

    if elevation_delta_m < 0:
        # Downhill descent: regenerative recapture (70% efficiency)
        regen_efficiency = 0.70
        elevation_work_kwh = round(work_gravity_kwh * regen_efficiency, 3)
    else:
        # Uphill climb: powertrain efficiency loss (90% efficiency)
        drive_efficiency = 0.90
        elevation_work_kwh = round(work_gravity_kwh / drive_efficiency, 3)

    # 5. Net Estimated Energy
    net_energy_kwh = max(0.1, round(adjusted_energy_kwh + elevation_work_kwh, 3))

    # 6. Projected SoC
    battery_capacity = max(vehicle.battery_usable_kwh, 20.0)
    soc_consumed_pct = round((net_energy_kwh / battery_capacity) * 100.0, 2)
    projected_final_soc = max(0.0, min(100.0, round(current_soc - soc_consumed_pct, 2)))

    # Assumptions list for UI transparency
    assumptions = [
        f"Base vehicle consumption: {vehicle.consumption_kwh_per_100km:.1f} kWh/100km based on {vehicle.make} {vehicle.model}.",
        f"Ambient temperature ({temperature_c:.1f}°C): Estimated {temp_impact_pct:+.1f}% HVAC thermal load.",
        f"Passenger load ({passengers} onboard): Estimated {passenger_impact_pct:+.1f}% rolling resistance & inertia overhead.",
        f"Topography ({origin_elevation_m:.0f}m to {dest_elevation_m:.0f}m, Δh={elevation_delta_m:+.0f}m): "
        f"{'Downhill regenerative recovery of ' + str(abs(elevation_work_kwh)) + ' kWh' if elevation_delta_m < 0 else 'Uphill climb added ' + str(elevation_work_kwh) + ' kWh'}.",
    ]

    return PhysicsEstimate(
        base_energy_kwh=base_energy_kwh,
        temp_impact_pct=temp_impact_pct,
        passenger_impact_pct=passenger_impact_pct,
        elevation_gain_loss_kwh=elevation_work_kwh,
        net_energy_kwh=net_energy_kwh,
        soc_consumed_pct=soc_consumed_pct,
        projected_final_soc=projected_final_soc,
        assumptions=assumptions,
        methodology="Physics-Aware Thermodynamic & Gravitational Model (Independent Academic Approximation)",
    )
