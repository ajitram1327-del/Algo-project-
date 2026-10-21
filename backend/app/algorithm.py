"""
Label-Setting Resource-Constrained Shortest Path (RCSP) search algorithm for EV routing.
Takes into account physics-calculated energy consumption, elevation changes,
battery reserve thresholds, and dynamic charging station stops.
"""

from dataclasses import dataclass, field
import heapq
import time
from typing import List, Dict, Any, Optional, Tuple
import networkx as nx

from app.physics import PhysicsEngine


@dataclass(order=True)
class Label:
    """
    Search label for the Label-Setting multi-criteria search.
    Ordered by:
    1. accumulated_distance (primary - shortest distance)
    2. stops_count (secondary - fewest charging stops)
    3. negative soc (tertiary - highest remaining SoC)
    """
    distance: float
    stops_count: int
    neg_soc: float
    current_node: str = field(compare=False)
    soc: float = field(compare=False)
    net_energy_kwh: float = field(compare=False)
    path: List[str] = field(compare=False)
    charging_stops: List[Dict[str, Any]] = field(compare=False)
    segments: List[Dict[str, Any]] = field(compare=False)


def dominates(d1: float, soc1: float, stops1: int, d2: float, soc2: float, stops2: int) -> bool:
    """
    Pareto dominance check.
    Label 1 dominates Label 2 if it is at least as good in all objectives
    and strictly better in at least one.
    Objectives to minimize: distance, stops_count.
    Objective to maximize: soc.
    """
    better_or_equal = (d1 <= d2 + 1e-6) and (soc1 >= soc2 - 1e-4) and (stops1 <= stops2)
    strictly_better = (d1 < d2 - 1e-6) or (soc1 > soc2 + 1e-4) or (stops1 < stops2)
    return better_or_equal and strictly_better


