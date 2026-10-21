"""
Physics-aware energy estimation engine for Electric Vehicles.
Models aerodynamic drag, rolling resistance, gravitational work (elevation change),
powertrain efficiency, regenerative braking, and auxiliary loads.
"""

from dataclasses import dataclass


@dataclass
class PhysicsEngine:
    """
    Deterministic EV energy consumption & regeneration calculator.
    """
    mass_kg: float = 1800.0                # Average EV curb weight + passengers (kg)
    battery_capacity_kwh: float = 50.0     # Total battery pack capacity (kWh)
    drag_coefficient: float = 0.28         # Aerodynamic drag coefficient (Cd)
    frontal_area_m2: float = 2.2           # Frontal surface area (A in m^2)
    rolling_resistance_coeff: float = 0.012 # Tire rolling resistance coefficient (Crr)
    air_density: float = 1.225             # Air density at sea level (kg/m^3)
    gravity: float = 9.81                  # Acceleration due to gravity (m/s^2)
    drivetrain_efficiency: float = 0.90    # Battery-to-wheel electrical/mechanical efficiency
    regen_efficiency: float = 0.70         # Wheel-to-battery regenerative braking efficiency
    auxiliary_power_kw: float = 0.60       # HVAC, electronics, baseline auxiliary draw (kW)

    def calculate_segment_energy(
        self,
        distance_km: float,
        elevation_change_m: float,
        speed_kmh: float = 50.0,
    ) -> float:
        """
        Calculates the net energy consumed (+) or regenerated (-) in kWh
        for a given road segment.

        :param distance_km: Segment length in kilometers.
        :param elevation_change_m: Elevation delta (finish elevation - start elevation) in meters.
        :param speed_kmh: Average travel speed in km/h (default: 50 km/h).
        :return: Net energy consumed in kWh (negative implies net regeneration).
        """
        if distance_km <= 0:
            return 0.0

        distance_m = distance_km * 1000.0
        speed_ms = max(speed_kmh / 3.6, 1.0)  # Avoid division by zero
        travel_time_sec = distance_m / speed_ms

        # 1. Rolling resistance force (N)
        f_rolling = self.mass_kg * self.gravity * self.rolling_resistance_coeff
        work_rolling_j = f_rolling * distance_m

        # 2. Aerodynamic drag force (N)
        f_aero = 0.5 * self.air_density * self.drag_coefficient * self.frontal_area_m2 * (speed_ms ** 2)
        work_aero_j = f_aero * distance_m

        # 3. Gravitational potential work (J)
        # Positive if uphill (requires energy), negative if downhill (releases potential energy)
        work_gravity_j = self.mass_kg * self.gravity * elevation_change_m

        # Net mechanical work required at the wheels (J)
        net_wheel_work_j = work_rolling_j + work_aero_j + work_gravity_j

        # Drivetrain conversion: Traction vs Regenerative braking
        if net_wheel_work_j >= 0:
            # Powering forward: account for battery-to-wheel efficiency losses
            battery_energy_j = net_wheel_work_j / self.drivetrain_efficiency
        else:
            # Decelerating / descending downhill: regenerative braking recapture
            # net_wheel_work_j is negative; multiplying by regen_efficiency yields negative energy
            battery_energy_j = net_wheel_work_j * self.regen_efficiency

        # 4. Auxiliary load (HVAC, lights, onboard computing)
        aux_energy_j = (self.auxiliary_power_kw * 1000.0) * travel_time_sec

        # Net total energy from the battery pack (Joules)
        total_energy_j = battery_energy_j + aux_energy_j

        # Convert Joules to kWh (1 kWh = 3.6 * 10^6 J)
        energy_kwh = total_energy_j / 3_600_000.0

        return energy_kwh

    def calculate_soc_delta(
        self,
        energy_kwh: float,
    ) -> float:
        """
        Computes the change in State of Charge (SoC percentage) for a given energy in kWh.
        Positive energy_kwh reduces SoC (returns negative delta).
        """
        return -(energy_kwh / self.battery_capacity_kwh) * 100.0
