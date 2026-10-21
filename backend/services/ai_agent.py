"""
CrewAI Fleet Logistics Analyst Service
Generates concise, human-in-the-loop driver briefings explaining physics & charging choices.
"""

import os


def generate_driver_briefing(route_summary: dict, vehicle_name: str, passengers: int, ambient_temp: float) -> str:
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key or openai_key.startswith("your_"):
        # Instant offline fallback for demonstration resilience
        reserve_status = "CRITICAL: Reserve battery breached!" if route_summary.get("reserve_breached") else "Reserve battery intact."
        return (
            f"Route completed for {vehicle_name} with {passengers} passenger(s) in {ambient_temp}°C conditions. "
            f"The route demanded {route_summary.get('net_energy_kwh')} kWh over {route_summary.get('total_distance_km')} km "
            f"with {route_summary.get('total_climb_m')}m of elevation gain. {reserve_status} "
            f"Arriving at final SoC of {route_summary.get('final_soc_percent')}%."
        )

    try:
        from crewai import Agent, Task, Crew
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(model_name="gpt-4o-mini", temperature=0.3)
        analyst = Agent(
            role="EV Logistics Specialist",
            goal="Explain route energy consumption, gradient impact, and charging necessity to drivers succinctly.",
            backstory="You are an expert transportation engineer analyzing vehicle thermodynamics and battery telemetry.",
            verbose=False,
            llm=llm,
        )

        task_prompt = f"""
        Analyze this route data:
        - Vehicle: {vehicle_name}
        - Passengers: {passengers}
        - Ambient Temp: {ambient_temp}°C
        - Total Distance: {route_summary.get('total_distance_km')} km
        - Elevation Gain: {route_summary.get('total_climb_m')} m
        - Net Energy: {route_summary.get('net_energy_kwh')} kWh
        - Final SoC: {route_summary.get('final_soc_percent')}%
        - Reserve Breached (<10%): {route_summary.get('reserve_breached')}

        Write a strictly 3-sentence professional Driver Briefing explaining how the payload, temperature, and elevation affected energy consumption, and advise if a charging stop is mandatory.
        """

        task = Task(description=task_prompt, expected_output="A 3-sentence driver route briefing.", agent=analyst)
        crew = Crew(agents=[analyst], tasks=[task])
        result = crew.kickoff()
        return str(result)
    except Exception as e:
        return f"Telemetry analyzed: Net energy required is {route_summary.get('net_energy_kwh')} kWh. Recommended arrival SoC is {route_summary.get('final_soc_percent')}%."
