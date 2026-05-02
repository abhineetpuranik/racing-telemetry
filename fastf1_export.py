"""
FastF1 -> Angular JSON exporter
================================
Exports real F1 session data into the JSON format consumed by the Angular
racing-telemetry app. Output goes to racing-telemetry/public/data/

Usage:
    python fastf1_export.py

Currently exports the sessions listed in SESSIONS below.
Only sessions already in the local cache will load instantly.
Others will be downloaded from the FastF1 API (~100-500 MB each).

Requirements:
    pip install fastf1
"""

import fastf1
import json
import math
import os
from pathlib import Path

# â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fastf1.Cache.enable_cache("cache")

OUTPUT_DIR = Path("racing-telemetry/public/data")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# (year, fastf1_event_name, fastf1_session_type, export_id, circuit_code, circuit_label)
# The 2023 Monza Q session is already cached locally â€” exports instantly.
# Add more sessions here as you cache them.
SESSIONS = [
    (2023, "Monza", "Q", "2023_MZA_Q", "MZA", "Italian Grand Prix"),
    (2023, "Monza", "R", "2023_MZA_R", "MZA", "Italian Grand Prix"),
    (2023, "Monaco", "Q", "2023_MON_Q", "MON", "Monaco Grand Prix"),
    (2023, "Monaco", "R", "2023_MON_R", "MON", "Monaco Grand Prix"),
]

# 2023 team colors
TEAM_COLORS = {
    "Red Bull Racing":  "#3671C6",
    "McLaren":          "#FF8000",
    "Ferrari":          "#E8002D",
    "Mercedes":         "#27F4D2",
    "Aston Martin":     "#229971",
    "Alpine":           "#0093CC",
    "Williams":         "#64C4FF",
    "AlphaTauri":       "#5E8FAA",
    "RB":               "#6692FF",
    "Alfa Romeo":       "#C92D4B",
    "Haas F1 Team":     "#B6BABD",
}

COMPOUND_MAP = {
    "SOFT": "SOFT", "MEDIUM": "MEDIUM", "HARD": "HARD",
    "INTERMEDIATE": "INTERMEDIATE", "WET": "WET",
    "UNKNOWN": "MEDIUM", "TEST_UNKNOWN": "MEDIUM",
}

SESSION_NAME_MAP = {
    "R": "RACE", "Q": "QUALIFYING",
    "SQ": "SPRINT QUALIFYING", "S": "SPRINT",
}

# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def safe_ms(td) -> int:
    try:
        v = td.total_seconds()
        return 0 if math.isnan(v) else int(round(v * 1000))
    except Exception:
        return 0

def safe_float(val, default=0.0) -> float:
    try:
        f = float(val)
        return default if math.isnan(f) else f
    except Exception:
        return default

def safe_int(val, default=0) -> int:
    try:
        f = float(val)
        return default if math.isnan(f) else int(round(f))
    except Exception:
        return default

def normalise_compound(raw) -> str:
    return COMPOUND_MAP.get(str(raw).upper(), "MEDIUM") if raw else "MEDIUM"

def conditions_from_weather(weather_df) -> str:
    if weather_df is None or weather_df.empty:
        return "DRY"
    if "Rainfall" not in weather_df.columns:
        return "DRY"
    rain_frac = float(weather_df["Rainfall"].mean())
    if rain_frac == 0:
        return "DRY"
    return "WET" if rain_frac > 0.5 else "MIXED"

