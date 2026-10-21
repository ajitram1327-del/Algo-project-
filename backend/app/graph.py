"""
Synthetic graph module for Manipal-to-Malpe Beach EV route network.
Built with NetworkX, containing 15 intersections with geographic coordinates,
elevations, edge distances, elevation changes, and 3 charging stations.
"""

from typing import Dict, Any, List
import networkx as nx


def build_manipal_malpe_graph() -> nx.DiGraph:
    """
    Constructs and returns the directed road network graph from Manipal to Malpe Beach.
    """
    g = nx.DiGraph()

    # 15 Intersections / Landmarks
    nodes_data = {
        "N0": {
            "name": "Manipal Tiger Circle",
            "lat": 13.3525,
            "lng": 74.7865,
            "elevation": 75.0,
            "is_charging_station": False,
        },
        "N1": {
            "name": "Syndicate Circle",
            "lat": 13.3550,
            "lng": 74.7830,
            "elevation": 72.0,
            "is_charging_station": False,
        },
        "N2": {
            "name": "MIT Junction",
            "lat": 13.3510,
            "lng": 74.7920,
            "elevation": 80.0,
            "is_charging_station": False,
        },
        "N3": {
            "name": "Coin Circle",
            "lat": 13.3565,
            "lng": 74.7790,
            "elevation": 66.0,
            "is_charging_station": False,
        },
        "N4": {
            "name": "Laxmindra Nagar",
            "lat": 13.3530,
            "lng": 74.7710,
            "elevation": 54.0,
            "is_charging_station": False,
        },
        "N5": {
            "name": "Indrali Junction",
            "lat": 13.3515,
            "lng": 74.7620,
            "elevation": 42.0,
            "is_charging_station": True,
            "station_info": {
                "name": "Indrali EV Fast Hub",
                "power_kw": 60.0,
                "plugs": ["CCS2", "Type 2"],
            },
        },
        "N6": {
            "name": "Kalsanka Junction",
            "lat": 13.3480,
            "lng": 74.7550,
            "elevation": 30.0,
            "is_charging_station": False,
        },
        "N7": {
            "name": "Udupi City Bus Stand",
            "lat": 13.3410,
            "lng": 74.7470,
            "elevation": 22.0,
            "is_charging_station": False,
        },
        "N8": {
            "name": "Karavali Bypass",
            "lat": 13.3380,
            "lng": 74.7380,
            "elevation": 18.0,
            "is_charging_station": True,
            "station_info": {
                "name": "Karavali Highway Supercharge",
                "power_kw": 120.0,
                "plugs": ["CCS2", "CHAdeMO"],
            },
        },
        "N9": {
            "name": "Santhekatte Junction",
            "lat": 13.3720,
            "lng": 74.7450,
            "elevation": 20.0,
            "is_charging_station": False,
        },
        "N10": {
            "name": "Ambagilu Junction",
            "lat": 13.3600,
            "lng": 74.7420,
            "elevation": 25.0,
            "is_charging_station": False,
        },
        "N11": {
            "name": "Adi Udupi",
            "lat": 13.3350,
            "lng": 74.7300,
            "elevation": 14.0,
            "is_charging_station": False,
        },
        "N12": {
            "name": "Kallianpur Cross",
            "lat": 13.3650,
            "lng": 74.7200,
            "elevation": 12.0,
            "is_charging_station": False,
        },
        "N13": {
            "name": "Malpe Port Cross",
            "lat": 13.3450,
            "lng": 74.7100,
            "elevation": 6.0,
            "is_charging_station": True,
            "station_info": {
                "name": "Malpe Port Coastal Fast Charger",
                "power_kw": 50.0,
                "plugs": ["CCS2"],
            },
        },
        "N14": {
            "name": "Malpe Beach Sea Walk",
            "lat": 13.3505,
            "lng": 74.6985,
            "elevation": 3.0,
            "is_charging_station": False,
        },
    }

    for node_id, attrs in nodes_data.items():
        g.add_node(node_id, **attrs)

    # Road segments definitions (bidirectional road network)
    # format: (from_node, to_node, distance_km, speed_limit_kmh, road_name)
    undirected_connections = [
        ("N0", "N1", 0.6, 40.0, "Tiger Circle - Syndicate Circle Rd"),
        ("N0", "N2", 0.8, 40.0, "Manipal MIT Link"),
        ("N2", "N1", 1.1, 40.0, "MIT - Syndicate Inner Ring"),
        ("N1", "N3", 0.5, 45.0, "Syndicate - Coin Circle Main Rd"),
        ("N3", "N4", 1.1, 50.0, "Manipal-Udupi Ghat Descent"),
        ("N4", "N5", 1.2, 50.0, "Indrali Approach Rd"),
        ("N5", "N6", 1.5, 50.0, "Indrali - Kalsanka Expressway"),
        ("N5", "N10", 2.8, 55.0, "Perampalli - Ambagilu Link"),
        ("N6", "N7", 1.2, 40.0, "Kalsanka - City Bus Stand Arterial"),
        ("N6", "N10", 1.8, 45.0, "Ambagilu Bypass Connector"),
        ("N7", "N8", 1.1, 45.0, "City Bus Stand - Karavali Bypass"),
        ("N10", "N9", 1.6, 55.0, "Ambagilu - Santhekatte NH66"),
        ("N9", "N12", 3.0, 50.0, "Santhekatte - Kallianpur Rd"),
        ("N8", "N11", 1.0, 50.0, "Karavali - Adi Udupi Rd"),
        ("N8", "N13", 3.2, 60.0, "Malpe Coastal Express Highway"),
        ("N11", "N13", 2.5, 45.0, "Adi Udupi - Malpe Port Rd"),
        ("N12", "N13", 2.6, 45.0, "Kallianpur - Malpe Port Road"),
        ("N12", "N14", 2.8, 45.0, "Kallianpur - Malpe Beach Scenic Rd"),
        ("N13", "N14", 1.4, 40.0, "Malpe Port - Beach Sea Walk"),
    ]

    for u, v, dist, speed, name in undirected_connections:
        elev_u = nodes_data[u]["elevation"]
        elev_v = nodes_data[v]["elevation"]

        # Forward edge u -> v
        g.add_edge(
            u,
            v,
            distance=dist,
            elevation_change=elev_v - elev_u,
            speed_limit=speed,
            road_name=name,
        )

        # Reverse edge v -> u
        g.add_edge(
            v,
            u,
            distance=dist,
            elevation_change=elev_u - elev_v,
            speed_limit=speed,
            road_name=f"{name} (Reverse)",
        )

    return g


def get_graph_summary(g: nx.DiGraph) -> Dict[str, Any]:
    """
    Returns structured metadata of nodes, edges, and charging stations for the frontend.
    """
    nodes = []
    for node_id, data in g.nodes(data=True):
        nodes.append({
            "id": node_id,
            "name": data["name"],
            "lat": data["lat"],
            "lng": data["lng"],
            "elevation": data["elevation"],
            "is_charging_station": data.get("is_charging_station", False),
            "station_info": data.get("station_info", None),
        })

    edges = []
    for u, v, data in g.edges(data=True):
        edges.append({
            "from": u,
            "to": v,
            "distance": data["distance"],
            "elevation_change": data["elevation_change"],
            "speed_limit": data["speed_limit"],
            "road_name": data.get("road_name", ""),
        })

    return {
        "node_count": g.number_of_nodes(),
        "edge_count": g.number_of_edges(),
        "charging_stations": [n for n in nodes if n["is_charging_station"]],
        "nodes": nodes,
        "edges": edges,
    }
