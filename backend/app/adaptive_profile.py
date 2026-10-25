"""
UnStranded: Grey-Box Adaptive Vehicle Profiles & Telematics Calibration
Maintains vehicle variant database and driver-specific Exponential Moving Average (EMA) tuning.
"""

from typing import Dict, Optional, Any
from pydantic import BaseModel, Field


class VehicleVariant(BaseModel):
    variant_id: str
    display_name: str
    model_name: str
    brand: str = ""
    nominal_capacity_kwh: float
    usable_capacity_kwh: float
    battery_chemistry: str = "LFP"
    curb_weight_kg: float
    drag_coefficient_cd: float
    frontal_area_m2: float
    base_crr: float = 0.012
    max_charge_power_kw: float = 50.0
    max_regen_power_kw: float = 40.0
    drivetrain_efficiency: float = 0.91
    regen_efficiency: float = 0.75
    rolling_resistance_crr: float = 0.012
    base_auxiliary_power_w: float = 650.0

    @property
    def name(self) -> str:
        return self.display_name

    @property
    def battery_capacity_kwh(self) -> float:
        return self.nominal_capacity_kwh


VEHICLE_VARIANTS_DB: Dict[str, VehicleVariant] = {
    # ==========================
    # 1. TATA MOTORS
    # ==========================
    "tiago_ev_mr": VehicleVariant(
        variant_id="tiago_ev_mr",
        display_name="Tata Tiago EV Medium Range (19.2 kWh)",
        model_name="Tata Tiago EV",
        nominal_capacity_kwh=19.2,
        usable_capacity_kwh=18.5,
        battery_chemistry="LFP",
        curb_weight_kg=1120.0,
        drag_coefficient_cd=0.34,
        frontal_area_m2=2.12,
        max_charge_power_kw=25.0,
        max_regen_power_kw=20.0,
    ),
    "tiago_ev_lr": VehicleVariant(
        variant_id="tiago_ev_lr",
        display_name="Tata Tiago EV Long Range (24.0 kWh)",
        model_name="Tata Tiago EV",
        nominal_capacity_kwh=24.0,
        usable_capacity_kwh=23.0,
        battery_chemistry="LFP",
        curb_weight_kg=1160.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.15,
        max_charge_power_kw=25.0,
        max_regen_power_kw=22.0,
    ),
    "tigor_ev": VehicleVariant(
        variant_id="tigor_ev",
        display_name="Tata Tigor EV (26.0 kWh)",
        model_name="Tata Tigor EV",
        nominal_capacity_kwh=26.0,
        usable_capacity_kwh=25.0,
        battery_chemistry="LFP",
        curb_weight_kg=1235.0,
        drag_coefficient_cd=0.32,
        frontal_area_m2=2.18,
        max_charge_power_kw=25.0,
        max_regen_power_kw=22.0,
    ),
    "punch_ev_mr": VehicleVariant(
        variant_id="punch_ev_mr",
        display_name="Tata Punch EV Medium Range (25.0 kWh)",
        model_name="Tata Punch EV",
        nominal_capacity_kwh=25.0,
        usable_capacity_kwh=24.0,
        battery_chemistry="LFP",
        curb_weight_kg=1320.0,
        drag_coefficient_cd=0.35,
        frontal_area_m2=2.38,
        max_charge_power_kw=30.0,
        max_regen_power_kw=28.0,
    ),
    "punch_ev_lr": VehicleVariant(
        variant_id="punch_ev_lr",
        display_name="Tata Punch EV Long Range (35.0 kWh)",
        model_name="Tata Punch EV",
        nominal_capacity_kwh=35.0,
        usable_capacity_kwh=33.5,
        battery_chemistry="LFP",
        curb_weight_kg=1365.0,
        drag_coefficient_cd=0.35,
        frontal_area_m2=2.38,
        max_charge_power_kw=35.0,
        max_regen_power_kw=32.0,
    ),
    "nexon_ev_mr": VehicleVariant(
        variant_id="nexon_ev_mr",
        display_name="Tata Nexon EV Medium Range (30.2 kWh)",
        model_name="Tata Nexon EV",
        nominal_capacity_kwh=30.2,
        usable_capacity_kwh=29.0,
        battery_chemistry="LFP",
        curb_weight_kg=1400.0,
        drag_coefficient_cd=0.32,
        frontal_area_m2=2.40,
        max_charge_power_kw=30.0,
        max_regen_power_kw=30.0,
    ),
    "nexon_ev_max": VehicleVariant(
        variant_id="nexon_ev_max",
        display_name="Tata Nexon EV Max (40.5 kWh)",
        model_name="Tata Nexon EV",
        nominal_capacity_kwh=40.5,
        usable_capacity_kwh=39.0,
        battery_chemistry="LFP",
        curb_weight_kg=1450.0,
        drag_coefficient_cd=0.32,
        frontal_area_m2=2.42,
        max_charge_power_kw=50.0,
        max_regen_power_kw=38.0,
    ),
    "nexon_ev_lr": VehicleVariant(
        variant_id="nexon_ev_lr",
        display_name="Tata Nexon EV Long Range (45.0 kWh)",
        model_name="Tata Nexon EV",
        nominal_capacity_kwh=45.0,
        usable_capacity_kwh=43.5,
        battery_chemistry="LFP",
        curb_weight_kg=1480.0,
        drag_coefficient_cd=0.32,
        frontal_area_m2=2.42,
        max_charge_power_kw=60.0,
        max_regen_power_kw=42.0,
    ),
    "curvv_ev_45": VehicleVariant(
        variant_id="curvv_ev_45",
        display_name="Tata Curvv EV (45.0 kWh)",
        model_name="Tata Curvv EV",
        nominal_capacity_kwh=45.0,
        usable_capacity_kwh=43.5,
        battery_chemistry="LFP",
        curb_weight_kg=1437.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.45,
        max_charge_power_kw=70.0,
        max_regen_power_kw=45.0,
    ),
    "curvv_ev_55": VehicleVariant(
        variant_id="curvv_ev_55",
        display_name="Tata Curvv EV (55.0 kWh)",
        model_name="Tata Curvv EV",
        nominal_capacity_kwh=55.0,
        usable_capacity_kwh=53.0,
        battery_chemistry="LFP",
        curb_weight_kg=1525.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.45,
        max_charge_power_kw=70.0,
        max_regen_power_kw=50.0,
    ),
    "harrier_ev_65": VehicleVariant(
        variant_id="harrier_ev_65",
        display_name="Tata Harrier EV RWD (65.0 kWh)",
        model_name="Tata Harrier EV",
        nominal_capacity_kwh=65.0,
        usable_capacity_kwh=62.0,
        battery_chemistry="LFP",
        curb_weight_kg=1820.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.72,
        max_charge_power_kw=100.0,
        max_regen_power_kw=60.0,
    ),
    "harrier_ev_75": VehicleVariant(
        variant_id="harrier_ev_75",
        display_name="Tata Harrier EV AWD (75.0 kWh)",
        model_name="Tata Harrier EV",
        nominal_capacity_kwh=75.0,
        usable_capacity_kwh=72.0,
        battery_chemistry="LFP",
        curb_weight_kg=1940.0,
        drag_coefficient_cd=0.33,
        frontal_area_m2=2.72,
        max_charge_power_kw=120.0,
        max_regen_power_kw=75.0,
    ),

    # ==========================
    # 2. MG MOTOR (JSW MG)
    # ==========================
    "mg_comet_ev": VehicleVariant(
        variant_id="mg_comet_ev",
        display_name="MG Comet EV (17.3 kWh)",
        model_name="MG Comet EV",
        nominal_capacity_kwh=17.3,
        usable_capacity_kwh=16.5,
        battery_chemistry="LFP",
        curb_weight_kg=815.0,
        drag_coefficient_cd=0.38,
        frontal_area_m2=1.95,
        max_charge_power_kw=3.3,
        max_regen_power_kw=12.0,
    ),
    "mg_windsor_38": VehicleVariant(
        variant_id="mg_windsor_38",
        display_name="MG Windsor EV (38.0 kWh)",
        model_name="MG Windsor EV",
        nominal_capacity_kwh=38.0,
        usable_capacity_kwh=36.5,
        battery_chemistry="LFP",
        curb_weight_kg=1540.0,
        drag_coefficient_cd=0.30,
        frontal_area_m2=2.52,
        max_charge_power_kw=45.0,
        max_regen_power_kw=35.0,
    ),
    "mg_windsor_53": VehicleVariant(
        variant_id="mg_windsor_53",
        display_name="MG Windsor EV Pro (52.9 kWh)",
        model_name="MG Windsor EV",
        nominal_capacity_kwh=52.9,
        usable_capacity_kwh=50.5,
        battery_chemistry="LFP",
        curb_weight_kg=1610.0,
        drag_coefficient_cd=0.30,
        frontal_area_m2=2.52,
        max_charge_power_kw=60.0,
        max_regen_power_kw=42.0,
    ),
    "mg_zs_ev_50": VehicleVariant(
        variant_id="mg_zs_ev_50",
        display_name="MG ZS EV Exclusive (50.3 kWh)",
        model_name="MG ZS EV",
        nominal_capacity_kwh=50.3,
        usable_capacity_kwh=48.0,
        battery_chemistry="NMC",
        curb_weight_kg=1610.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.45,
        max_charge_power_kw=50.0,
        max_regen_power_kw=45.0,
    ),

    # ==========================
    # 3. MAHINDRA
    # ==========================
    "xuv400_ec_pro": VehicleVariant(
        variant_id="xuv400_ec_pro",
        display_name="Mahindra XUV400 EC Pro (34.5 kWh)",
        model_name="Mahindra XUV400",
        nominal_capacity_kwh=34.5,
        usable_capacity_kwh=33.0,
        battery_chemistry="LFP",
        curb_weight_kg=1578.0,
        drag_coefficient_cd=0.34,
        frontal_area_m2=2.46,
        max_charge_power_kw=50.0,
        max_regen_power_kw=40.0,
    ),
    "xuv400_el_pro": VehicleVariant(
        variant_id="xuv400_el_pro",
        display_name="Mahindra XUV400 EL Pro (39.4 kWh)",
        model_name="Mahindra XUV400",
        nominal_capacity_kwh=39.4,
        usable_capacity_kwh=38.0,
        battery_chemistry="LFP",
        curb_weight_kg=1600.0,
        drag_coefficient_cd=0.34,
        frontal_area_m2=2.46,
        max_charge_power_kw=50.0,
        max_regen_power_kw=42.0,
    ),
    "mahindra_be6e_59": VehicleVariant(
        variant_id="mahindra_be6e_59",
        display_name="Mahindra BE 6e (59.0 kWh)",
        model_name="Mahindra BE 6e",
        nominal_capacity_kwh=59.0,
        usable_capacity_kwh=56.5,
        battery_chemistry="LFP",
        curb_weight_kg=1780.0,
        drag_coefficient_cd=0.30,
        frontal_area_m2=2.55,
        max_charge_power_kw=140.0,
        max_regen_power_kw=65.0,
    ),
    "mahindra_be6e_79": VehicleVariant(
        variant_id="mahindra_be6e_79",
        display_name="Mahindra BE 6e (79.0 kWh)",
        model_name="Mahindra BE 6e",
        nominal_capacity_kwh=79.0,
        usable_capacity_kwh=76.0,
        battery_chemistry="LFP",
        curb_weight_kg=1890.0,
        drag_coefficient_cd=0.30,
        frontal_area_m2=2.55,
        max_charge_power_kw=175.0,
        max_regen_power_kw=75.0,
    ),
    "mahindra_xev9e_79": VehicleVariant(
        variant_id="mahindra_xev9e_79",
        display_name="Mahindra XEV 9e (79.0 kWh)",
        model_name="Mahindra XEV 9e",
        nominal_capacity_kwh=79.0,
        usable_capacity_kwh=76.0,
        battery_chemistry="LFP",
        curb_weight_kg=1940.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.62,
        max_charge_power_kw=175.0,
        max_regen_power_kw=75.0,
    ),

    # ==========================
    # 4. HYUNDAI & KIA
    # ==========================
    "hyundai_creta_ev": VehicleVariant(
        variant_id="hyundai_creta_ev",
        display_name="Hyundai Creta EV (42.0 kWh)",
        model_name="Hyundai Creta EV",
        nominal_capacity_kwh=42.0,
        usable_capacity_kwh=40.5,
        battery_chemistry="NMC",
        curb_weight_kg=1530.0,
        drag_coefficient_cd=0.31,
        frontal_area_m2=2.48,
        max_charge_power_kw=50.0,
        max_regen_power_kw=42.0,
    ),
    "hyundai_ioniq_5": VehicleVariant(
        variant_id="hyundai_ioniq_5",
        display_name="Hyundai Ioniq 5 RWD (72.6 kWh)",
        model_name="Hyundai Ioniq 5",
        nominal_capacity_kwh=72.6,
        usable_capacity_kwh=70.0,
        battery_chemistry="NMC",
        curb_weight_kg=1910.0,
        drag_coefficient_cd=0.288,
        frontal_area_m2=2.54,
        max_charge_power_kw=220.0,
        max_regen_power_kw=80.0,
    ),
    "kia_ev6": VehicleVariant(
        variant_id="kia_ev6",
        display_name="Kia EV6 GT-Line AWD (77.4 kWh)",
        model_name="Kia EV6",
        nominal_capacity_kwh=77.4,
        usable_capacity_kwh=74.0,
        battery_chemistry="NMC",
        curb_weight_kg=2090.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.50,
        max_charge_power_kw=240.0,
        max_regen_power_kw=85.0,
    ),

    # ==========================
    # 5. MARUTI SUZUKI & CITROEN
    # ==========================
    "citroen_ec3": VehicleVariant(
        variant_id="citroen_ec3",
        display_name="Citroen eC3 (29.2 kWh)",
        model_name="Citroen eC3",
        nominal_capacity_kwh=29.2,
        usable_capacity_kwh=28.0,
        battery_chemistry="LFP",
        curb_weight_kg=1316.0,
        drag_coefficient_cd=0.34,
        frontal_area_m2=2.32,
        max_charge_power_kw=30.0,
        max_regen_power_kw=25.0,
    ),
    "maruti_e_vitara_49": VehicleVariant(
        variant_id="maruti_e_vitara_49",
        display_name="Maruti Suzuki e Vitara (49.0 kWh)",
        model_name="Maruti Suzuki e Vitara",
        nominal_capacity_kwh=49.0,
        usable_capacity_kwh=46.5,
        battery_chemistry="LFP",
        curb_weight_kg=1550.0,
        drag_coefficient_cd=0.31,
        frontal_area_m2=2.46,
        max_charge_power_kw=60.0,
        max_regen_power_kw=45.0,
    ),
    "maruti_e_vitara_61": VehicleVariant(
        variant_id="maruti_e_vitara_61",
        display_name="Maruti Suzuki e Vitara (61.0 kWh)",
        model_name="Maruti Suzuki e Vitara",
        nominal_capacity_kwh=61.0,
        usable_capacity_kwh=58.0,
        battery_chemistry="LFP",
        curb_weight_kg=1640.0,
        drag_coefficient_cd=0.31,
        frontal_area_m2=2.46,
        max_charge_power_kw=70.0,
        max_regen_power_kw=50.0,
    ),

    # ==========================
    # 6. BYD
    # ==========================
    "byd_atto_3_dyn": VehicleVariant(
        variant_id="byd_atto_3_dyn",
        display_name="BYD Atto 3 Dynamic (49.92 kWh)",
        model_name="BYD Atto 3",
        nominal_capacity_kwh=49.92,
        usable_capacity_kwh=48.0,
        battery_chemistry="LFP",
        curb_weight_kg=1680.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.52,
        max_charge_power_kw=70.0,
        max_regen_power_kw=50.0,
    ),
    "byd_atto_3_sup": VehicleVariant(
        variant_id="byd_atto_3_sup",
        display_name="BYD Atto 3 Superior (60.48 kWh)",
        model_name="BYD Atto 3",
        nominal_capacity_kwh=60.48,
        usable_capacity_kwh=58.5,
        battery_chemistry="LFP",
        curb_weight_kg=1750.0,
        drag_coefficient_cd=0.29,
        frontal_area_m2=2.52,
        max_charge_power_kw=80.0,
        max_regen_power_kw=50.0,
    ),
    "byd_emax_7": VehicleVariant(
        variant_id="byd_emax_7",
        display_name="BYD eMAX 7 MPV (71.8 kWh)",
        model_name="BYD eMAX 7",
        nominal_capacity_kwh=71.8,
        usable_capacity_kwh=69.0,
        battery_chemistry="LFP",
        curb_weight_kg=1915.0,
        drag_coefficient_cd=0.31,
        frontal_area_m2=2.68,
        max_charge_power_kw=85.0,
        max_regen_power_kw=55.0,
    ),
    "byd_seal_dyn": VehicleVariant(
        variant_id="byd_seal_dyn",
        display_name="BYD Seal Dynamic RWD (61.44 kWh)",
        model_name="BYD Seal",
        nominal_capacity_kwh=61.44,
        usable_capacity_kwh=59.0,
        battery_chemistry="LFP",
        curb_weight_kg=1930.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.29,
        max_charge_power_kw=110.0,
        max_regen_power_kw=60.0,
    ),
    "byd_seal_prem": VehicleVariant(
        variant_id="byd_seal_prem",
        display_name="BYD Seal Premium/Perf AWD (82.56 kWh)",
        model_name="BYD Seal",
        nominal_capacity_kwh=82.56,
        usable_capacity_kwh=79.5,
        battery_chemistry="LFP",
        curb_weight_kg=2055.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.29,
        max_charge_power_kw=150.0,
        max_regen_power_kw=75.0,
    ),

    # ==========================
    # 7. GLOBAL PREMIUM EVS
    # ==========================
    "tesla_model_3": VehicleVariant(
        variant_id="tesla_model_3",
        display_name="Tesla Model 3 Long Range (78.1 kWh)",
        model_name="Tesla Model 3",
        brand="Tesla",
        nominal_capacity_kwh=78.1,
        usable_capacity_kwh=75.0,
        battery_chemistry="NMC",
        curb_weight_kg=1765.0,
        drag_coefficient_cd=0.219,
        frontal_area_m2=2.22,
        max_charge_power_kw=250.0,
        max_regen_power_kw=70.0,
        base_auxiliary_power_w=700.0,
    ),
    "tesla_model_y": VehicleVariant(
        variant_id="tesla_model_y",
        display_name="Tesla Model Y Long Range (78.1 kWh)",
        model_name="Tesla Model Y",
        brand="Tesla",
        nominal_capacity_kwh=78.1,
        usable_capacity_kwh=75.0,
        battery_chemistry="NMC",
        curb_weight_kg=1980.0,
        drag_coefficient_cd=0.23,
        frontal_area_m2=2.54,
        max_charge_power_kw=250.0,
        max_regen_power_kw=75.0,
        base_auxiliary_power_w=800.0,
    ),
    "volvo_ex40": VehicleVariant(
        variant_id="volvo_ex40",
        display_name="Volvo EX40 Recharge (82.0 kWh)",
        model_name="Volvo EX40",
        brand="Volvo",
        nominal_capacity_kwh=82.0,
        usable_capacity_kwh=78.0,
        battery_chemistry="NMC",
        curb_weight_kg=2040.0,
        drag_coefficient_cd=0.329,
        frontal_area_m2=2.56,
        max_charge_power_kw=200.0,
        max_regen_power_kw=65.0,
        base_auxiliary_power_w=850.0,
    ),
    "bmw_i4": VehicleVariant(
        variant_id="bmw_i4",
        display_name="BMW i4 eDrive40 (83.9 kWh)",
        model_name="BMW i4",
        brand="BMW",
        nominal_capacity_kwh=83.9,
        usable_capacity_kwh=80.7,
        battery_chemistry="NMC",
        curb_weight_kg=2050.0,
        drag_coefficient_cd=0.24,
        frontal_area_m2=2.31,
        max_charge_power_kw=205.0,
        max_regen_power_kw=80.0,
        base_auxiliary_power_w=850.0,
    ),
    "mercedes_eqb": VehicleVariant(
        variant_id="mercedes_eqb",
        display_name="Mercedes-Benz EQB 350 4MATIC (66.5 kWh)",
        model_name="Mercedes-Benz EQB",
        brand="Mercedes-Benz",
        nominal_capacity_kwh=66.5,
        usable_capacity_kwh=64.0,
        battery_chemistry="NMC",
        curb_weight_kg=2175.0,
        drag_coefficient_cd=0.28,
        frontal_area_m2=2.53,
        max_charge_power_kw=100.0,
        max_regen_power_kw=55.0,
        base_auxiliary_power_w=900.0,
    ),
}