def resample_telemetry(tel, n=500):
    """Resample telemetry to n evenly-spaced distance points."""
    import numpy as np

    if tel is None or tel.empty:
        return [], [], [], [], [], []

    tel = tel.dropna(subset=["Distance", "Speed"])
    if len(tel) < 2:
        return [], [], [], [], [], []

    dist_raw = tel["Distance"].values.astype(float)
    spd_raw  = tel["Speed"].values.astype(float)

    # Enforce monotonically increasing distance
    mask = [True]
    for i in range(1, len(dist_raw)):
        mask.append(dist_raw[i] > dist_raw[i - 1])
    dist_raw = dist_raw[mask]
    spd_raw  = spd_raw[mask]

    if len(dist_raw) < 2:
        return [], [], [], [], [], []

    dist_new = np.linspace(dist_raw[0], dist_raw[-1], n)

    def interp_col(col):
        if col not in tel.columns:
            return [0.0] * n
        raw = tel[col].values.astype(float)[mask]
        if len(raw) != len(dist_raw):
            return [0.0] * n
        return np.interp(dist_new, dist_raw, raw).tolist()

    speed    = [round(v, 1) for v in np.interp(dist_new, dist_raw, spd_raw)]
    throttle = [round(v, 1) for v in interp_col("Throttle")]
    gear     = [safe_int(v) for v in interp_col("nGear")]
    distance = [round(v, 1) for v in dist_new.tolist()]

    # Brake: FastF1 gives boolean (0/1) â€” scale to 0-100
    if "Brake" in tel.columns:
        brk_raw = tel["Brake"].values.astype(float)[mask]
        brk_interp = np.interp(dist_new, dist_raw, brk_raw)
        brake = [round(v * 100 if brk_interp.max() <= 1.0 else v, 1) for v in brk_interp]
    else:
        brake = [0.0] * n

    # DRS: values 10/12/14 = active in FastF1
    if "DRS" in tel.columns:
        drs_raw = tel["DRS"].values.astype(float)[mask]
        drs_interp = np.interp(dist_new, dist_raw, drs_raw)
        drs = [bool(v >= 10) for v in drs_interp]
    else:
        drs = [False] * n

    return distance, speed, throttle, brake, gear, drs

def build_drs_zones(tel) -> list:
    if tel is None or tel.empty:
        return []
    if "DRS" not in tel.columns or "Distance" not in tel.columns:
        return []

    zones, in_zone, zone_start = [], False, 0.0
    for _, row in tel.iterrows():
        active = safe_float(row.get("DRS", 0)) >= 10
        dist   = safe_float(row.get("Distance", 0))
        if active and not in_zone:
            in_zone, zone_start = True, dist
        elif not active and in_zone:
            in_zone = False
            if dist - zone_start > 50:
                zones.append({"start": round(zone_start), "end": round(dist)})
    if in_zone:
        zones.append({"start": round(zone_start),
                      "end": round(safe_float(tel["Distance"].iloc[-1]))})
    return zones

def build_gap_history(laps_df, driver_codes: list, total_laps: int) -> dict:
    gaps = {code: [] for code in driver_codes}
    for lap_num in range(1, total_laps + 1):
        lap_slice = laps_df[laps_df["LapNumber"] == lap_num]
        leader_time = None
        for code in driver_codes:
            row = lap_slice[lap_slice["Driver"] == code]
            if row.empty:
                continue
            try:
                t = row.iloc[0]["Time"].total_seconds()
                if not math.isnan(t) and (leader_time is None or t < leader_time):
                    leader_time = t
            except Exception:
                pass
        for code in driver_codes:
            row = lap_slice[lap_slice["Driver"] == code]
            prev = gaps[code][-1] if gaps[code] else 0.0
            if row.empty or leader_time is None:
                gaps[code].append(round(prev, 3))
                continue
            try:
                t = row.iloc[0]["Time"].total_seconds()
                gaps[code].append(round(max(0.0, t - leader_time), 3))
            except Exception:
                gaps[code].append(round(prev, 3))
    return gaps