class RCSPRouter:
    """
    Label-Setting Resource-Constrained Shortest Path Solver for EVs.
    """

    def __init__(
        self,
        graph: nx.DiGraph,
        physics_engine: Optional[PhysicsEngine] = None,
        min_reserve_soc: float = 10.0,
        target_charge_soc: float = 80.0,
    ):
        self.g = graph
        self.physics = physics_engine or PhysicsEngine()
        self.min_reserve_soc = min_reserve_soc
        self.target_charge_soc = target_charge_soc

    def find_optimal_route(
        self,
        start_node: str,
        dest_node: str,
        initial_soc: float,
    ) -> Optional[Dict[str, Any]]:
        """
        Executes label-setting search from start_node to dest_node.

        :param start_node: Starting node ID (e.g. 'N0')
        :param dest_node: Destination node ID (e.g. 'N14')
        :param initial_soc: Initial battery percentage (e.g. 25.0)
        :return: Optimal route dictionary or None if unfeasible
        """
        if start_node not in self.g or dest_node not in self.g:
            return None

        # Priority Queue for label setting
        heap: List[Label] = []

        # Non-dominated labels per node: node_id -> list of (distance, soc, stops_count)
        node_labels: Dict[str, List[Tuple[float, float, int]]] = {
            n: [] for n in self.g.nodes
        }

        # Initial label at start node
        start_label = Label(
            distance=0.0,
            stops_count=0,
            neg_soc=-initial_soc,
            current_node=start_node,
            soc=initial_soc,
            net_energy_kwh=0.0,
            path=[start_node],
            charging_stops=[],
            segments=[],
        )

        heapq.heappush(heap, start_label)
        node_labels[start_node].append((0.0, initial_soc, 0))

        best_solution: Optional[Label] = None

        while heap:
            curr = heapq.heappop(heap)

            # Check if destination reached
            if curr.current_node == dest_node:
                # First time reaching destination with heap order gives best distance / minimal stops
                best_solution = curr
                break

            u = curr.current_node

            # Explore neighbors of u
            for v in self.g.successors(u):
                # Cycle prevention: Do not revisit nodes already in current path
                if v in curr.path:
                    continue

                edge_data = self.g[u][v]
                dist = edge_data["distance"]
                elev_change = edge_data["elevation_change"]
                speed = edge_data.get("speed_limit", 50.0)
                road_name = edge_data.get("road_name", f"{u}->{v}")

                # 1. Physics Engine energy calculation
                seg_energy_kwh = self.physics.calculate_segment_energy(
                    distance_km=dist,
                    elevation_change_m=elev_change,
                    speed_kmh=speed,
                )
                soc_delta = self.physics.calculate_soc_delta(seg_energy_kwh)
                arrival_soc = min(100.0, curr.soc + soc_delta)

                # 2. Prune paths that breach minimum reserve threshold
                if arrival_soc < self.min_reserve_soc:
                    # Vehicle would run out of battery or breach emergency reserve
                    continue

                new_dist = curr.distance + dist
                new_energy = curr.net_energy_kwh + seg_energy_kwh
                new_path = curr.path + [v]

                segment_record = {
                    "from_node": u,
                    "to_node": v,
                    "road_name": road_name,
                    "distance_km": round(dist, 2),
                    "elevation_change_m": round(elev_change, 1),
                    "speed_kmh": round(speed, 1),
                    "energy_kwh": round(seg_energy_kwh, 4),
                    "soc_before": round(curr.soc, 2),
                    "soc_after": round(arrival_soc, 2),
                }
                new_segments = curr.segments + [segment_record]

                v_data = self.g.nodes[v]
                is_station = v_data.get("is_charging_station", False) and (v != dest_node)

                # Option A: Arrive at v and continue WITHOUT charging
                self._consider_label(
                    heap=heap,
                    node_labels=node_labels,
                    distance=new_dist,
                    soc=arrival_soc,
                    net_energy=new_energy,
                    node=v,
                    path=new_path,
                    charging_stops=curr.charging_stops,
                    segments=new_segments,
                )

                # Option B: If v is a Charging Station and battery is below target,
                # generate an additional charged label resetting SoC to 80%
                if is_station and arrival_soc < self.target_charge_soc:
                    charge_info = v_data.get("station_info", {})
                    station_name = charge_info.get("name", f"Station at {v}")
                    power_kw = charge_info.get("power_kw", 60.0)

                    energy_added_kwh = (
                        (self.target_charge_soc - arrival_soc)
                        / 100.0
                        * self.physics.battery_capacity_kwh
                    )
                    # Charging time (minutes) assuming constant average power
                    charging_time_min = (energy_added_kwh / power_kw) * 60.0

                    stop_record = {
                        "node": v,
                        "station_name": station_name,
                        "arrival_soc": round(arrival_soc, 2),
                        "departure_soc": round(self.target_charge_soc, 2),
                        "energy_added_kwh": round(energy_added_kwh, 2),
                        "power_kw": round(power_kw, 1),
                        "charging_time_min": round(charging_time_min, 1),
                    }
                    charged_stops = curr.charging_stops + [stop_record]

                    self._consider_label(
                        heap=heap,
                        node_labels=node_labels,
                        distance=new_dist,
                        soc=self.target_charge_soc,
                        net_energy=new_energy,
                        node=v,
                        path=new_path,
                        charging_stops=charged_stops,
                        segments=new_segments,
                    )

        if not best_solution:
            return None

        return {
            "feasible": True,
            "path": best_solution.path,
            "path_names": [self.g.nodes[nid]["name"] for nid in best_solution.path],
            "total_distance_km": round(best_solution.distance, 2),
            "net_energy_kwh": round(best_solution.net_energy_kwh, 3),
            "initial_soc": round(initial_soc, 2),
            "final_soc": round(best_solution.soc, 2),
            "charging_stops": best_solution.charging_stops,
            "segments": best_solution.segments,
        }

    def _consider_label(
        self,
        heap: List[Label],
        node_labels: Dict[str, List[Tuple[float, float, int]]],
        distance: float,
        soc: float,
        net_energy: float,
        node: str,
        path: List[str],
        charging_stops: List[Dict[str, Any]],
        segments: List[Dict[str, Any]],
    ) -> None:
        """
        Applies Pareto dominance filtering and pushes non-dominated labels onto the heap.
        """
        stops_count = len(charging_stops)
        existing_list = node_labels[node]

        # 1. Prune if an existing label at this node dominates the candidate
        for ex_dist, ex_soc, ex_stops in existing_list:
            if dominates(ex_dist, ex_soc, ex_stops, distance, soc, stops_count):
                return

        # 2. Candidate is non-dominated: eliminate existing labels that this candidate dominates
        node_labels[node] = [
            (ex_dist, ex_soc, ex_stops)
            for ex_dist, ex_soc, ex_stops in existing_list
            if not dominates(distance, soc, stops_count, ex_dist, ex_soc, ex_stops)
        ]
        node_labels[node].append((distance, soc, stops_count))

        # 3. Push onto priority queue
        new_label = Label(
            distance=round(distance, 4),
            stops_count=stops_count,
            neg_soc=-round(soc, 4),
            current_node=node,
            soc=round(soc, 4),
            net_energy_kwh=round(net_energy, 4),
            path=path,
            charging_stops=charging_stops,
            segments=segments,
        )
        heapq.heappush(heap, new_label)
