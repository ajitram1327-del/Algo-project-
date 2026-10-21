# Intelligent EV Charger Recommendation Using Physics-Aware Route Optimization

An end-to-end academic web prototype that optimizes electric vehicle (EV) routes from **Manipal (Academic Plateau, ~75m elevation)** to **Malpe Beach (Arabian Sea Shoreline, ~3m elevation)** using vehicle physics, environmental thermodynamics, elevation-aware regenerative braking, and an autonomous **CrewAI Fleet Logistics Analyst** driver briefing.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │    Next.js 16 (App Router + Tailwind)   │
                      │  Interactive Leaflet Map + Dashboard    │
                      └────────────────────┬────────────────────┘
                                           │ Axios HTTP Requests
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │       FastAPI (Python 3.12 Backend)     │
                      │       Main Router: /api/route           │
                      └───────┬────────────┬────────────┬───────┘
                              │            │            │
       ┌──────────────────────┘            │            └──────────────────────┐
       ▼                                   ▼                                   ▼
┌──────────────┐                ┌──────────────────────┐             ┌──────────────────┐
│  Chargetrip  │                │ Physics-Aware Engine │             │  CrewAI Agent    │
│  GraphQL API │                │ - Drag & Rolling F.  │             │ Fleet Logistics  │
│ (Live / Demo │                │ - Elevation & Regen  │             │ Analyst (Exact   │
│  Route Map)  │                │ - Temp / HVAC Load   │             │ 3-Sentence Brief)│
└──────────────┘                └──────────────────────┘             └──────────────────┘
```

### Key Capabilities
1. **Deterministic Physics-Aware Energy Modeling**:
   - Aerodynamic drag ($F_{\text{aero}} = \frac{1}{2}\rho C_d A v^2$)
   - Rolling friction ($F_{\text{rr}} = m g C_{\text{rr}}$)
   - Gravitational gradient work ($W_{\text{grav}} = m g \Delta h$) with $70\%$ regenerative braking recapture down the Manipal ghat descent ($-72\text{ m}$)
   - Ambient temperature impact ($10^\circ\text{C}$ to $45^\circ\text{C}$) modeling cabin HVAC compressor load and cold electrolyte resistance
   - Passenger payload overhead scaling with occupant count ($1$ to $5$ passengers)
2. **Dual-Mode Routing Engine (Live Chargetrip & Demonstration)**:
   - Integrates with the [Chargetrip GraphQL API](https://chargetrip.com/) (`newRoute` mutation, bounded polling).
   - If API credentials are not provided or the service is unreachable, automatically uses a high-fidelity local demonstration route with valid GeoJSON `[longitude, latitude]` coordinates and an academic demo charger at Karavali Bypass.
   - **Never presents mock data as live data**: Prominent badges and telemetry cards clearly label live vs demo data sources.
3. **CrewAI Operational Driver Briefing**:
   - Employs a CrewAI "Fleet Logistics Analyst" powered by LangChain OpenAI (`gpt-4o-mini`).
   - Strictly constrained to verified route telemetry (distance, energy, starting/arrival SoC, stops, weather overhead).
   - Enforces an **exact three-sentence format** covering:
     1. Route overview & battery status
     2. Environmental (temperature) & payload overhead
     3. Actionable charging guidance or direct-arrival confirmation
   - Seamlessly falls back to a deterministic 3-sentence operational briefing when LLM keys are absent.
4. **Interactive Leaflet Visualization**:
   - Client-rendered Leaflet map (`react-leaflet` with `ssr: false`).
   - Dynamic auto-fit bounds (`fitBounds`) centered between Manipal and Malpe Beach.
   - Distinct markers for Origin, Destination, and Fast DC Charging Stations.

---

## Project Structure

```
ALgo project/
├── backend/
│   ├── app/                      # RCSP networkx engine from Stage 1
│   ├── services/
│   │   ├── __init__.py
│   │   ├── chargetrip.py         # Chargetrip GraphQL client & fallback engine
│   │   ├── physics_estimator.py  # Physics-aware thermodynamic & elevation model
│   │   └── ai_agent.py           # CrewAI Fleet Logistics Analyst agent
│   ├── tests/
│   │   └── test_api.py           # Pytest suite for API validation & physics logic
│   ├── models.py                 # Pydantic schemas (RouteRequest, RouteResponse, etc.)
│   ├── main.py                   # FastAPI server entry point & CORS
│   ├── requirements.txt          # Python dependencies
│   └── .env.example              # Placeholder template for backend keys
├── frontend/
│   ├── app/
│   │   ├── globals.css           # Tailwind CSS & Leaflet map styling
│   │   ├── layout.tsx            # Next.js root layout
│   │   └── page.tsx              # Responsive EV dashboard & controls
│   ├── components/
│   │   └── Map.tsx               # Client-only Leaflet Map with GeoJSON polyline
│   ├── lib/
│   │   └── api.ts                # Axios API client & TypeScript interfaces
│   ├── package.json              # Next.js, react-leaflet, lucide-react
│   └── tsconfig.json             # TypeScript configuration
├── .env                          # Local environment variables
├── .gitignore                    # Git exclusions
└── README.md                     # Documentation
```

---

## Prerequisites

- **Python**: Version `3.11` or `3.12` installed.
- **Node.js**: Version `18.x`, `20.x`, or `24.x` with `npm`.
- **Operating System**: Windows, macOS, or Linux.

---

## Environment Configuration

Create or update the `.env` file in the project root:

```env
# AI Orchestration (CrewAI Driver Briefing)
# Optional for localized demonstration; required for live LLM synthesis
OPENAI_API_KEY=""