def estimate_diagnostics(code: str, tel_data: dict) -> dict:
    """Estimate car diagnostics from telemetry since FastF1 doesn't expose them."""
    if tel_data:
        thr = tel_data["throttle"]
        brk = tel_data["brake"]
        spd = tel_data["speed"]
        avg_thr = sum(thr) / len(thr) if thr else 50
        avg_brk = sum(brk) / len(brk) if brk else 20
        max_spd = max(spd) if spd else 250
        ers  = round(min(100, avg_thr * 1.1), 1)
        mguk = round(min(100, avg_brk * 2.5 + 30), 1)
        bt   = 300 + avg_brk * 4
        fw   = round(max(50, min(95, 120 - max_spd * 0.15)), 1)
        rw   = round(max(40, min(85, 110 - max_spd * 0.15)), 1)
    else:
        ers, mguk, bt, fw, rw = 80.0, 60.0, 480, 75.0, 65.0

    return {
        "driverCode":          code,
        "frontWingLeft":       fw,
        "frontWingRight":      round(fw - 1, 1),
        "rearWingLeft":        rw,
        "rearWingRight":       round(rw + 1, 1),
        "ersDeployment":       ers,
        "mguKRecovery":        mguk,
        "frontBrakeTempLeft":  round(bt + 20),
        "frontBrakeTempRight": round(bt + 15),
        "rearBrakeTempLeft":   round(bt - 30),
        "rearBrakeTempRight":  round(bt - 35),
    }

