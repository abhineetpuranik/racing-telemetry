/**
 * TelemetryService
 * ─────────────────
 * Loads real F1 data exported by fastf1_export.py from /data/<session_id>.json.
 * Public API is identical to MockTelemetryService — all components work unchanged.
 *
 * Data files live in racing-telemetry/public/data/
 * Run `python fastf1_export.py` to regenerate them.
 */

import { Injectable, signal, PLATFORM_ID, Inject, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  Observable, BehaviorSubject, of,
  map, filter, catchError,
} from 'rxjs';
import { Session, SessionMeta } from '../models/session.model';
import { Driver } from '../models/driver.model';
import { Lap, LapStats } from '../models/lap.model';
import { TelemetryFrame, DrsZone } from '../models/telemetry.model';
import { Standing } from '../models/standing.model';
import { CarDiagnostics } from '../models/diagnostics.model';
import { Stint } from '../models/stint.model';

export type { Stint };

// ── Shape of the JSON file produced by fastf1_export.py ──────────────────────

interface SessionFile {
  session:     Session;
  drivers:     Driver[];
  lapData:     Record<string, Lap[]>;
  telemetry:   Record<string, TelemetryFrame>;
  drsZones:    DrsZone[];
  standings:   Standing[];
  stints:      Stint[];
  gapHistory:  Record<string, number[]>;
  diagnostics: Record<string, CarDiagnostics>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeStats(driverCode: string, laps: Lap[]): LapStats {
  if (!laps.length) {
    return { driverCode, avgLapTime: 0, bestLapTime: 0, stdDev: 0,
             avgSector1: 0, avgSector2: 0, avgSector3: 0, totalLaps: 0 };
  }
  const times = laps.map(l => l.lapTime);
  const avg   = times.reduce((a, b) => a + b, 0) / times.length;
  const best  = Math.min(...times);
  const variance = times.reduce((a, b) => a + (b - avg) ** 2, 0) / times.length;
  return {
    driverCode,
    avgLapTime:  Math.round(avg),
    bestLapTime: best,
    stdDev:      Math.round(Math.sqrt(variance)),
    avgSector1:  Math.round(laps.reduce((a, l) => a + l.sector1, 0) / laps.length),
    avgSector2:  Math.round(laps.reduce((a, l) => a + l.sector2, 0) / laps.length),
    avgSector3:  Math.round(laps.reduce((a, l) => a + l.sector3, 0) / laps.length),
    totalLaps:   laps.length,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TelemetryService {

  isLive          = signal(false);
  sessionComplete = signal(false);

  private _activeSessionId  = signal('2023_MZA_Q');
  private _sessionSubject   = new BehaviorSubject<Session | null>(null);
  private _standingsSubject = new BehaviorSubject<Standing[]>([]);
  private _dataSubject      = new BehaviorSubject<SessionFile | null>(null);
  private _liveInterval: ReturnType<typeof setInterval> | null = null;
  // HTTP cache — avoids re-fetching the same file twice
  private _httpCache = new Map<string, SessionFile>();

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this._fetchAndEmit('2023_MZA_Q');
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Fetch a session file (or use HTTP cache) and push it into _dataSubject. */
  private _fetchAndEmit(id: string): void {
    if (this._httpCache.has(id)) {
      const cached = this._httpCache.get(id)!;
      this._dataSubject.next(cached);
      this._sessionSubject.next(cached.session);
      this._standingsSubject.next(cached.standings);
      return;
    }
    this.http.get<SessionFile>(`/data/${id}.json`).pipe(
      catchError(err => { console.error(`Failed to load session ${id}:`, err); throw err; }),
    ).subscribe(data => {
      this._httpCache.set(id, data);
      this._dataSubject.next(data);
      this._sessionSubject.next(data.session);
      this._standingsSubject.next(data.standings);
    });
  }

  /** All data accessors subscribe to this — emits whenever session switches. */
  private get _data$(): Observable<SessionFile> {
    return this._dataSubject.asObservable().pipe(
      filter((d): d is SessionFile => d !== null),
    );
  }

  // ── Session meta ──────────────────────────────────────────────────────────

  getSessionsMeta(): Observable<SessionMeta[]> {
    return this.http.get<SessionMeta[]>('/data/sessions.json').pipe(
      catchError(() => of([] as SessionMeta[])),
    );
  }

  getActiveSessionId(): string { return this._activeSessionId(); }

  switchSession(id: string): void {
    this.stopLive();
    this._activeSessionId.set(id);
    this._fetchAndEmit(id);
  }

  // ── Session ───────────────────────────────────────────────────────────────

  getSession(): Observable<Session> {
    return this._sessionSubject.asObservable().pipe(
      filter((s): s is Session => s !== null),
    );
  }

  /** Session derived directly from _data$ — always in sync with other _data$ streams. */
  getSessionData(): Observable<Session> {
    return this._data$.pipe(map(d => d.session));
  }

  /** Full session file — use when you need multiple fields atomically (avoids combineLatest timing issues). */
  getSessionFileData() {
    return this._data$;
  }

  getDrivers(): Observable<Driver[]> {
    return this._data$.pipe(map(d => d.drivers));
  }

  getDriver(code: string): Observable<Driver | undefined> {
    return this._data$.pipe(map(d => d.drivers.find(dr => dr.driverCode === code)));
  }

  // ── Laps ──────────────────────────────────────────────────────────────────

  getLaps(driverCode: string): Observable<Lap[]> {
    return this._data$.pipe(map(d => d.lapData[driverCode] ?? []));
  }

  getLap(driverCode: string, lapNumber: number): Observable<Lap | undefined> {
    return this._data$.pipe(
      map(d => (d.lapData[driverCode] ?? []).find(l => l.lapNumber === lapNumber)),
    );
  }

  getSessionBestLap(): Observable<Lap | undefined> {
    return this._data$.pipe(
      map(d => {
        const all = Object.values(d.lapData).flat();
        return all.reduce<Lap | undefined>(
          (b, l) => (!b || l.lapTime < b.lapTime) ? l : b, undefined,
        );
      }),
    );
  }

  getLapStats(driverCode: string): Observable<LapStats> {
    return this._data$.pipe(map(d => computeStats(driverCode, d.lapData[driverCode] ?? [])));
  }

  getAllDriversLapStats(): Observable<LapStats[]> {
    return this._data$.pipe(
      map(d => d.drivers.map(dr => computeStats(dr.driverCode, d.lapData[dr.driverCode] ?? []))),
    );
  }

  // ── Telemetry ─────────────────────────────────────────────────────────────

  getTelemetry(driverCode: string): Observable<TelemetryFrame | undefined> {
    return this._data$.pipe(map(d => d.telemetry[driverCode]));
  }

  getAverageTelemetry(driverCode: string): Observable<TelemetryFrame | undefined> {
    return this._data$.pipe(
      map(d => {
        const base = d.telemetry[driverCode];
        if (!base) return undefined;

        // Simulate a "typical lap" by applying a smoothed version of the fastest lap.
        // Use a rolling average window to blur the trace — this makes corners slightly
        // slower and straights slightly different, giving a meaningful delta.
        const WINDOW = 12;
        const smooth = (arr: number[]): number[] => {
          return arr.map((_, i) => {
            const start = Math.max(0, i - WINDOW);
            const end   = Math.min(arr.length - 1, i + WINDOW);
            let sum = 0;
            for (let j = start; j <= end; j++) sum += arr[j];
            return Math.round(sum / (end - start + 1));
          });
        };

        return {
          distance: base.distance,
          gear:     base.gear,
          drs:      base.drs,
          speed:    smooth(base.speed),
          throttle: smooth(base.throttle),
          brake:    smooth(base.brake),
        };
      }),
    );
  }

  getDrsZones(): Observable<DrsZone[]> {
    return this._data$.pipe(map(d => d.drsZones ?? []));
  }

  // ── Standings ─────────────────────────────────────────────────────────────

  getStandings(): Observable<Standing[]> {
    return this._standingsSubject.asObservable().pipe(
      filter(s => s.length > 0),
    );
  }

  // ── Stints ────────────────────────────────────────────────────────────────

  getStints(): Observable<Stint[]> {
    return this._data$.pipe(map(d => d.stints));
  }

  // ── Gap history ───────────────────────────────────────────────────────────

  getGapHistory(): Observable<Record<string, number[]>> {
    return this._data$.pipe(map(d => d.gapHistory));
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  getDiagnostics(driverCode: string): Observable<CarDiagnostics | undefined> {
    return this._data$.pipe(map(d => d.diagnostics[driverCode]));
  }

  // ── Live mode ─────────────────────────────────────────────────────────────

  restartSession(): void {
    this.stopLive();
    this.sessionComplete.set(false);
    const data = this._dataSubject.getValue();
    if (data) {
      this._emitWithLap(data, 1);
    }
  }

  startLive(): void {
    if (this._liveInterval) return;
    this.isLive.set(true);
    this.sessionComplete.set(false);

    // Reset to lap 1 if the session is already at the end
    const snapshot = this._dataSubject.getValue();
    if (snapshot && snapshot.session.currentLap >= snapshot.session.totalLaps) {
      this._emitWithLap(snapshot, 1);
    }

    this._liveInterval = this.ngZone.run(() => setInterval(() => {
      const data = this._dataSubject.getValue();
      if (!data) return;
      if (data.session.currentLap >= data.session.totalLaps) {
        this.stopLive();
        this.sessionComplete.set(true);
        return;
      }

      const nextLap = data.session.currentLap + 1;
      this._emitWithLap(data, nextLap);

      const standings = this._standingsSubject.getValue().map(s => {
        if (s.position === 1 || s.gap === 'LEADER') return s;
        const gapMs = parseFloat(s.gap.replace('+', '')) * 1000;
        if (isNaN(gapMs)) return s;
        const newGapMs = Math.max(0, gapMs + (Math.random() - 0.48) * 300);
        return { ...s, gap: `+${(newGapMs / 1000).toFixed(3)}` };
      });
      this._standingsSubject.next(standings);
    }, 3000));
  }

  /** Emit an updated session file with a new currentLap into both subjects. */
  private _emitWithLap(data: SessionFile, lap: number): void {
    const updated = { ...data, session: { ...data.session, currentLap: lap } };
    this._dataSubject.next(updated);
    this._sessionSubject.next(updated.session);
  }

  stopLive(): void {
    if (this._liveInterval) { clearInterval(this._liveInterval); this._liveInterval = null; }
    this.isLive.set(false);
  }

  toggleLive(): void { this.isLive() ? this.stopLive() : this.startLive(); }
}
