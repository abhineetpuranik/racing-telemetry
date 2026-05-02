# F1 Racing Telemetry Dashboard

A real-time Formula 1 telemetry and race analysis dashboard built with Angular 21. Data is sourced from the [FastF1](https://github.com/theOehrly/Fast-F1) Python library and exported to static JSON files consumed by the frontend.

---

## Overview

The dashboard simulates a live F1 timing screen, letting you explore real session data from past races and qualifying sessions. You can switch between sessions, select individual drivers, and watch the lap counter tick forward in live mode — with all panels updating in sync.

Currently includes data for:
- 🇮🇹 **2023 Italian Grand Prix** — Qualifying & Race (Monza)
- 🇲🇨 **2023 Monaco Grand Prix** — Qualifying & Race (Monaco)

---

## Features

### Dashboard Panels

| Panel | Description |
|---|---|
| **Live Timing Tower** | Full race standings with gap, interval, last lap, sector times, tyre compound, tyre age, and pit count. Values flash on update during live mode. |
| **Lap Breakdown** | Sector-by-sector breakdown of the selected driver's latest lap, with delta vs session best. |
| **Speed Trace** | Speed vs distance chart for the selected driver's fastest lap. Supports a second driver overlay for comparison. DRS zones are highlighted. |
| **Pedal Trace** | Throttle and brake input vs distance for the selected driver's fastest lap. |
| **Tyre Strategy** | Horizontal stint chart showing every driver's tyre compounds and pit stop laps across the full race distance. |
| **Position Tracker** | Gap-to-leader chart over the race distance for all drivers, rendered with Chart.js. |
| **Car Diagnostics** | Estimated wing angles, ERS deployment, MGU-K recovery, and brake temperatures per driver. |
| **Sector Map** | SVG circuit outline (Monza or Monaco, auto-selected by session) with sector times colour-coded by performance — purple for session best, green for personal best, yellow for improvement, grey otherwise. |
| **Lap Evolution** | Lap time trend chart for the selected driver across all laps, filtering out outliers (pit laps, safety car laps). |
| **Telemetry vs Avg** | Overlay of the selected driver's speed/throttle/brake trace against a smoothed "typical lap" average. |

### Live Mode

- Hit **LIVE** in the header to start the lap counter ticking (one lap every 3 seconds)
- All panels update in real time on each tick — standings, lap counter, sector map, tyre strategy, etc.
- Hit **RESTART** to reset back to lap 1
- The session auto-pauses and shows **SESSION COMPLETE** when the final lap is reached

### Session Switching

Select any session from the sidebar dropdown. All panels reload atomically from the cached JSON — no page refresh needed.

### Driver Selection

Click any driver in the timing tower or sidebar to focus all driver-specific panels (lap breakdown, speed trace, pedal trace, sector map, etc.) on that driver.

### Panel Visibility

Toggle individual panels on/off from the sidebar checklist to customise your layout.

### Theme

Light/dark mode toggle in the header.

---

## Tech Stack

### Frontend
- **Angular 21** — standalone components, signals, OnPush change detection throughout
- **RxJS 7** — BehaviorSubject-based state, all panels subscribe to a single `_dataSubject` stream
- **Chart.js 4 + ng2-charts** — speed trace, pedal trace, gap chart, lap evolution, telemetry analysis
- **SCSS** — component-scoped styles, CSS custom properties for theming
- **Tailwind CSS** — utility classes for layout

### Data Pipeline
- **Python + FastF1** — loads session data from the official F1 timing API
- **`fastf1_export.py`** — exports each session to a self-contained JSON file under `racing-telemetry/public/data/`

---

## Project Structure

```
.
├── fastf1_export.py              # Python data export script
├── cache/                        # FastF1 local cache (git-ignored)
└── racing-telemetry/             # Angular application
    ├── public/
    │   └── data/                 # Exported session JSON files
    │       ├── sessions.json     # Session index (id, label, circuitCode)
    │       ├── 2023_MZA_Q.json
    │       ├── 2023_MZA_R.json
    │       ├── 2023_MON_Q.json
    │       └── 2023_MON_R.json
    └── src/app/
        ├── core/
        │   ├── models/           # TypeScript interfaces (Session, Lap, Standing, Stint, …)
        │   └── services/
        │       └── telemetry.service.ts   # Single source of truth for all session data
        ├── dashboard/
        │   ├── layout/
        │   │   ├── header/       # Lap counter, live/pause/restart controls, theme toggle
        │   │   ├── sidebar/      # Session selector, driver list, panel toggles
        │   │   └── shell/        # Root layout, selectedDriver signal
        │   └── panels/           # 10 visualisation components (see Features table above)
        └── shared/
            ├── components/       # panel wrapper, stat-card, delta-chip, tyre-badge
            └── directives/       # value-flash (highlights cells that change)
```

---

## Data Flow

```
FastF1 API
    │
    ▼
fastf1_export.py  ──►  public/data/<session_id>.json
                                │
                                ▼
                    TelemetryService (_dataSubject: BehaviorSubject)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              TimingTower   SectorMap   TyreStrategy  … (all panels)
```

`TelemetryService` is the single source of truth. It fetches the session JSON over HTTP, caches it in memory, and pushes it into a `BehaviorSubject`. Every panel subscribes to this stream — when the session switches or the live lap counter ticks, all panels receive the updated data simultaneously.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.9+ with `fastf1` installed (`pip install fastf1`)

### 1. Install frontend dependencies

```bash
cd racing-telemetry
npm install
```

### 2. Export session data (optional — JSON files are included)

```bash
# From the project root
python fastf1_export.py
```

This downloads and processes session data from the FastF1 cache. Sessions already in `cache/` export instantly; new sessions are downloaded from the F1 API (~100–500 MB each).

To add more sessions, edit the `SESSIONS` list in `fastf1_export.py`:

```python
SESSIONS = [
    (year, "Event Name", "Q", "YYYY_XXX_Q", "XXX", "Circuit Label"),
    (year, "Event Name", "R", "YYYY_XXX_R", "XXX", "Circuit Label"),
]
```

### 3. Run the dev server

```bash
cd racing-telemetry
npm start
```

Open [http://localhost:4200](http://localhost:4200).

---

## Session JSON Format

Each exported file follows this shape:

```typescript
{
  session:     Session,          // id, circuit, circuitCode, totalLaps, currentLap, conditions
  drivers:     Driver[],         // driverCode, fullName, team, teamColor
  lapData:     Record<code, Lap[]>,  // per-driver lap times and sector splits
  telemetry:   Record<code, TelemetryFrame>,  // speed/throttle/brake/gear/DRS vs distance
  drsZones:    DrsZone[],        // start/end distances of DRS activation zones
  standings:   Standing[],       // position, gap, interval, last lap, tyre info
  stints:      Stint[],          // compound, startLap, endLap per driver
  gapHistory:  Record<code, number[]>,  // gap-to-leader per lap
  diagnostics: Record<code, CarDiagnostics>   // estimated wing/ERS/brake temps
}
```

---

## Adding a New Circuit

The sector map SVG is selected by `circuitCode`. To add a new circuit:

1. Add an `@if (circuitCode === 'XXX')` branch in `sector-map.component.html` with an SVG path for each sector
2. Add the circuit's `TEAM_COLORS` entry if needed in `fastf1_export.py`
3. Export the session data and add it to `SESSIONS`
