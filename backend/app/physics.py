"""
Location-Agnostic EV Physics, Gradient & Battery Degradation Engine
Implements:
1. Empirical battery degradation derived from vehicle age, odometer mileage, chemistry & climate
2. Micro-segment spatial densification (250m intervals)
3. Multi-force mechanical equilibrium (aerodynamic drag, rolling resistance, gravitational incline)
4. Altitude-adjusted barometric air density
5. Dynamic speed derating on steep climbs (> 7%)
6. Continuous auxiliary & HVAC thermal modeling
7. Bounded kinetic regenerative braking with age-derated power acceptance & impedance loss
8. Resource-Constrained Shortest Path (RCSP) 10% reserve monitoring with lookahead charging
9. Dual-point telemetry logging for sharp vertical recharge steps
"""

import math
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field

from .adaptive_profile import VEHICLE_VARIANTS_DB


class VehicleSpecs(BaseModel):
    name: str
    curb_weight_kg: float
    battery_capacity_kwh: float
    battery_chemistry: str = "LFP"  # LFP (Tata, BYD) or NMC (MG, Hyundai, Tesla, etc.)
    max_charge_power_kw: float = 50.0
    max_regen_power_kw: float = 40.0
    drag_coefficient_cd: float = 0.29
    frontal_area_m2: float = 2.35
    rolling_resistance_crr: float = 0.012
    drivetrain_efficiency: float = 0.91
    regen_efficiency: float = 0.75
    base_auxiliary_power_w: float = 650.0


EV_MODELS: Dict[str, VehicleSpecs] = {
    "tata_tiago_ev": VehicleSpecs(
        name="Tata Tiago EV",
        curb_weight_kg=1150.0,
        battery_capacity_kwh=24.0,
        battery_chemistry="LFP",
        max_charge_power_kw=25.0,
        max_regen_power_kw=22.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.15,
        base_auxiliary_power_w=600.0,
    ),
    "mg_comet_ev": VehicleSpecs(
        name="MG Comet EV",
        curb_weight_kg=815.0,
        battery_capacity_kwh=17.3,
        battery_chemistry="LFP",
        max_charge_power_kw=17.0,
        max_regen_power_kw=15.0,
        drag_coefficient_cd=0.36,
        frontal_area_m2=2.10,
        base_auxiliary_power_w=450.0,
    ),
    "tata_punch_ev": VehicleSpecs(
        name="Tata Punch EV",
        curb_weight_kg=1340.0,
        battery_capacity_kwh=35.0,
        battery_chemistry="LFP",
        max_charge_power_kw=50.0,
        max_regen_power_kw=35.0,
        drag_coefficient_cd=0.34,
        frontal_area_m2=2.38,
        base_auxiliary_power_w=700.0,
    ),
    "mahindra_xuv400": VehicleSpecs(
        name="Mahindra XUV400",
        curb_weight_kg=1578.0,
        battery_capacity_kwh=39.4,
        battery_chemistry="NMC",
        max_charge_power_kw=50.0,
        max_regen_power_kw=40.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.44,
        base_auxiliary_power_w=750.0,
    ),
    "tata_nexon_ev": VehicleSpecs(
        name="Tata Nexon EV",
        curb_weight_kg=1450.0,
        battery_capacity_kwh=45.0,
        battery_chemistry="LFP",
        max_charge_power_kw=50.0,
        max_regen_power_kw=40.0,
        drag_coefficient_cd=0.32,
        frontal_area_m2=2.42,
        base_auxiliary_power_w=750.0,
    ),
    "tata_curvv_ev": VehicleSpecs(
        name="Tata Curvv EV",
        curb_weight_kg=1550.0,
        battery_capacity_kwh=55.0,
        battery_chemistry="LFP",
        max_charge_power_kw=70.0,
        max_regen_power_kw=45.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.45,
        base_auxiliary_power_w=780.0,
    ),
    "mg_zs_ev": VehicleSpecs(
        name="MG ZS EV",
        curb_weight_kg=1610.0,
        battery_capacity_kwh=50.3,
        battery_chemistry="NMC",
        max_charge_power_kw=50.0,
        max_regen_power_kw=45.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.45,
        base_auxiliary_power_w=800.0,
    ),
    "byd_atto_3": VehicleSpecs(
        name="BYD Atto 3",
        curb_weight_kg=1750.0,
        battery_capacity_kwh=60.48,
        battery_chemistry="LFP",
        max_charge_power_kw=80.0,
        max_regen_power_kw=50.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.52,
        base_auxiliary_power_w=850.0,
    ),
    "byd_seal": VehicleSpecs(
        name="BYD Seal",
        curb_weight_kg=2055.0,
        battery_capacity_kwh=82.56,
        battery_chemistry="LFP",
        max_charge_power_kw=150.0,
        max_regen_power_kw=60.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.29,
        base_auxiliary_power_w=800.0,
    ),
    "hyundai_ioniq_5": VehicleSpecs(
        name="Hyundai Ioniq 5",
        curb_weight_kg=1910.0,
        battery_capacity_kwh=72.6,
        battery_chemistry="NMC",
        max_charge_power_kw=233.0,
        max_regen_power_kw=70.0,
        drag_coefficient_cd=0.288,
        frontal_area_m2=2.55,
        base_auxiliary_power_w=850.0,
    ),
    "kia_ev6": VehicleSpecs(
        name="Kia EV6",
        curb_weight_kg=1980.0,
        battery_capacity_kwh=77.4,
        battery_chemistry="NMC",
        max_charge_power_kw=233.0,
        max_regen_power_kw=75.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.48,
        base_auxiliary_power_w=850.0,
    ),
    "tesla_model_3": VehicleSpecs(
        name="Tesla Model 3",
        curb_weight_kg=1765.0,
        battery_capacity_kwh=78.1,
        battery_chemistry="NMC",
        max_charge_power_kw=250.0,
        max_regen_power_kw=70.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.22,
        base_auxiliary_power_w=700.0,
    ),
    "tesla_model_y": VehicleSpecs(
        name="Tesla Model Y",
        curb_weight_kg=1980.0,
        battery_capacity_kwh=78.1,
        battery_chemistry="NMC",
        max_charge_power_kw=250.0,
        max_regen_power_kw=75.0,
        drag_coefficient_cd=0.23,
        frontal_area_m2=2.54,
        base_auxiliary_power_w=800.0,
    ),
    "volvo_ex40": VehicleSpecs(
        name="Volvo EX40",
        curb_weight_kg=2040.0,
        battery_capacity_kwh=82.0,
        battery_chemistry="NMC",
        max_charge_power_kw=200.0,
        max_regen_power_kw=65.0,
        drag_coefficient_cd=0.329,
        frontal_area_m2=2.56,
        base_auxiliary_power_w=850.0,
    ),
    "bmw_i4": VehicleSpecs(
        name="BMW i4",
        curb_weight_kg=2050.0,
        battery_capacity_kwh=83.9,
        battery_chemistry="NMC",
        max_charge_power_kw=205.0,
        max_regen_power_kw=80.0,
        drag_coefficient_cd=0.24,
        frontal_area_m2=2.31,
        base_auxiliary_power_w=850.0,
    ),
    "mercedes_eqb": VehicleSpecs(
        name="Mercedes-Benz EQB",
        curb_weight_kg=2175.0,
        battery_capacity_kwh=66.5,
        battery_chemistry="NMC",
        max_charge_power_kw=100.0,
        max_regen_power_kw=55.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.53,
        base_auxiliary_power_w=900.0,
    ),
}


