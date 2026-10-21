"""
Location-Agnostic EV Physics & Gradient Engine
Calculates micro-segment elevation profiles, road gradients, aerodynamic drag,
rolling resistance, thermal HVAC loads, and motor regen limits.
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
    regen_efficiency: float = 0.72
    base_auxiliary_power_w: float = 650.0


EV_MODELS: Dict[str, VehicleSpecs] = {
    "tata_tiago_ev": VehicleSpecs(
        name="Tata Tiago EV (24 kWh)",
        curb_weight_kg=1150.0,
        battery_capacity_kwh=24.0,
        max_regen_power_kw=25.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.15,
        base_auxiliary_power_w=600.0,
    ),
    "tata_nexon_ev": VehicleSpecs(
        name="Tata Nexon EV (45 kWh)",
        curb_weight_kg=1450.0,
        battery_capacity_kwh=45.0,
        max_regen_power_kw=40.0,
        drag_coefficient_cd=0.32,
        frontal_area_m2=2.42,
        base_auxiliary_power_w=750.0,
    ),
    "mg_zs_ev": VehicleSpecs(
        name="MG ZS EV (50.3 kWh)",
        curb_weight_kg=1610.0,
        battery_capacity_kwh=50.3,
        max_regen_power_kw=45.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.45,
        base_auxiliary_power_w=800.0,
    ),
    "byd_atto_3": VehicleSpecs(
        name="BYD Atto 3 (60.48 kWh)",
        curb_weight_kg=1750.0,
        battery_capacity_kwh=60.48,
        max_regen_power_kw=50.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.52,
        base_auxiliary_power_w=850.0,
    ),
}


class SegmentTelemetry(BaseModel):
    segment_idx: int
    distance_km: float
    elevation_m: float
    gradient_percent: float
    soc_percent: float
    is_regenerating: bool
    cumulative_energy_kwh: float
    is_charging_stop: bool = False
    charging_station_name: Optional[str] = None


class ChargingPlanStop(BaseModel):
    station_id: str
    name: str
    lat: float
    lon: float
    power_kw: float
    arrival_distance_km: float
    arrival_soc_percent: float
    target_soc_percent: float
    energy_added_kwh: float
    charging_time_minutes: float


class RoutePhysicsSummary(BaseModel):
    total_distance_km: float
    total_climb_m: float
    total_descent_m: float
    max_gradient_percent: float
    gross_consumed_kwh: float
    gross_regenerated_kwh: float
    net_energy_kwh: float
    final_soc_percent: float
    reserve_breached: bool
    is_unreachable: bool = False
    total_charging_time_minutes: float = 0.0
    total_energy_charged_kwh: float = 0.0
    charging_stops: List[ChargingPlanStop] = []
    telemetry_profile: List[SegmentTelemetry]
    route_coordinates: Optional[List[List[float]]] = None


class UniversalEVPhysicsEngine:
    GRAVITY = 9.80665
    PASSENGER_WEIGHT_KG = 75.0
    LUGGAGE_WEIGHT_KG = 5.0
    HVAC_BODY_HEAT_W = 120.0

    def __init__(
        self,
        vehicle_model_id: str = "tata_nexon_ev",
        passengers: int = 1,
        ambient_temp_c: float = 30.0,
        cabin_temp_c: float = 22.0,
    ):
        self.specs = EV_MODELS.get(vehicle_model_id, EV_MODELS["tata_nexon_ev"])
        self.passengers = max(1, passengers)
        self.ambient_temp_c = ambient_temp_c
        self.cabin_temp_c = cabin_temp_c

        # Dynamic payload & thermal loads
        self.total_mass_kg = self.specs.curb_weight_kg + self.passengers * (
            self.PASSENGER_WEIGHT_KG + self.LUGGAGE_WEIGHT_KG
        )
        temp_delta = abs(self.ambient_temp_c - self.cabin_temp_c)
        self.aux_power_w = (
            self.specs.base_auxiliary_power_w
            + (temp_delta * 85.0)
            + (self.passengers * self.HVAC_BODY_HEAT_W)
        )

        self.temp_efficiency = 1.0
        if self.ambient_temp_c < 18.0:
            self.temp_efficiency = max(0.65, 1.0 - (18.0 - self.ambient_temp_c) * 0.015)

    @staticmethod
    def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = 6371000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
        a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
        return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    @staticmethod
    def air_density(elevation_m: float) -> float:
        return max(0.7, 1.225 * math.exp(-0.0001185 * max(0.0, elevation_m)))

    def evaluate_route(
        self,
        coordinates_3d: List[List[float]],
        coord_order: str = "lat_lon_ele",
        cruising_speed_kmh: float = 50.0,
        initial_soc_percent: float = 50.0,
        reserve_threshold_percent: float = 12.0,
        target_charge_soc_percent: float = 80.0,
        available_chargers: Optional[List[Dict[str, Any]]] = None,
    ) -> RoutePhysicsSummary:
        if len(coordinates_3d) < 2:
            raise ValueError("Route must contain at least 2 coordinate points.")

        # Parse and filter coordinate elevation noise
        raw_points = []
        for p in coordinates_3d:
            lat = p[0] if coord_order == "lat_lon_ele" else p[1]
            lon = p[1] if coord_order == "lat_lon_ele" else p[0]
            ele = p[2] if len(p) > 2 else 0.0
            raw_points.append({"lat": lat, "lon": lon, "ele": ele})

        # Triangular moving average smoothing across 3 nodes
        n = len(raw_points)
        smoothed_elevations = []
        for i in range(n):
            window = [raw_points[j]["ele"] for j in range(max(0, i - 1), min(n, i + 2))]
            smoothed_elevations.append(sum(window) / len(window))

        current_soc_kwh = (initial_soc_percent / 100.0) * self.specs.battery_capacity_kwh
        reserve_kwh = (reserve_threshold_percent / 100.0) * self.specs.battery_capacity_kwh

        total_dist_m = 0.0
        total_climb_m = 0.0
        total_descent_m = 0.0
        gross_consumed = 0.0
        gross_regen = 0.0
        max_grad = 0.0
        telemetry: List[SegmentTelemetry] = []
        charging_stops: List[ChargingPlanStop] = []
        visited_station_ids = set()
        total_charge_time_min = 0.0
        total_energy_charged = 0.0
        is_unreachable = False

        # Initial point telemetry
        telemetry.append(
            SegmentTelemetry(
                segment_idx=0,
                distance_km=0.0,
                elevation_m=round(smoothed_elevations[0], 1),
                gradient_percent=0.0,
                soc_percent=round(initial_soc_percent, 2),
                is_regenerating=False,
                cumulative_energy_kwh=0.0,
            )
        )

        for i in range(n - 1):
            p1, p2 = raw_points[i], raw_points[i + 1]
            ele1, ele2 = smoothed_elevations[i], smoothed_elevations[i + 1]
            d_m = self.haversine_m(p1["lat"], p1["lon"], p2["lat"], p2["lon"])
            if d_m < 1.0:
                continue

            delta_ele = ele2 - ele1
            gradient_ratio = delta_ele / d_m
            gradient_percent = gradient_ratio * 100.0
            theta = math.atan(gradient_ratio)

            if abs(gradient_percent) > max_grad:
                max_grad = abs(gradient_percent)
            if delta_ele > 0:
                total_climb_m += delta_ele
            else:
                total_descent_m += abs(delta_ele)

            # Gradient speed cap (slow down dynamically on steep climbs)
            effective_speed = min(cruising_speed_kmh, 30.0 if gradient_percent > 7.0 else cruising_speed_kmh)
            v_ms = effective_speed / 3.6
            t_s = d_m / v_ms

            # Multi-force sum
            rho = self.air_density((ele1 + ele2) / 2.0)
            f_aero = 0.5 * rho * self.specs.drag_coefficient_cd * self.specs.frontal_area_m2 * (v_ms**2)
            f_roll = self.total_mass_kg * self.GRAVITY * self.specs.rolling_resistance_crr * math.cos(theta)
            f_grade = self.total_mass_kg * self.GRAVITY * math.sin(theta)

            p_wheels_kw = (f_aero + f_roll + f_grade) * v_ms / 1000.0

            if p_wheels_kw >= 0:
                p_battery_kw = (p_wheels_kw / self.specs.drivetrain_efficiency) / self.temp_efficiency
                is_regen = False
            else:
                regen_possible = abs(p_wheels_kw) * self.specs.regen_efficiency * self.temp_efficiency
                p_battery_kw = -min(self.specs.max_regen_power_kw, regen_possible)
                is_regen = True

            aux_kwh = (self.aux_power_w / 1000.0) * (t_s / 3600.0)
            if is_regen:
                regen_kwh = abs(p_battery_kw) * (t_s / 3600.0)
                gross_regen += regen_kwh
                # Battery net delta accounts for regen credit minus aux draw
                seg_energy_kwh = -regen_kwh + aux_kwh
            else:
                traction_kwh = p_battery_kw * (t_s / 3600.0)
                gross_consumed += traction_kwh + aux_kwh
                seg_energy_kwh = traction_kwh + aux_kwh

            current_soc_kwh -= seg_energy_kwh
            total_dist_m += d_m

            # Check if battery breaches the safety reserve margin (Plan a dynamic charging stop)
            if current_soc_kwh <= reserve_kwh and i < (n - 2):
                chosen_station = None
                if available_chargers:
                    unvisited = [c for c in available_chargers if c.get("id") not in visited_station_ids]
                    if unvisited:
                        def dist_to_station(st):
                            slat = st.get("lat") or st.get("latitude")
                            slon = st.get("lon") or st.get("longitude")
                            if slat is None or slon is None:
                                return float("inf")
                            return self.haversine_m(p2["lat"], p2["lon"], float(slat), float(slon))

                        sorted_chargers = sorted(unvisited, key=dist_to_station)
                        best = sorted_chargers[0]
                        if dist_to_station(best) <= 30000.0:
                            chosen_station = best
                            visited_station_ids.add(best.get("id"))

                if not chosen_station:
                    chosen_station = {
                        "id": f"planned-fast-charger-{len(charging_stops) + 1}",
                        "name": f"Planned Highway Fast Charger #{len(charging_stops) + 1}",
                        "lat": p2["lat"],
                        "lon": p2["lon"],
                        "power_kw": 60.0,
                    }

                arrival_soc_pct = max(1.0, (current_soc_kwh / self.specs.battery_capacity_kwh) * 100.0)
                target_soc_pct = max(target_charge_soc_percent, arrival_soc_pct + 15.0)
                target_soc_kwh = (target_soc_pct / 100.0) * self.specs.battery_capacity_kwh
                added_kwh = max(0.0, target_soc_kwh - current_soc_kwh)

                charger_power = float(chosen_station.get("power_kw") or 50.0)
                eff_kw = min(charger_power, self.specs.max_charge_power_kw)
                charge_mins = (added_kwh / max(10.0, eff_kw)) * 60.0

                stop_entry = ChargingPlanStop(
                    station_id=str(chosen_station.get("id", f"stop-{len(charging_stops)+1}")),
                    name=chosen_station.get("name", "Corridor EV Fast Charger"),
                    lat=float(chosen_station.get("lat", p2["lat"])),
                    lon=float(chosen_station.get("lon", p2["lon"])),
                    power_kw=eff_kw,
                    arrival_distance_km=round(total_dist_m / 1000.0, 2),
                    arrival_soc_percent=round(arrival_soc_pct, 1),
                    target_soc_percent=round(target_soc_pct, 1),
                    energy_added_kwh=round(added_kwh, 2),
                    charging_time_minutes=round(charge_mins, 1),
                )
                charging_stops.append(stop_entry)
                total_charge_time_min += charge_mins
                total_energy_charged += added_kwh

                # Recharged to target SoC to continue the journey
                current_soc_kwh = target_soc_kwh

                telemetry.append(
                    SegmentTelemetry(
                        segment_idx=i + 1,
                        distance_km=round(total_dist_m / 1000.0, 2),
                        elevation_m=round(ele2, 1),
                        gradient_percent=round(gradient_percent, 1),
                        soc_percent=round(target_soc_pct, 1),
                        is_regenerating=False,
                        cumulative_energy_kwh=round(gross_consumed - gross_regen, 3),
                        is_charging_stop=True,
                        charging_station_name=stop_entry.name,
                    )
                )

            current_soc_kwh = max(0.0, min(self.specs.battery_capacity_kwh, current_soc_kwh))
            current_soc_pct = (current_soc_kwh / self.specs.battery_capacity_kwh) * 100.0

            telemetry.append(
                SegmentTelemetry(
                    segment_idx=i + 1,
                    distance_km=round(total_dist_m / 1000.0, 2),
                    elevation_m=round(ele2, 1),
                    gradient_percent=round(gradient_percent, 1),
                    soc_percent=round(current_soc_pct, 2),
                    is_regenerating=is_regen,
                    cumulative_energy_kwh=round(gross_consumed - gross_regen, 3),
                )
            )

        net_kwh = gross_consumed - gross_regen
        final_soc = (current_soc_kwh / self.specs.battery_capacity_kwh) * 100.0
        
        # If the trip was able to replenish via planned charging stops and reaches destination safely:
        reserve_breached = final_soc < (reserve_threshold_percent * 0.8) and len(charging_stops) == 0
        if final_soc <= 0.0 and len(charging_stops) == 0:
            is_unreachable = True

        return RoutePhysicsSummary(
            total_distance_km=round(total_dist_m / 1000.0, 2),
            total_climb_m=round(total_climb_m, 1),
            total_descent_m=round(total_descent_m, 1),
            max_gradient_percent=round(max_grad, 1),
            gross_consumed_kwh=round(gross_consumed, 3),
            gross_regenerated_kwh=round(gross_regen, 3),
            net_energy_kwh=round(net_kwh, 3),
            final_soc_percent=round(final_soc, 1),
            reserve_breached=reserve_breached,
            is_unreachable=is_unreachable,
            total_charging_time_minutes=round(total_charge_time_min, 1),
            total_energy_charged_kwh=round(total_energy_charged, 2),
            charging_stops=charging_stops,
            telemetry_profile=telemetry,
            route_coordinates=[[p["lon"], p["lat"]] for p in raw_points],
        )