# â”€â”€ Per-session export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def export_session(year, event_name, session_type, session_id, circuit_code, circuit_label):
    print(f"\n{'='*60}")
    print(f"  {year} {event_name} â€” {session_type}  [{session_id}]")
    print(f"{'='*60}")

    session = fastf1.get_session(year, event_name, session_type)
    session.load(telemetry=True, weather=True, messages=False)

    laps_df   = session.laps
    event_inf = session.event

    # â”€â”€ Session object â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    total_laps = int(laps_df["LapNumber"].max()) if not laps_df.empty else 0
    date_str   = str(event_inf["EventDate"])[:10]
    conditions = conditions_from_weather(
        session.weather_data if hasattr(session, "weather_data") else None
    )

    session_obj = {
        "id":          session_id,
        "sessionName": SESSION_NAME_MAP.get(session_type, session_type),
        "circuit":     circuit_label,
        "circuitCode": circuit_code,
        "date":        date_str,
        "totalLaps":   total_laps,
        "currentLap":  total_laps,
        "conditions":  conditions,
    }

    # â”€â”€ Drivers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    drivers_out, driver_codes = [], []
    for drv_num in session.drivers:
        try:
            info  = session.get_driver(drv_num)
            code  = str(info.get("Abbreviation", drv_num))
            team  = str(info.get("TeamName", "Unknown"))
            drivers_out.append({
                "driverCode": code,
                "fullName":   f"{info.get('FirstName','')} {info.get('LastName','')}".strip(),
                "carNumber":  safe_int(info.get("DriverNumber", 0)),
                "team":       team,
                "teamColor":  TEAM_COLORS.get(team, "#888888"),
            })
            driver_codes.append(code)
        except Exception as e:
            print(f"  Driver {drv_num} error: {e}")

    print(f"  Drivers ({len(driver_codes)}): {driver_codes}")

    # â”€â”€ Lap data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    lap_data_out = {}
    session_best_time = None

    # Find session best lap time first
    for code in driver_codes:
        for _, lap in laps_df[laps_df["Driver"] == code].iterrows():
            lt = safe_ms(lap.get("LapTime"))
            if lt > 0 and (session_best_time is None or lt < session_best_time):
                session_best_time = lt

    for code in driver_codes:
        drv_laps = laps_df[laps_df["Driver"] == code].sort_values("LapNumber")
        laps_list, personal_best = [], None
        for _, lap in drv_laps.iterrows():
            lt = safe_ms(lap.get("LapTime"))
            if lt <= 0:
                continue
            is_pb = personal_best is None or lt < personal_best
            if is_pb:
                personal_best = lt
            laps_list.append({
                "lapNumber":      safe_int(lap.get("LapNumber")),
                "lapTime":        lt,
                "sector1":        safe_ms(lap.get("Sector1Time")),
                "sector2":        safe_ms(lap.get("Sector2Time")),
                "sector3":        safe_ms(lap.get("Sector3Time")),
                "isPersonalBest": is_pb,
                "isSessionBest":  session_best_time is not None and lt == session_best_time,
                "compound":       normalise_compound(lap.get("Compound")),
                "tyreAge":        safe_int(lap.get("TyreLife", 1)),
            })
        lap_data_out[code] = laps_list
        print(f"  {code}: {len(laps_list)} laps")

    # â”€â”€ Telemetry (fastest lap per driver) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    telemetry_out, drs_zones_out, drs_zones_set = {}, [], False

    for code in driver_codes:
        try:
            drv_laps = laps_df[laps_df["Driver"] == code]
            if drv_laps.empty:
                continue
            fastest = drv_laps.pick_fastest()
            tel = fastest.get_telemetry()
            dist, spd, thr, brk, gear, drs = resample_telemetry(tel, n=500)
            if not dist:
                print(f"  {code}: no telemetry")
                continue
            telemetry_out[code] = {
                "distance": dist, "speed": spd, "throttle": thr,
                "brake": brk, "gear": gear, "drs": drs,
            }
            if not drs_zones_set:
                drs_zones_out = build_drs_zones(tel)
                drs_zones_set = True
            print(f"  {code}: telemetry OK")
        except Exception as e:
            print(f"  {code}: telemetry error â€” {e}")

    # â”€â”€ Standings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    standings_out = []
    results = getattr(session, "results", None)
    is_qualifying = session_type in ("Q", "SQ")

    # For qualifying: compute gaps from best lap times
    quali_best_times = {}
    if is_qualifying:
        for code in driver_codes:
            drv_laps = laps_df[laps_df["Driver"] == code]
            best = None
            for _, lap in drv_laps.iterrows():
                lt = safe_ms(lap.get("LapTime"))
                if lt > 0 and (best is None or lt < best):
                    best = lt
            if best:
                quali_best_times[code] = best
        # Find the overall pole time
        pole_time = min(quali_best_times.values()) if quali_best_times else None

    for pos_idx, code in enumerate(driver_codes):
        drv_laps = laps_df[laps_df["Driver"] == code]
        if drv_laps.empty:
            continue
        last = drv_laps.sort_values("LapNumber").iloc[-1]
        pit_count = int(drv_laps["PitInTime"].notna().sum()) if "PitInTime" in drv_laps.columns else 0

        gap_str, position = "LEADER", pos_idx + 1
        if is_qualifying:
            # Sort by best lap time and compute gap to pole
            best_ms = quali_best_times.get(code)
            if best_ms and pole_time and best_ms > pole_time:
                gap_str = f"+{(best_ms - pole_time) / 1000:.3f}"
            elif best_ms == pole_time:
                gap_str = "LEADER"
        elif results is not None and not results.empty:
            drv_res = results[results["Abbreviation"] == code]
            if not drv_res.empty:
                r = drv_res.iloc[0]
                position = safe_int(r.get("Position", pos_idx + 1))
                try:
                    g = r.get("Time").total_seconds()
                    if not math.isnan(g) and g > 0:
                        gap_str = f"+{g:.3f}"
                except Exception:
                    pass

        standings_out.append({
            "position":       position,
            "driverCode":     code,
            "gap":            gap_str,
            "interval":       gap_str,
            "lastLap":        quali_best_times.get(code, 0) if is_qualifying else safe_ms(last.get("LapTime")),
            "sector1":        safe_ms(last.get("Sector1Time")),
            "sector2":        safe_ms(last.get("Sector2Time")),
            "sector3":        safe_ms(last.get("Sector3Time")),
            "compound":       normalise_compound(last.get("Compound")),
            "tyreAge":        safe_int(last.get("TyreLife", 1)),
            "pitCount":       pit_count,
            "isPersonalBest": False,
            "isSessionBest":  False,
        })

    # For qualifying: sort by best lap time (pole first)
    if is_qualifying and quali_best_times:
        standings_out.sort(key=lambda x: quali_best_times.get(x["driverCode"], float("inf")))
        for i, s in enumerate(standings_out):
            s["position"] = i + 1
    else:
        standings_out.sort(key=lambda x: x["position"])

    # Fix intervals
    for i, s in enumerate(standings_out):
        if i == 0:
            s["gap"] = "LEADER"
            s["interval"] = "LEADER"
        else:
            try:
                g_curr = float(standings_out[i]["gap"].replace("+", ""))
                g_prev = float(standings_out[i-1]["gap"].replace("+", "")) \
                         if standings_out[i-1]["gap"] != "LEADER" else 0.0
                standings_out[i]["interval"] = f"+{(g_curr - g_prev):.3f}"
            except Exception:
                standings_out[i]["interval"] = standings_out[i]["gap"]

    # â”€â”€ Stints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    stints_out = []
    for code in driver_codes:
        drv_laps = laps_df[laps_df["Driver"] == code].sort_values("LapNumber")
        if drv_laps.empty:
            continue
        cur_compound, stint_start = None, None
        for _, lap in drv_laps.iterrows():
            compound = normalise_compound(lap.get("Compound"))
            lap_num  = safe_int(lap.get("LapNumber"))
            if compound != cur_compound:
                if cur_compound is not None:
                    stints_out.append({"driverCode": code, "compound": cur_compound,
                                       "startLap": stint_start, "endLap": lap_num - 1})
                cur_compound, stint_start = compound, lap_num
        if cur_compound is not None:
            stints_out.append({"driverCode": code, "compound": cur_compound,
                               "startLap": stint_start,
                               "endLap": safe_int(drv_laps.iloc[-1].get("LapNumber"))})

    # â”€â”€ Gap history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    print("  Building gap history...")
    gap_history = build_gap_history(laps_df, driver_codes, total_laps)

    # â”€â”€ Diagnostics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    diagnostics_out = {
        code: estimate_diagnostics(code, telemetry_out.get(code))
        for code in driver_codes
    }

    # â”€â”€ Write output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    output = {
        "session":     session_obj,
        "drivers":     drivers_out,
        "lapData":     lap_data_out,
        "telemetry":   telemetry_out,
        "drsZones":    drs_zones_out,
        "standings":   standings_out,
        "stints":      stints_out,
        "gapHistory":  gap_history,
        "diagnostics": diagnostics_out,
    }

    out_path = OUTPUT_DIR / f"{session_id}.json"
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\n  Written: {out_path}  ({size_kb:.1f} KB)")
    return session_obj