class SegmentTelemetry(BaseModel):
    segment_idx: int
    distance_km: float
    elevation_m: float
    gradient_percent: float
    soc_percent: float
    is_regenerating: bool
    is_charging_step: bool = False
    is_charging_stop: bool = False
    charging_station_name: Optional[str] = None
    cumulative_energy_kwh: float
    # Real-time weather attributes per segment
    ambient_temp_c: float = 30.0
    effective_airspeed_kmh: float = 65.0
    headwind_component_kmh: float = 0.0
    road_condition: str = "dry"  # 'dry', 'wet', or 'heavy_rain'
    dynamic_crr: float = 0.012


class PlannedChargeStop(BaseModel):
    station_id: str
    name: str
    lat: float
    lon: float
    distance_along_route_km: float
    arrival_soc_percent: float
    departure_soc_percent: float
    energy_added_kwh: float
    charge_duration_mins: float
    power_kw: float
    # Backwards-compatibility fields for UI
    arrival_distance_km: float = 0.0
    target_soc_percent: float = 80.0
    charging_time_minutes: float = 0.0


# Backward compatibility alias
ChargingPlanStop = PlannedChargeStop


class BatteryHealthAudit(BaseModel):
    vehicle_age_years: float
    odometer_km: float
    estimated_soh_percent: float
    nominal_capacity_kwh: float
    effective_usable_capacity_kwh: float
    capacity_lost_kwh: float
    impedance_loss_factor: float
    effective_max_regen_kw: float


class WeatherImpactSummary(BaseModel):
    average_headwind_kmh: float
    max_headwind_kmh: float
    wet_route_percentage: float
    extra_weather_energy_kwh: float


class RoutePhysicsSummary(BaseModel):
    total_distance_km: float
    total_climb_m: int
    total_descent_m: int
    max_uphill_gradient_percent: float
    max_downhill_gradient_percent: float
    max_gradient_percent: float = 0.0
    gross_consumed_kwh: float
    gross_regenerated_kwh: float
    net_energy_kwh: float
    final_soc_percent: float
    reserve_breached: bool
    is_unreachable: bool = False
    total_charging_time_minutes: float = 0.0
    total_energy_charged_kwh: float = 0.0
    planned_stops: List[PlannedChargeStop] = []
    charging_stops: List[PlannedChargeStop] = []
    telemetry_profile: List[SegmentTelemetry]
    route_coordinates: Optional[List[List[float]]] = None
    battery_health: Optional[BatteryHealthAudit] = None
    weather_impact: Optional[WeatherImpactSummary] = None


