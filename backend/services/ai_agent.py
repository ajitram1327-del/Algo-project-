"""
AI Fleet Logistics Analyst Service using CrewAI & LangChain OpenAI.
Generates an operational, exactly three-sentence Driver Route Briefing.
Gracefully provides deterministic factual briefings if LLM keys are absent or API calls fail.
"""

import os
import re
import logging
from typing import Dict, Any, List, Optional
from models import DriverBriefing, Vehicle, ChargingStop, PhysicsEstimate

logger = logging.getLogger("ai_agent")


def _generate_deterministic_briefing(
    vehicle: Vehicle,
    distance_km: float,
    current_soc: float,
    physics_estimate: PhysicsEstimate,
    charging_stops: List[ChargingStop],
    temperature_c: float,
    passengers: int,
    origin_name: str = "Manipal",
    dest_name: str = "Malpe Beach",
) -> str:
    """
    Generates a deterministic, strictly factual 3-sentence briefing.
    Sentence 1: Route viability, distance, battery SoC start and arrival.
    Sentence 2: Environmental (temp) and passenger load impact on energy.
    Sentence 3: Charging stop recommendation or confirmation of direct travel.
    """
    # Sentence 1: Route overview & battery status
    s1 = (
        f"Your {distance_km:.1f} km transit from {origin_name} to {dest_name} in the "
        f"{vehicle.make} {vehicle.model} departs at {current_soc:.0f}% battery and is projected to arrive at "
        f"{physics_estimate.projected_final_soc:.0f}% State of Charge."
    )

    # Sentence 2: Physics-aware temperature & passenger overhead
    combined_pct = round(physics_estimate.temp_impact_pct + physics_estimate.passenger_impact_pct, 1)
    s2 = (
        f"Operating at {temperature_c:.0f}°C with {passengers} passengers onboard introduces an estimated "
        f"{combined_pct:+.1f}% load factor, resulting in a net consumption of {physics_estimate.net_energy_kwh:.2f} kWh."
    )

    # Sentence 3: Actionable charging guidance
    if charging_stops:
        stop_names = ", ".join([s.name for s in charging_stops])
        s3 = (
            f"Because battery reserves approach minimum thresholds, an operational charging stop at "
            f"{stop_names} is recommended before continuing to your final destination."
        )
    else:
        s3 = (
            f"With ample battery reserves exceeding the safety reserve threshold, you can reach {dest_name} "
            f"directly without intermediate charging stops."
        )

    return f"{s1} {s2} {s3}"


def _enforce_three_sentences(text: str, fallback_briefing: str) -> str:
    """
    Validates that the output contains exactly three sentences.
    If the LLM produced more or fewer, extracts or falls back to ensure contract compliance.
    """
    # Split text into sentences using standard punctuation delimiters
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]

    if len(sentences) == 3:
        return " ".join(sentences)
    elif len(sentences) > 3:
        # Take the first three coherent sentences
        return " ".join(sentences[:3])
    else:
        return fallback_briefing


async def generate_driver_briefing(
    vehicle: Vehicle,
    distance_km: float,
    current_soc: float,
    physics_estimate: PhysicsEstimate,
    charging_stops: List[ChargingStop],
    temperature_c: float,
    passengers: int,
    origin_name: str = "Manipal",
    dest_name: str = "Malpe Beach",
) -> DriverBriefing:
    """
    Orchestrates the CrewAI Fleet Logistics Analyst agent to generate a 3-sentence briefing.
    Falls back gracefully if OpenAI credentials are missing or execution fails.
    """
    api_key = os.getenv("OPENAI_API_KEY", "").strip()

    # Pre-calculate deterministic fallback briefing
    deterministic_text = _generate_deterministic_briefing(
        vehicle=vehicle,
        distance_km=distance_km,
        current_soc=current_soc,
        physics_estimate=physics_estimate,
        charging_stops=charging_stops,
        temperature_c=temperature_c,
        passengers=passengers,
        origin_name=origin_name,
        dest_name=dest_name,
    )

    # Check if OpenAI API key is configured
    if not api_key or api_key == "your_openai_api_key_here":
        logger.info("OpenAI API key not configured. Using deterministic driver briefing.")
        return DriverBriefing(
            briefing=deterministic_text,
            is_fallback=True,
            agent_role="Fleet Logistics Analyst (Deterministic Demonstration)",
            sentence_count=3,
        )

    try:
        # Import CrewAI dynamically so unconfigured environments don't fail at startup
        from crewai import Agent, Task, Crew, Process
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            api_key=api_key,
            temperature=0.2,
            max_tokens=250,
        )

        analyst = Agent(
            role="Fleet Logistics Analyst",
            goal="Provide factual, strictly three-sentence operational EV driver briefings based on trip telemetry.",
            backstory=(
                "You are an expert EV fleet dispatcher and energy analyst. You summarize trip telemetry "
                "with maximum precision, zero fluff, and exactly three declarative sentences."
            ),
            llm=llm,
            verbose=False,
            allow_delegation=False,
        )

        stops_desc = (
            f"{len(charging_stops)} required stop(s) at {[s.name for s in charging_stops]}"
            if charging_stops
            else "None (direct trip feasible)"
        )

        task_prompt = (
            f"Review the following route telemetry for a trip from {origin_name} to {dest_name}:\n"
            f"- Vehicle: {vehicle.make} {vehicle.model} ({vehicle.battery_usable_kwh:.1f} kWh usable)\n"
            f"- Route Distance: {distance_km:.1f} km\n"
            f"- Initial SoC: {current_soc:.0f}% | Projected Final SoC: {physics_estimate.projected_final_soc:.0f}%\n"
            f"- Net Estimated Energy: {physics_estimate.net_energy_kwh:.2f} kWh\n"
            f"- Ambient Temperature: {temperature_c:.0f}°C (HVAC impact: {physics_estimate.temp_impact_pct:+.1f}%)\n"
            f"- Passenger Payload: {passengers} occupants (Payload impact: {physics_estimate.passenger_impact_pct:+.1f}%)\n"
            f"- Charging Stops: {stops_desc}\n\n"
            f"Output requirements:\n"
            f"Write an operational briefing of EXACTLY THREE SENTENCES.\n"
            f"Sentence 1 must state distance, route status, and battery levels.\n"
            f"Sentence 2 must describe the impact of temperature and passengers on energy consumption.\n"
            f"Sentence 3 must provide charging advice or confirm direct arrival without stops."
        )

        briefing_task = Task(
            description=task_prompt,
            expected_output="An exact 3-sentence operational driver briefing.",
            agent=analyst,
        )

        crew = Crew(
            agents=[analyst],
            tasks=[briefing_task],
            process=Process.sequential,
            verbose=False,
        )

        result = crew.kickoff()
        output_text = str(result).strip()

        cleaned_text = _enforce_three_sentences(output_text, deterministic_text)

        return DriverBriefing(
            briefing=cleaned_text,
            is_fallback=False,
            agent_role="CrewAI Fleet Logistics Analyst (Live LLM)",
            sentence_count=3,
        )

    except Exception as e:
        logger.warning(f"CrewAI execution failed: {e}. Falling back to deterministic briefing.")
        return DriverBriefing(
            briefing=deterministic_text,
            is_fallback=True,
            agent_role="Fleet Logistics Analyst (Fallback Mode)",
            sentence_count=3,
        )