# â”€â”€ Sessions index â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def write_sessions_index(exported: list):
    circuit_labels = {"MON": "Monaco", "MZA": "Monza"}
    session_labels = {
        "RACE": "Race", "QUALIFYING": "Qualifying",
        "SPRINT": "Sprint", "SPRINT QUALIFYING": "Sprint Qualifying",
    }
    index = []
    for s in exported:
        cc   = s["circuitCode"]
        sn   = s["sessionName"]
        year = s["date"][:4]
        index.append({
            "id":          s["id"],
            "label":       f"{circuit_labels.get(cc, cc)} {year} \u2014 {session_labels.get(sn, sn)}",
            "circuitCode": cc,
            "sessionName": sn,
            "year":        int(year),
        })
    out_path = OUTPUT_DIR / "sessions.json"
    with open(out_path, "w") as f:
        json.dump(index, f, indent=2)
    print(f"\nSessions index written: {out_path}")

# â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if __name__ == "__main__":
    exported, failed = [], []

    for args in SESSIONS:
        try:
            exported.append(export_session(*args))
        except Exception as e:
            print(f"\nFAILED: {args} â€” {e}")
            failed.append(args)

    if exported:
        write_sessions_index(exported)

    print(f"\n{'='*60}")
    print(f"Done. {len(exported)} exported, {len(failed)} failed.")
    if failed:
        print("Failed:")
        for f in failed:
            print(f"  {f}")
    if failed:
        print("\nNote: Failed sessions need to be downloaded.")
        print("Re-run the script â€” FastF1 will cache them automatically.")