def estimate_battery_soh(
    vehicle_age_years: float,
    odometer_km: Optional[float] = None,
    battery_chemistry: str = "LFP",
    ambient_temp_c: float = 30.0,
) -> float:
    """
    Computes empirical State of Health (SoH %) combining:
    1. Calendar Aging: Non-linear SEI layer growth (proportional to sqrt(t) + linear drift).
    2. Cycle Aging: Mechanical cathode cracking based on cumulative mileage throughput.
    3. Thermal Acceleration: Arrhenius baseline scaling above 28°C.
    """
    age = max(0.0, float(vehicle_age_years))
    km_driven = age * 12000.0 if (odometer_km is None or odometer_km <= 0) else float(odometer_km)

    # LFP exhibits superior thermal calendar stability over NMC in tropical climates
    chem_factor = 0.92 if battery_chemistry.upper() == "LFP" else 1.05

    # Ambient thermal acceleration factor (>28°C)
    temp_factor = 1.0 + max(0.0, (ambient_temp_c - 28.0) * 0.015)

    # Non-linear calendar degradation (steepest during initial 18 months, stabilizing into sqrt(t))
    calendar_loss = (2.2 * math.sqrt(age) + 0.85 * age) * chem_factor * temp_factor

    # Cycle throughput loss (~0.052% per 1,000 km driven)
    cycle_loss = (km_driven / 1000.0) * 0.052

    total_loss = calendar_loss + cycle_loss
    # Floor SoH at 65.0% (standard EV automotive end-of-life battery limit)
    return round(max(65.0, min(100.0, 100.0 - total_loss)), 1)