# Chargetrip GraphQL API Credentials
# Optional for localized demonstration; required for live Chargetrip routing
CHARGETRIP_CLIENT_ID=""
CHARGETRIP_APP_ID=""

# Backend / Frontend Communication
NEXT_PUBLIC_API_URL="http://127.0.0.1:8000"
```

> **Note**: If `CHARGETRIP_*` or `OPENAI_API_KEY` are left blank, the application automatically runs in **Deterministic Demonstration Mode**. All features (maps, vehicle selection, temperature/payload physics sliders, charging stops, and driver briefings) work end-to-end out of the box.

---

## Running the Application

### 1. Start the FastAPI Backend

Open a terminal in the project root:

```powershell
# Activate backend virtual environment
.\backend\venv\Scripts\Activate.ps1

# Run the FastAPI server with live reloading
python -m uvicorn main:app --app-dir backend --reload --port 8000
```

- Backend API: `http://127.0.0.1:8000`
- Interactive Swagger Docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

### 2. Start the Next.js Frontend

Open a second terminal in the project root:

```powershell
# Navigate to frontend and start the development server
cd frontend
npm run dev
```

- Frontend Dashboard: `http://localhost:3000`

---

## Running the Automated Test Suite

To run the backend test suite verifying request validation, GeoJSON coordinate ordering, physics formulas, and sentence count enforcement:

```powershell
$env:PYTHONPATH="backend"
.\backend\venv\Scripts\python -m pytest backend\tests -v
```

All 10 test cases run deterministically in `< 1.0s`.

---

## API Reference

### `GET /api/health`
Returns system status and external integration configuration flags (without exposing secrets).

### `GET /api/vehicles`
Returns the available EV fleet. Returns live vehicles if Chargetrip is configured, or 5 built-in demo EVs (Tata Nexon EV, MG ZS EV, Hyundai Ioniq 5, Tesla Model 3, Mahindra XUV400).

### `POST /api/route`
Calculates route, runs physics analysis, and synthesizes driver briefing.

**Request Payload:**
```json
{
  "vehicle_id": "demo-tata-nexon-ev",
  "temperature_c": 32.0,
  "passengers": 2,
  "current_soc": 12.0,
  "origin_lat": 13.3409,
  "origin_lng": 74.7858,
  "dest_lat": 13.3490,
  "dest_lng": 74.7003
}
```

**Response Payload Highlights:**
```json
{
  "is_fallback": true,
  "data_source": "Deterministic Local Demonstration Engine (Manipal to Malpe Route)",
  "distance_km": 12.2,
  "duration_min": 22.0,
  "geometry": {
    "type": "LineString",
    "coordinates": [[74.7858, 13.3409], [74.7380, 13.3380], [74.7003, 13.3490]]
  },
  "charging_stops": [
    {
      "id": "mock-karavali-ev-plaza",
      "name": "Karavali Bypass Fast EV Plaza (Demo Station)",
      "coordinates": [74.7380, 13.3380],
      "power_kw": 120.0,
      "arrival_soc": 18.5,
      "departure_soc": 80.0,
      "charge_time_min": 18.2,
      "is_mock": true
    }
  ],
  "physics_estimate": {
    "base_energy_kwh": 1.684,
    "temp_impact_pct": 10.5,
    "passenger_impact_pct": 2.0,
    "elevation_gain_loss_kwh": -0.274,
    "net_energy_kwh": 1.620,
    "projected_final_soc": 8.0,
    "assumptions": [...]
  },
  "driver_briefing": {
    "briefing": "Your 12.2 km transit from Manipal to Malpe Beach departs at 12% battery... A precautionary charging stop at Karavali Bypass is recommended...",
    "is_fallback": true,
    "agent_role": "Fleet Logistics Analyst (Deterministic Demonstration)",
    "sentence_count": 3
  }
}
```