# Aliases for backward compatibility
VEHICLE_VARIANTS_DB["xuv400_ec"] = VEHICLE_VARIANTS_DB["xuv400_ec_pro"]
VEHICLE_VARIANTS_DB["xuv400_el"] = VEHICLE_VARIANTS_DB["xuv400_el_pro"]
VEHICLE_VARIANTS_DB["atto3_dynamic"] = VEHICLE_VARIANTS_DB["byd_atto_3_dyn"]
VEHICLE_VARIANTS_DB["atto3_superior"] = VEHICLE_VARIANTS_DB["byd_atto_3_sup"]
VEHICLE_VARIANTS_DB["byd_seal_dynamic"] = VEHICLE_VARIANTS_DB["byd_seal_dyn"]
VEHICLE_VARIANTS_DB["byd_seal_premium"] = VEHICLE_VARIANTS_DB["byd_seal_prem"]
VEHICLE_VARIANTS_DB["kia_ev6_lr"] = VEHICLE_VARIANTS_DB["kia_ev6"]
VEHICLE_VARIANTS_DB["tata_nexon_ev"] = VEHICLE_VARIANTS_DB["nexon_ev_lr"]
VEHICLE_VARIANTS_DB["tata_tiago_ev"] = VEHICLE_VARIANTS_DB["tiago_ev_lr"]
VEHICLE_VARIANTS_DB["mg_zs_ev"] = VEHICLE_VARIANTS_DB["mg_zs_ev_50"]
VEHICLE_VARIANTS_DB["byd_atto_3"] = VEHICLE_VARIANTS_DB["byd_atto_3_sup"]
VEHICLE_VARIANTS_DB["byd_seal"] = VEHICLE_VARIANTS_DB["byd_seal_prem"]