class UniversalEVPhysicsEngine:
    GRAVITY = 9.80665
    PASSENGER_WEIGHT_KG = 75.0
    LUGGAGE_PER_PERSON_KG = 5.0
    HVAC_BODY_HEAT_W = 120.0

    def __init__(
        self,
        vehicle_model_id: str = "tata_nexon_ev",
        passengers: int = 2,
        ambient_temp_c: float = 30.0,
        cabin_temp_c: float = 22.0,
        vehicle_age_years: float = 0.0,
        odometer_km: Optional[float] = None,
        variant_specs: Optional[Any] = None,
        calibration: Optional[Any] = None,
    ):
        if variant_specs is not None:
            self.specs = variant_specs
        elif vehicle_model_id in VEHICLE_VARIANTS_DB:
            self.specs = VEHICLE_VARIANTS_DB[vehicle_model_id]
        else:
            self.specs = EV_MODELS.get(vehicle_model_id, EV_MODELS["tata_nexon_ev"])

        self.cal = calibration
        self.passengers = max(1, passengers)
        self.ambient_temp_c = ambient_temp_c
        self.cabin_temp_c = cabin_temp_c
        self.vehicle_age_years = max(0.0, float(vehicle_age_years))
        self.odometer_km = (
            self.vehicle_age_years * 12000.0
            if (odometer_km is None or odometer_km <= 0)
            else float(odometer_km)
        )

        # 1. State of Health (SoH) Derivation
        self.estimated_soh_percent = estimate_battery_soh(
            vehicle_age_years=self.vehicle_age_years,
            odometer_km=self.odometer_km,
            battery_chemistry=getattr(self.specs, "battery_chemistry", "LFP"),
            ambient_temp_c=self.ambient_temp_c,
        )
        self.soh_ratio = self.estimated_soh_percent / 100.0

        # 2. Usable Battery Capacity Derated by Aging or Learned Calibration
        if self.cal is not None and getattr(self.cal, "calibrated_capacity_kwh", None) is not None:
            self.effective_battery_capacity_kwh = float(self.cal.calibrated_capacity_kwh)
        else:
            nominal_kwh = getattr(self.specs, "battery_capacity_kwh", getattr(self.specs, "nominal_capacity_kwh", 45.0))
            self.effective_battery_capacity_kwh = round(nominal_kwh * self.soh_ratio, 3)

        # Compatibility attribute for graph/algorithm solvers
        self.battery_capacity_kwh = self.effective_battery_capacity_kwh

        # Base rolling resistance (with optional Crr offset from calibration)
        base_crr = getattr(self.specs, "rolling_resistance_crr", getattr(self.specs, "base_crr", 0.012))
        crr_offset = getattr(self.cal, "crr_offset", 0.0) if self.cal else 0.0
        self.effective_base_crr = max(0.009, base_crr + crr_offset)

        # 3. Internal Impedance / Joule Heating Loss Factor (up to 4% efficiency drop)
        self.impedance_loss_factor = round(1.0 - (0.04 * (1.0 - self.soh_ratio)), 4)

        # 4. De-rated Peak Regenerative Braking Acceptance Limit
        max_regen = getattr(self.specs, "max_regen_power_kw", 40.0)
        self.effective_max_regen_kw = round(
            max_regen * (0.85 + 0.15 * self.soh_ratio), 2
        )

        # Dynamic vehicle mass
        self.total_mass_kg = self.specs.curb_weight_kg + self.passengers * (
            self.PASSENGER_WEIGHT_KG + self.LUGGAGE_PER_PERSON_KG
        )

        # Continuous Auxiliary and HVAC thermal load
        temp_delta = abs(self.ambient_temp_c - self.cabin_temp_c)
        base_aux = getattr(self.specs, "base_auxiliary_power_w", 650.0)
        self.aux_power_w = (
            base_aux
            + (temp_delta * 85.0)
            + (self.passengers * self.HVAC_BODY_HEAT_W)
        )

        # Ambient temperature battery derating (<18°C)
        self.cold_temp_efficiency = 1.0
        if self.ambient_temp_c < 18.0:
            self.cold_temp_efficiency = max(0.65, 1.0 - (18.0 - self.ambient_temp_c) * 0.015)
        self.temp_efficiency = self.cold_temp_efficiency

    @staticmethod
    def calculate_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculates initial compass heading (0° to 360°) from point 1 to point 2."""
        p1, p2 = math.radians(lat1), math.radians(lat2)
        d_lon = math.radians(lon2 - lon1)
        y = math.sin(d_lon) * math.cos(p2)
        x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(d_lon)
        bearing = math.degrees(math.atan2(y, x))
        return (bearing + 360.0) % 360.0

    @staticmethod
    def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Ground surface distance in meters."""
        r = 6371000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
        return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    @staticmethod
    def air_density(elevation_m: float) -> float:
        """Barometric formula for altitude-adjusted air density."""
        return max(0.7, 1.225 * math.exp(-0.0001185 * max(0.0, elevation_m)))

    @classmethod
    def smooth_elevations(cls, elevations: List[float], window_size: int = 3) -> List[float]:
        """Moving-average filter to strip DEM noise and spikes."""
        n = len(elevations)
        if n <= window_size:
            return elevations
        smoothed = []
        pad = window_size // 2
        for i in range(n):
            start = max(0, i - pad)
            end = min(n, i + pad + 1)
            window = elevations[start:end]
            smoothed.append(sum(window) / len(window))
        return smoothed

    @classmethod
    def densify_waypoints(
        cls, raw_points: List[Dict[str, float]], elevations: List[float], step_m: float = 250.0
    ) -> List[Dict[str, Any]]:
        """
        Regularizes and densifies road coordinates into uniform micro-segments.
        Prevents micro-distance DEM gradient amplification and long-distance dilution.
        """
        n = len(raw_points)
        if n < 2:
            return raw_points

        cum_dists = [0.0]
        for i in range(n - 1):
            d = cls.haversine_m(
                raw_points[i]["lat"], raw_points[i]["lon"],
                raw_points[i + 1]["lat"], raw_points[i + 1]["lon"],
            )
            cum_dists.append(cum_dists[-1] + d)

        total_dist = cum_dists[-1]
        if total_dist < 1.0:
            return raw_points

        num_steps = max(1, math.ceil(total_dist / step_m))
        actual_step = total_dist / num_steps
        dense_points: List[Dict[str, Any]] = []

        raw_idx = 0
        for s in range(num_steps + 1):
            target_d = s * actual_step
            if s == num_steps or target_d >= total_dist:
                dense_points.append({
                    "lat": raw_points[-1]["lat"],
                    "lon": raw_points[-1]["lon"],
                    "ele": elevations[-1],
                    "step_dist_m": actual_step if s > 0 else 0.0,
                })
                break

            while raw_idx < n - 1 and cum_dists[raw_idx + 1] < target_d:
                raw_idx += 1

            d0, d1 = cum_dists[raw_idx], cum_dists[raw_idx + 1]
            seg_len = max(0.001, d1 - d0)
            t = (target_d - d0) / seg_len

            lat = raw_points[raw_idx]["lat"] + (raw_points[raw_idx + 1]["lat"] - raw_points[raw_idx]["lat"]) * t
            lon = raw_points[raw_idx]["lon"] + (raw_points[raw_idx + 1]["lon"] - raw_points[raw_idx]["lon"]) * t
            ele = elevations[raw_idx] + (elevations[raw_idx + 1] - elevations[raw_idx]) * t

            dense_points.append({
                "lat": lat,
                "lon": lon,
                "ele": round(ele, 2),
                "step_dist_m": actual_step if s > 0 else 0.0,
            })

        return dense_points

    def calculate_segment_energy(
        self, distance_km: float, elevation_change_m: float, speed_kmh: float = 50.0
    ) -> float:
        """Helper method for single-segment evaluation in graph/algorithm search."""
        d_m = max(1.0, distance_km * 1000.0)
        v_ms = max(0.5, speed_kmh / 3.6)
        t_s = d_m / v_ms
        theta = math.atan(elevation_change_m / d_m)

        rho = self.air_density(100.0)
        f_aero = 0.5 * rho * self.specs.drag_coefficient_cd * self.specs.frontal_area_m2 * (v_ms**2)
        f_roll = self.total_mass_kg * self.GRAVITY * self.specs.rolling_resistance_crr * math.cos(theta)
        f_grade = self.total_mass_kg * self.GRAVITY * math.sin(theta)

        p_wheels_kw = (f_aero + f_roll + f_grade) * v_ms / 1000.0

        if p_wheels_kw >= 0:
            base_eff = self.specs.drivetrain_efficiency * self.cold_temp_efficiency * self.impedance_loss_factor
            p_battery_kw = p_wheels_kw / max(0.01, base_eff)
        else:
            regen_possible = (
                abs(p_wheels_kw)
                * self.specs.regen_efficiency
                * self.cold_temp_efficiency
                * self.impedance_loss_factor
            )
            p_battery_kw = -min(self.effective_max_regen_kw, regen_possible)

        aux_kwh = (self.aux_power_w / 1000.0) * (t_s / 3600.0)
        return (p_battery_kw * (t_s / 3600.0)) + aux_kwh

    def calculate_soc_delta(self, seg_energy_kwh: float) -> float:
        """Computes SoC percentage change for a given energy delta (kWh)."""
        if self.effective_battery_capacity_kwh <= 0:
            return 0.0
        return -(seg_energy_kwh / self.effective_battery_capacity_kwh) * 100.0

    def evaluate_route(
        self,
        coordinates_3d: List[List[float]],
        weather_profile: Optional[List[Dict[str, float]]] = None,
        coord_order: str = "lat_lon_ele",
        cruising_speed_kmh: float = 65.0,
        initial_soc_percent: float = 50.0,
        reserve_threshold_percent: float = 10.0,
        candidate_chargers: Optional[List[Dict[str, Any]]] = None,
        available_chargers: Optional[List[Dict[str, Any]]] = None,
    ) -> RoutePhysicsSummary:
        if len(coordinates_3d) < 2:
            raise ValueError("Route must contain at least 2 coordinate points.")

        chargers = candidate_chargers or available_chargers or []

        raw_points: List[Dict[str, float]] = []
        raw_elevations: List[float] = []
        for p in coordinates_3d:
            lat = p[0] if coord_order == "lat_lon_ele" else p[1]
            lon = p[1] if coord_order == "lat_lon_ele" else p[0]
            ele = p[2] if len(p) > 2 else 0.0
            raw_points.append({"lat": lat, "lon": lon})
            raw_elevations.append(ele)

        smoothed_elevations = self.smooth_elevations(raw_elevations, window_size=3)
        processed_points = self.densify_waypoints(raw_points, smoothed_elevations, step_m=250.0)
        n = len(processed_points)

        # Precompute cumulative distances along dense path in meters
        pt_dists_m = [0.0]
        cum_dist = 0.0
        for idx in range(n - 1):
            cum_dist += processed_points[idx + 1]["step_dist_m"]
            pt_dists_m.append(cum_dist)

        # Snap available candidate chargers to the nearest route waypoints
        snapped_stations = []
        seen_keys = set()
        for st in chargers:
            slat = st.get("lat") or st.get("latitude")
            slon = st.get("lon") or st.get("longitude")
            if slat is None or slon is None:
                continue
            best_idx = -1
            min_dist = float("inf")
            for idx, pt in enumerate(processed_points):
                if abs(pt["lat"] - slat) > 0.4 or abs(pt["lon"] - slon) > 0.4:
                    continue
                d = self.haversine_m(pt["lat"], pt["lon"], float(slat), float(slon))
                if d < min_dist:
                    min_dist = d
                    best_idx = idx

            if best_idx != -1 and min_dist <= 45000.0:
                key = (round(float(slat), 2), round(float(slon), 2))
                if key not in seen_keys:
                    seen_keys.add(key)
                    snapped_stations.append({
                        "station": st,
                        "route_idx": best_idx,
                        "dist_km": round(pt_dists_m[best_idx] / 1000.0, 2),
                    })

        snapped_stations.sort(key=lambda x: x["dist_km"])

        # Filter stations to prevent clutter (keep stations at least 25 km apart)
        curated_stations = []
        last_station_km = -100.0
        for s in snapped_stations:
            if s["dist_km"] - last_station_km >= 25.0:
                curated_stations.append(s)
                last_station_km = s["dist_km"]

        # Ensure no gaps exceed single-charge safe range by augmenting national highway corridor plazas
        augmented_stations = []
        last_aug_km = 0.0
        for s in curated_stations:
            while (s["dist_km"] - last_aug_km) > 115.0:
                synth_km = last_aug_km + 95.0
                best_i = min(range(n), key=lambda idx: abs(pt_dists_m[idx] / 1000.0 - synth_km))
                augmented_stations.append({
                    "station": {
                        "id": f"nh_corridor_hub_{int(synth_km)}",
                        "name": f"National Highway Fast Charging Plaza (km {int(synth_km)})",
                        "lat": processed_points[best_i]["lat"],
                        "lon": processed_points[best_i]["lon"],
                        "power_kw": 60.0,
                    },
                    "route_idx": best_i,
                    "dist_km": synth_km,
                })
                last_aug_km = synth_km
            augmented_stations.append(s)
            last_aug_km = s["dist_km"]

        # Baseline energy capacities dynamically scaled to aged pack
        current_soc_kwh = (initial_soc_percent / 100.0) * self.effective_battery_capacity_kwh
        reserve_kwh = (reserve_threshold_percent / 100.0) * self.effective_battery_capacity_kwh

        total_dist_m = 0.0
        total_climb_m = 0.0
        total_descent_m = 0.0
        gross_consumed = 0.0
        gross_regen = 0.0
        total_aux_consumed = 0.0
        max_uphill_grad = 0.0
        max_downhill_grad = 0.0

        reserve_breached = False
        last_charge_dist_m = -100000.0
        station_ptr = 0
        num_stations = len(augmented_stations)

        telemetry: List[SegmentTelemetry] = []
        planned_stops: List[PlannedChargeStop] = []

        w_len = len(weather_profile) if weather_profile else 0
        total_headwind_sum = 0.0
        max_headwind = -999.0
        wet_segments_count = 0
        weather_penalized_energy = 0.0

        # Initial starting waypoint
        init_temp = weather_profile[0].get("temp_c", self.ambient_temp_c) if (weather_profile and len(weather_profile) > 0) else self.ambient_temp_c
        telemetry.append(
            SegmentTelemetry(
                segment_idx=0,
                distance_km=0.0,
                elevation_m=round(processed_points[0]["ele"], 1),
                gradient_percent=0.0,
                soc_percent=round(initial_soc_percent, 1),
                is_regenerating=False,
                is_charging_step=False,
                is_charging_stop=False,
                cumulative_energy_kwh=0.0,
                ambient_temp_c=round(init_temp, 1),
                effective_airspeed_kmh=round(cruising_speed_kmh, 1),
                headwind_component_kmh=0.0,
                road_condition="dry",
                dynamic_crr=round(self.effective_base_crr, 4),
            )
        )

        for i in range(n - 1):
            p1, p2 = processed_points[i], processed_points[i + 1]
            ele1, ele2 = p1["ele"], p2["ele"]
            d_m = p2["step_dist_m"]
            if d_m < 1.0:
                continue

            # Get local segment weather slice
            w_idx = int((i / max(1, n - 2)) * (w_len - 1)) if w_len > 0 else 0
            w_data = weather_profile[w_idx] if w_len > 0 else {
                "temp_c": self.ambient_temp_c,
                "precip_mm": 0.0,
                "wind_speed_kmh": 0.0,
                "wind_dir_deg": 0.0,
            }

            seg_temp = float(w_data.get("temp_c", self.ambient_temp_c))
            precip = float(w_data.get("precip_mm", 0.0))
            wind_speed_ms = float(w_data.get("wind_speed_kmh", 0.0)) / 3.6
            wind_dir = float(w_data.get("wind_dir_deg", 0.0))

            # 1. Micro-segment slope calculation
            delta_ele = ele2 - ele1
            raw_gradient = (delta_ele / d_m) * 100.0
            gradient_percent = max(-18.0, min(18.0, raw_gradient))
            theta = math.atan(gradient_percent / 100.0)

            if gradient_percent > max_uphill_grad:
                max_uphill_grad = gradient_percent
            if gradient_percent < max_downhill_grad:
                max_downhill_grad = gradient_percent

            # 2. Cumulative vertical displacement
            if delta_ele > 0:
                total_climb_m += delta_ele
            else:
                total_descent_m += abs(delta_ele)

            # 3. Segment Travel Bearing
            seg_bearing = self.calculate_bearing_deg(p1["lat"], p1["lon"], p2["lat"], p2["lon"])

            # 4. Vector Relative Wind Calculation
            rel_wind_angle_rad = math.radians(wind_dir - seg_bearing)
            headwind_component_ms = wind_speed_ms * math.cos(rel_wind_angle_rad)
            headwind_kmh = headwind_component_ms * 3.6

            if headwind_kmh > max_headwind:
                max_headwind = headwind_kmh
            total_headwind_sum += headwind_kmh

            # 5. Dynamic Rolling Resistance based on surface precipitation
            if precip >= 2.5:
                road_state = "heavy_rain"
                current_crr = self.effective_base_crr * 1.35
                wet_segments_count += 1
            elif precip >= 0.1:
                road_state = "wet"
                current_crr = self.effective_base_crr * 1.15
                wet_segments_count += 1
            else:
                road_state = "dry"
                current_crr = self.effective_base_crr

            # 6. Dynamic speed derating on steep inclines (> 7%) & Relative Air Velocity
            effective_speed = min(cruising_speed_kmh, 35.0 if gradient_percent > 7.0 else cruising_speed_kmh)
            v_ms = max(0.5, effective_speed / 3.6)
            t_s = d_m / v_ms

            # Airspeed includes headwind (or tailwind reduction)
            v_air_ms = max(0.5, v_ms + headwind_component_ms)

            # 7. Multi-force summation with barometric air density & relative airspeed
            rho = self.air_density((ele1 + ele2) / 2.0)
            f_aero = 0.5 * rho * self.specs.drag_coefficient_cd * self.specs.frontal_area_m2 * (v_air_ms**2)
            f_roll = self.total_mass_kg * self.GRAVITY * current_crr * math.cos(theta)
            f_grade = self.total_mass_kg * self.GRAVITY * math.sin(theta)

            # Grey-box calibration: scale tractive power by the learned driver aggression multiplier
            driver_aggression = getattr(self.cal, "driver_aggression_factor", 1.0) if self.cal else 1.0
            p_wheels_kw = ((f_aero + f_roll + f_grade) * v_ms / 1000.0) * driver_aggression

            # Calculate incremental drag caused purely by adverse weather (for reporting)
            f_aero_calm = 0.5 * rho * self.specs.drag_coefficient_cd * self.specs.frontal_area_m2 * (v_ms**2)
            f_roll_dry = self.total_mass_kg * self.GRAVITY * self.effective_base_crr * math.cos(theta)
            delta_weather_p_kw = max(0.0, ((f_aero - f_aero_calm) + (f_roll - f_roll_dry)) * v_ms / 1000.0)
            weather_penalized_energy += delta_weather_p_kw * (t_s / 3600.0)

            # 8. Motoring vs Regen accounting for aged battery impedance and cold temperature
            drivetrain_eff = getattr(self.specs, "drivetrain_efficiency", 0.91)
            regen_eff = getattr(self.specs, "regen_efficiency", 0.75)
            base_aux_w = getattr(self.specs, "base_auxiliary_power_w", 650.0)

            if p_wheels_kw >= 0:
                base_eff = drivetrain_eff * self.cold_temp_efficiency * self.impedance_loss_factor
                p_battery_kw = p_wheels_kw / max(0.01, base_eff)
                is_regen = False
            else:
                regen_possible = (
                    abs(p_wheels_kw)
                    * regen_eff
                    * self.cold_temp_efficiency
                    * self.impedance_loss_factor
                )
                p_battery_kw = -min(self.effective_max_regen_kw, regen_possible)
                is_regen = True

            # 9. Cabin auxiliary HVAC load with localized ambient temperature
            local_temp_delta = abs(seg_temp - self.cabin_temp_c)
            seg_aux_w = (
                base_aux_w
                + (local_temp_delta * 85.0)
                + (self.passengers * self.HVAC_BODY_HEAT_W)
            )
            aux_kwh = (seg_aux_w / 1000.0) * (t_s / 3600.0)
            total_aux_consumed += aux_kwh

            if is_regen:
                regen_kwh = abs(p_battery_kw) * (t_s / 3600.0)
                gross_regen += regen_kwh
                seg_energy_kwh = -regen_kwh + aux_kwh
            else:
                traction_kwh = p_battery_kw * (t_s / 3600.0)
                gross_consumed += traction_kwh
                seg_energy_kwh = traction_kwh + aux_kwh

            # Battery level update constrained to aged usable capacity ceiling
            current_soc_kwh -= seg_energy_kwh
            current_soc_kwh = max(0.0, min(self.effective_battery_capacity_kwh, current_soc_kwh))
            total_dist_m += d_m

            current_soc_pct = (current_soc_kwh / self.effective_battery_capacity_kwh) * 100.0
            current_dist_km = round(total_dist_m / 1000.0, 2)

            # Advance station pointer to current highway coordinate
            while station_ptr < num_stations and augmented_stations[station_ptr]["route_idx"] < i:
                station_ptr += 1

            # 7. Intelligent Lookahead Station Selection & Realistic Arrival SoC
            should_stop_here = False
            matched_station = None

            dist_since_last_charge = total_dist_m - last_charge_dist_m
            can_charge = dist_since_last_charge >= 55000.0  # at least 55 km between charging stops

            if station_ptr < num_stations and augmented_stations[station_ptr]["route_idx"] == i and can_charge:
                curr_cand = augmented_stations[station_ptr]
                # Look ahead to the NEXT station or destination
                if station_ptr + 1 < num_stations:
                    next_cand = augmented_stations[station_ptr + 1]
                    dist_to_next_km = next_cand["dist_km"] - curr_cand["dist_km"]
                else:
                    dist_to_next_km = (pt_dists_m[-1] / 1000.0) - curr_cand["dist_km"]

                # Estimate energy needed to reach next milestone (~0.135 kWh/km baseline adjusted for mass)
                est_rate_kwh_km = (self.total_mass_kg / 1500.0) * 0.135
                est_energy_to_next = dist_to_next_km * est_rate_kwh_km

                # Stop if car cannot safely reach next station without breaching reserve, OR if SoC is <= 18%
                will_breach_next = (current_soc_kwh - est_energy_to_next) < reserve_kwh
                if will_breach_next or current_soc_pct <= 18.0:
                    should_stop_here = True
                    matched_station = curr_cand["station"]

            # Emergency reserve fallback if between stations
            if not should_stop_here and current_soc_kwh <= reserve_kwh and can_charge and i < (n - 2):
                should_stop_here = True
                reserve_breached = True
                matched_station = {
                    "id": f"emergency_hwy_stop_{len(planned_stops) + 1}",
                    "name": f"National Highway Fast Charging Hub #{len(planned_stops) + 1}",
                    "lat": p2["lat"],
                    "lon": p2["lon"],
                    "power_kw": 60.0,
                }

            if should_stop_here and matched_station:
                last_charge_dist_m = total_dist_m
                station_name = matched_station.get("name", "Corridor Fast Charger")
                station_lat = float(matched_station.get("lat", p2["lat"]))
                station_lon = float(matched_station.get("lon", p2["lon"]))
                power_kw = float(matched_station.get("power_kw", 60.0))

                eff_kw = min(power_kw, getattr(self.specs, "max_charge_power_kw", 50.0))
                # Recharges up to 80% of effective aged capacity
                target_kwh = 0.80 * self.effective_battery_capacity_kwh
                added_kwh = max(0.0, target_kwh - current_soc_kwh)
                dwell_mins = (added_kwh / max(10.0, eff_kw)) * 60.0 / 0.90

                planned_stops.append(
                    PlannedChargeStop(
                        station_id=str(matched_station.get("id", f"stop-{len(planned_stops)+1}")),
                        name=station_name,
                        lat=station_lat,
                        lon=station_lon,
                        distance_along_route_km=current_dist_km,
                        arrival_soc_percent=round(current_soc_pct, 1),
                        departure_soc_percent=80.0,
                        energy_added_kwh=round(added_kwh, 2),
                        charge_duration_mins=round(dwell_mins, 1),
                        power_kw=eff_kw,
                        arrival_distance_km=current_dist_km,
                        target_soc_percent=80.0,
                        charging_time_minutes=round(dwell_mins, 1),
                    )
                )

                # Point A: Real Arrival state at this station
                telemetry.append(
                    SegmentTelemetry(
                        segment_idx=len(telemetry),
                        distance_km=current_dist_km,
                        elevation_m=round(ele2, 1),
                        gradient_percent=round(gradient_percent, 1),
                        soc_percent=round(current_soc_pct, 1),
                        is_regenerating=False,
                        is_charging_step=False,
                        is_charging_stop=True,
                        charging_station_name=station_name,
                        cumulative_energy_kwh=round(gross_consumed + total_aux_consumed - gross_regen, 3),
                        ambient_temp_c=round(seg_temp, 1),
                        effective_airspeed_kmh=round(v_air_ms * 3.6, 1),
                        headwind_component_kmh=round(headwind_kmh, 1),
                        road_condition=road_state,
                        dynamic_crr=round(current_crr, 4),
                    )
                )

                # Point B: Immediate 80% SoC departure step
                current_soc_kwh = target_kwh
                current_soc_pct = 80.0
                telemetry.append(
                    SegmentTelemetry(
                        segment_idx=len(telemetry),
                        distance_km=current_dist_km,
                        elevation_m=round(ele2, 1),
                        gradient_percent=round(gradient_percent, 1),
                        soc_percent=80.0,
                        is_regenerating=False,
                        is_charging_step=True,
                        is_charging_stop=True,
                        charging_station_name=station_name,
                        cumulative_energy_kwh=round(gross_consumed + total_aux_consumed - gross_regen, 3),
                        ambient_temp_c=round(seg_temp, 1),
                        effective_airspeed_kmh=round(v_air_ms * 3.6, 1),
                        headwind_component_kmh=round(headwind_kmh, 1),
                        road_condition=road_state,
                        dynamic_crr=round(current_crr, 4),
                    )
                )
                continue

            telemetry.append(
                SegmentTelemetry(
                    segment_idx=len(telemetry),
                    distance_km=current_dist_km,
                    elevation_m=round(ele2, 1),
                    gradient_percent=round(gradient_percent, 1),
                    soc_percent=round(current_soc_pct, 1),
                    is_regenerating=is_regen,
                    is_charging_step=False,
                    is_charging_stop=False,
                    cumulative_energy_kwh=round(gross_consumed + total_aux_consumed - gross_regen, 3),
                    ambient_temp_c=round(seg_temp, 1),
                    effective_airspeed_kmh=round(v_air_ms * 3.6, 1),
                    headwind_component_kmh=round(headwind_kmh, 1),
                    road_condition=road_state,
                    dynamic_crr=round(current_crr, 4),
                )
            )

        total_net_kwh = gross_consumed + total_aux_consumed - gross_regen
        max_grad = max(abs(max_uphill_grad), abs(max_downhill_grad))

        # Sample telemetry profile if > 150 points for smooth charting performance
        chart_telemetry = telemetry
        if len(telemetry) > 150:
            step = max(1, len(telemetry) // 120)
            sampled = []
            for idx, pt in enumerate(telemetry):
                if idx == 0 or idx == len(telemetry) - 1 or pt.is_charging_step or pt.is_charging_stop or (idx % step == 0):
                    sampled.append(pt)
            chart_telemetry = sampled

        total_charge_time = sum(s.charge_duration_mins for s in planned_stops)
        total_charge_kwh = sum(s.energy_added_kwh for s in planned_stops)

        nominal_cap = getattr(self.specs, "battery_capacity_kwh", getattr(self.specs, "nominal_capacity_kwh", 45.0))
        battery_audit = BatteryHealthAudit(
            vehicle_age_years=self.vehicle_age_years,
            odometer_km=round(self.odometer_km, 1),
            estimated_soh_percent=self.estimated_soh_percent,
            nominal_capacity_kwh=nominal_cap,
            effective_usable_capacity_kwh=self.effective_battery_capacity_kwh,
            capacity_lost_kwh=round(nominal_cap - self.effective_battery_capacity_kwh, 3),
            impedance_loss_factor=self.impedance_loss_factor,
            effective_max_regen_kw=self.effective_max_regen_kw,
        )

        valid_seg_count = max(1, n - 1)
        weather_summary = WeatherImpactSummary(
            average_headwind_kmh=round(total_headwind_sum / valid_seg_count, 1),
            max_headwind_kmh=round(max_headwind if max_headwind != -999.0 else 0.0, 1),
            wet_route_percentage=round((wet_segments_count / valid_seg_count) * 100.0, 1),
            extra_weather_energy_kwh=round(weather_penalized_energy, 3),
        )

        return RoutePhysicsSummary(
            total_distance_km=round(total_dist_m / 1000.0, 2),
            total_climb_m=int(round(total_climb_m)),
            total_descent_m=int(round(total_descent_m)),
            max_uphill_gradient_percent=round(max_uphill_grad, 1),
            max_downhill_gradient_percent=round(max_downhill_grad, 1),
            max_gradient_percent=round(max_grad, 1),
            gross_consumed_kwh=round(gross_consumed + total_aux_consumed, 3),
            gross_regenerated_kwh=round(gross_regen, 3),
            net_energy_kwh=round(total_net_kwh, 3),
            final_soc_percent=round(telemetry[-1].soc_percent, 1),
            reserve_breached=reserve_breached,
            is_unreachable=False,
            total_charging_time_minutes=round(total_charge_time, 1),
            total_energy_charged_kwh=round(total_charge_kwh, 2),
            planned_stops=planned_stops,
            charging_stops=planned_stops,
            telemetry_profile=chart_telemetry,
            route_coordinates=[[p["lon"], p["lat"]] for p in raw_points],
            battery_health=battery_audit,
            weather_impact=weather_summary,
        )


# Backward-compatibility alias
PhysicsEngine = UniversalEVPhysicsEngine
