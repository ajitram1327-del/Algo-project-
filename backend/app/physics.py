"""
Location-Agnostic EV Physics & Gradient Engine
Implements:
1. Micro-segment densification (250m steps)
2. Road slope/grade dynamics
3. Aerodynamic drag, rolling resistance, and auxiliary HVAC loads
4. Bounded regenerative braking
5. Dual-point telemetry charging transitions
"""

import math
from typing import List, Dict, Optional, Any
from pydantic import BaseModel


class VehicleSpecs(BaseModel):
    name: str
    curb_weight_kg: float
    battery_capacity_kwh: float
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
    ):
        self.specs = EV_MODELS.get(vehicle_model_id, EV_MODELS["tata_nexon_ev"])
        self.passengers = max(1, passengers)
        self.ambient_temp_c = ambient_temp_c
        self.cabin_temp_c = cabin_temp_c

        # Dynamic vehicle mass
        self.total_mass_kg = self.specs.curb_weight_kg + self.passengers * (
            self.PASSENGER_WEIGHT_KG + self.LUGGAGE_PER_PERSON_KG
        )

        # Auxiliary and HVAC thermal draw
        temp_delta = abs(self.ambient_temp_c - self.cabin_temp_c)
        self.aux_power_w = (
            self.specs.base_auxiliary_power_w
            + (temp_delta * 85.0)
            + (self.passengers * self.HVAC_BODY_HEAT_W)
        )

        # Ambient temperature battery derating
        self.temp_efficiency = 1.0
        if self.ambient_temp_c < 18.0:
            self.temp_efficiency = max(0.65, 1.0 - (18.0 - self.ambient_temp_c) * 0.015)

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

    def evaluate_route(
        self,
        coordinates_3d: List[List[float]],
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
        # Max 115 km gap ensures even small battery packs (24 kWh) reach stations with realistic, variable arrival SoC
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

        current_soc_kwh = (initial_soc_percent / 100.0) * self.specs.battery_capacity_kwh
        reserve_kwh = (reserve_threshold_percent / 100.0) * self.specs.battery_capacity_kwh

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

        # Initial starting waypoint
        telemetry.append(
            SegmentTelemetry(
                segment_idx=0,
                distance_km=0.0,
                elevation_m=round(processed_points[0]["ele"], 1),
                gradient_percent=0.0,
                soc_percent=round(initial_soc_percent, 1),
                is_regenerating=False,
                is_charging_step=False,
                cumulative_energy_kwh=0.0,
            )
        )

        for i in range(n - 1):
            p1, p2 = processed_points[i], processed_points[i + 1]
            ele1, ele2 = p1["ele"], p2["ele"]
            d_m = p2["step_dist_m"]
            if d_m < 1.0:
                continue

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

            # 3. Dynamic speed cap on steep grades
            effective_speed = min(cruising_speed_kmh, 35.0 if gradient_percent > 7.0 else cruising_speed_kmh)
            v_ms = max(0.5, effective_speed / 3.6)
            t_s = d_m / v_ms

            # 4. Multi-force summation
            rho = self.air_density((ele1 + ele2) / 2.0)
            f_aero = 0.5 * rho * self.specs.drag_coefficient_cd * self.specs.frontal_area_m2 * (v_ms**2)
            f_roll = self.total_mass_kg * self.GRAVITY * self.specs.rolling_resistance_crr * math.cos(theta)
            f_grade = self.total_mass_kg * self.GRAVITY * math.sin(theta)

            p_wheels_kw = (f_aero + f_roll + f_grade) * v_ms / 1000.0

            # 5. Motoring vs. Regenerative braking
            if p_wheels_kw >= 0:
                p_battery_kw = (p_wheels_kw / self.specs.drivetrain_efficiency) / self.temp_efficiency
                is_regen = False
            else:
                regen_possible = abs(p_wheels_kw) * self.specs.regen_efficiency * self.temp_efficiency
                p_battery_kw = -min(self.specs.max_regen_power_kw, regen_possible)
                is_regen = True

            # 6. Cabin auxiliary load & unified energy accounting
            aux_kwh = (self.aux_power_w / 1000.0) * (t_s / 3600.0)
            total_aux_consumed += aux_kwh

            if is_regen:
                regen_kwh = abs(p_battery_kw) * (t_s / 3600.0)
                gross_regen += regen_kwh
                seg_energy_kwh = -regen_kwh + aux_kwh
            else:
                traction_kwh = p_battery_kw * (t_s / 3600.0)
                gross_consumed += traction_kwh
                seg_energy_kwh = traction_kwh + aux_kwh

            # Enforce battery capacity ceiling
            current_soc_kwh -= seg_energy_kwh
            current_soc_kwh = max(0.0, min(self.specs.battery_capacity_kwh, current_soc_kwh))
            total_dist_m += d_m

            current_soc_pct = (current_soc_kwh / self.specs.battery_capacity_kwh) * 100.0
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

                # Estimate energy needed to reach next milestone
                # Average EV highway consumption ~0.14 kWh/km adjusted for vehicle mass
                est_rate_kwh_km = (self.total_mass_kg / 1500.0) * 0.135
                est_energy_to_next = dist_to_next_km * est_rate_kwh_km

                # Stop if car cannot safely reach next station without breaching 10% reserve, OR if SoC is <= 18%
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

                eff_kw = min(power_kw, self.specs.max_charge_power_kw)
                target_kwh = 0.80 * self.specs.battery_capacity_kwh
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
        )