class CalibrationFactors(BaseModel):
    driver_aggression_factor: float = Field(default=1.0)
    crr_offset: float = Field(default=0.0)
    calibrated_capacity_kwh: float
    trips_completed: int = 0
    confidence_score: float = Field(default=0.35)


class UserSignupRequest(BaseModel):
    user_id: str
    variant_id: str
    registration_year: int
    odometer_km: float = 0.0


class StreamlinedRouteRequest(BaseModel):
    user_id: str
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    current_soc_percent: float
    passengers: int = 1
    variant_id: Optional[str] = None
    vehicle_model: Optional[str] = None
    ambient_temp_c: Optional[float] = 32.0


class TripClosureRecord(BaseModel):
    trip_id: str
    user_id: str
    predicted_final_soc: float
    actual_final_soc: float
    initial_soc: float
    distance_km: float
    gross_predicted_energy_kwh: float
    origin_name: Optional[str] = None
    destination_name: Optional[str] = None


import math

def execute_grey_box_calibration(
    user_row: Dict[str, Any],
    predicted_soc: float,
    actual_soc: float,
    initial_soc: float,
    gross_energy_kwh: float,
    distance_km: float,
) -> Dict[str, Any]:
    trips_completed = user_row.get("trips_completed", 0) + 1
    new_odometer = float(user_row.get("current_odometer_km", 0.0)) + distance_km

    # Adaptive learning rate decaying with completed trips
    alpha = max(0.08, 0.35 / (1.0 + 0.2 * trips_completed))

    # SoC residual error: positive means battery depleted faster than anticipated
    soc_error_pct = predicted_soc - actual_soc

    # 1. Update Driver Aggression Factor
    current_aggression = float(user_row.get("driver_aggression_factor", 1.0))
    if abs(soc_error_pct) > 0.5:
        correction = (soc_error_pct / 100.0) * 1.5
        new_aggression = max(0.85, min(1.35, current_aggression + (alpha * correction)))
    else:
        new_aggression = current_aggression

    # 2. Update Usable Battery Capacity
    variant = VEHICLE_VARIANTS_DB.get(user_row.get("variant_id"))
    usable_cap = variant.usable_capacity_kwh if variant else float(user_row.get("calibrated_capacity_kwh", 40.0))
    actual_soc_delta = max(1.0, initial_soc - actual_soc)
    inferred_capacity = (gross_energy_kwh / actual_soc_delta) * 100.0
    inferred_capacity = max(usable_cap * 0.55, min(usable_cap * 1.02, inferred_capacity))

    current_capacity = float(user_row.get("calibrated_capacity_kwh", usable_cap))
    new_capacity = (1.0 - alpha) * current_capacity + (alpha * inferred_capacity)

    # 3. Update Confidence Score
    new_confidence = min(0.98, 0.30 + (0.15 * math.log(trips_completed + 1)))

    return {
        "trips_completed": trips_completed,
        "current_odometer_km": round(new_odometer, 1),
        "driver_aggression_factor": round(new_aggression, 3),
        "calibrated_capacity_kwh": round(new_capacity, 2),
        "confidence_score": round(new_confidence, 2),
        "updated_at": "now()",
    }
