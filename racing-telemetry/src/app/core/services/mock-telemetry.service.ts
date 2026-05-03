import { Injectable, signal } from '@angular/core';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { Session, SessionMeta } from '../models/session.model';
import { Driver } from '../models/driver.model';
import { Lap, LapStats } from '../models/lap.model';
import { TelemetryFrame, DrsZone } from '../models/telemetry.model';
import { Standing } from '../models/standing.model';
import { CarDiagnostics } from '../models/diagnostics.model';

// ─── Helpers ────────────────────────────────────────────────────────────────

function ms(m: number, s: number, ms: number): number {
  return m * 60000 + s * 1000 + ms;
}

function jitter(base: number, range: number): number {
  return base + (Math.random() - 0.5) * 2 * range;
}

function generateSpeedTrace(baseSpeed: number, profileKey: 'monaco' | 'monza'): TelemetryFrame {
  const N = 500;
  const isMonaco = profileKey === 'monaco';
  const trackLength = isMonaco ? 3337 : 5793;
  const maxSpeed = isMonaco ? 290 : 360;
  const distance: number[] = [];
  const speed: number[] = [];
  const throttle: number[] = [];
  const brake: number[] = [];
  const gear: number[] = [];
  const drs: boolean[] = [];

  const monacoProfile: [number, number][] = [
    [0.00, 220], [0.04, 280], [0.07, 80],
    [0.10, 160], [0.14, 260], [0.18, 50],
    [0.21, 90],  [0.25, 270], [0.30, 60],
    [0.34, 100], [0.38, 280], [0.42, 45],
    [0.46, 55],  [0.50, 270], [0.54, 40],
    [0.57, 80],  [0.62, 290], [0.66, 55],
    [0.70, 280], [0.75, 290], [0.80, 60],
    [0.84, 100], [0.88, 280], [0.92, 55],
    [0.95, 200], [0.98, 240], [1.00, 220],
  ];

  const monzaProfile: [number, number][] = [
    [0.00, 280], [0.05, 340], [0.10, 100],
    [0.14, 200], [0.20, 350], [0.25, 80],
    [0.30, 160], [0.35, 355], [0.40, 90],
    [0.45, 180], [0.50, 360], [0.55, 100],
    [0.60, 200], [0.65, 355], [0.70, 85],
    [0.75, 170], [0.80, 350], [0.85, 95],
    [0.90, 200], [0.95, 320], [1.00, 280],
  ];

  const profile = isMonaco ? monacoProfile : monzaProfile;
  const drsZones: [number, number][] = isMonaco
    ? [[0.60, 0.72]]
    : [[0.10, 0.25], [0.55, 0.70]];

  function targetAt(frac: number): number {
    for (let i = 0; i < profile.length - 1; i++) {
      const [f0, v0] = profile[i];
      const [f1, v1] = profile[i + 1];
      if (frac >= f0 && frac <= f1) {
        const t = (frac - f0) / (f1 - f0);
        return v0 + (v1 - v0) * t;
      }
    }
    return 200;
  }

  let currentSpeed = isMonaco ? 220 : 280;
  for (let i = 0; i < N; i++) {
    const frac = i / (N - 1);
    const d = frac * trackLength;
    const target = targetAt(frac) * (baseSpeed / maxSpeed);
    const diff = target - currentSpeed;
    currentSpeed += diff * 0.18 + jitter(0, 3);
    currentSpeed = Math.max(30, Math.min(maxSpeed + 10, currentSpeed));

    const isDrs = drsZones.some(([s, e]) => frac >= s && frac <= e) && currentSpeed > 200;
    const thr = diff > 5 ? Math.min(100, 60 + diff * 1.5) : diff > 0 ? 50 : 0;
    const brk = diff < -10 ? Math.min(100, -diff * 2) : 0;
    const g = currentSpeed < 80 ? 2 : currentSpeed < 140 ? 4 : currentSpeed < 200 ? 6 : 8;

    distance.push(Math.round(d));
    speed.push(Math.round(currentSpeed));
    throttle.push(Math.round(thr));
    brake.push(Math.round(brk));
    gear.push(g);
    drs.push(isDrs);
  }

  return { distance, speed, throttle, brake, gear, drs };
}

function generateLaps(
  baseTime: number,
  s1Base: number,
  s2Base: number,
  s3Base: number,
  compound: Lap['compound'],
  startLap: number,
  count: number
): Lap[] {
  const laps: Lap[] = [];
  let personalBest = Infinity;
  let sessionBest = Infinity;

  for (let i = 0; i < count; i++) {
    const lapNum = startLap + i;
    const degradation = i * 80;
    const s1 = Math.round(jitter(s1Base + degradation * 0.3, 150));
    const s2 = Math.round(jitter(s2Base + degradation * 0.4, 200));
    const s3 = Math.round(jitter(s3Base + degradation * 0.3, 120));
    const lapTime = s1 + s2 + s3;
    const isPersonalBest = lapTime < personalBest;
    const isSessionBest = lapTime < sessionBest;
    if (isPersonalBest) personalBest = lapTime;
    if (isSessionBest) sessionBest = lapTime;

    laps.push({
      lapNumber: lapNum,
      lapTime,
      sector1: s1,
      sector2: s2,
      sector3: s3,
      isPersonalBest,
      isSessionBest,
      compound,
      tyreAge: i + 1,
    });
  }
  return laps;
}

function computeStats(driverCode: string, laps: Lap[]): LapStats {
  if (laps.length === 0) {
    return { driverCode, avgLapTime: 0, bestLapTime: 0, stdDev: 0, avgSector1: 0, avgSector2: 0, avgSector3: 0, totalLaps: 0 };
  }
  const times = laps.map(l => l.lapTime);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const best = Math.min(...times);
  const variance = times.reduce((a, b) => a + (b - avg) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);
  const avgSector1 = laps.reduce((a, l) => a + l.sector1, 0) / laps.length;
  const avgSector2 = laps.reduce((a, l) => a + l.sector2, 0) / laps.length;
  const avgSector3 = laps.reduce((a, l) => a + l.sector3, 0) / laps.length;
  return {
    driverCode,
    avgLapTime: Math.round(avg),
    bestLapTime: best,
    stdDev: Math.round(stdDev),
    avgSector1: Math.round(avgSector1),
    avgSector2: Math.round(avgSector2),
    avgSector3: Math.round(avgSector3),
    totalLaps: laps.length,
  };
}

function computeAverageTrace(frames: TelemetryFrame[]): TelemetryFrame {
  if (frames.length === 0) return { distance: [], speed: [], throttle: [], brake: [], gear: [], drs: [] };
  const N = frames[0].distance.length;
  const distance = frames[0].distance.slice();
  const gear = frames[0].gear.slice();
  const speed: number[] = new Array(N).fill(0);
  const throttle: number[] = new Array(N).fill(0);
  const brake: number[] = new Array(N).fill(0);
  const drs: boolean[] = new Array(N).fill(false);

  for (const frame of frames) {
    for (let i = 0; i < N; i++) {
      speed[i] += frame.speed[i];
      throttle[i] += frame.throttle[i];
      brake[i] += frame.brake[i];
      if (frame.drs[i]) drs[i] = true;
    }
  }
  const count = frames.length;
  return {
    distance,
    speed: speed.map(v => Math.round(v / count)),
    throttle: throttle.map(v => Math.round(v / count)),
    brake: brake.map(v => Math.round(v / count)),
    gear,
    drs,
  };
}

function buildGapHistory(
  driverCodes: string[],
  bases: Record<string, number>,
  laps: number
): Record<string, number[]> {
  const gaps: Record<string, number[]> = {};
  for (const code of driverCodes) gaps[code] = [];

  for (let l = 1; l <= laps; l++) {
    for (const code of driverCodes) {
      if (bases[code] === 0) {
        gaps[code].push(0);
      } else {
        const prev = gaps[code][gaps[code].length - 1] ?? bases[code];
        const delta = (Math.random() - 0.48) * 0.3;
        gaps[code].push(Math.max(0, +(prev + delta).toFixed(3)));
      }
    }
  }
  return gaps;
}

import { Stint } from '../models/stint.model';

export type { Stint }; // re-export for backward compat

// ─── Session interface ───────────────────────────────────────────────────────

interface SessionDataEntry {
  session: Session;
  lapData: Record<string, Lap[]>;
  telemetry: Record<string, TelemetryFrame>;
  standings: Standing[];
  stints: Stint[];
  gapHistory: Record<string, number[]>;
  diagnostics: Record<string, CarDiagnostics>;
}

// ─── Static constants ────────────────────────────────────────────────────────

const SESSIONS_META: SessionMeta[] = [
  { id: '2024_MON_R', label: 'Monaco 2024 \u2014 Race',       circuitCode: 'MON', sessionName: 'RACE',       year: 2024 },
  { id: '2024_MON_Q', label: 'Monaco 2024 \u2014 Qualifying', circuitCode: 'MON', sessionName: 'QUALIFYING', year: 2024 },
  { id: '2024_MZA_R', label: 'Monza 2024 \u2014 Race',        circuitCode: 'MZA', sessionName: 'RACE',       year: 2024 },
  { id: '2024_MZA_Q', label: 'Monza 2024 \u2014 Qualifying',  circuitCode: 'MZA', sessionName: 'QUALIFYING', year: 2024 },
];

const DRIVERS: Driver[] = [
  { driverCode: 'VER', fullName: 'Max Verstappen',  carNumber: 1,  team: 'Red Bull Racing', teamColor: '#3671C6' },
  { driverCode: 'NOR', fullName: 'Lando Norris',    carNumber: 4,  team: 'McLaren',         teamColor: '#FF8000' },
  { driverCode: 'LEC', fullName: 'Charles Leclerc', carNumber: 16, team: 'Ferrari',         teamColor: '#E8002D' },
  { driverCode: 'SAI', fullName: 'Carlos Sainz',    carNumber: 55, team: 'Ferrari',         teamColor: '#E8002D' },
  { driverCode: 'HAM', fullName: 'Lewis Hamilton',  carNumber: 44, team: 'Mercedes',        teamColor: '#27F4D2' },
];

const DRS_ZONES_MON: DrsZone[] = [{ start: 2000, end: 2400 }];
const DRS_ZONES_MZA: DrsZone[] = [{ start: 580, end: 1450 }, { start: 3190, end: 4060 }];

// ─── SESSION_DATA ────────────────────────────────────────────────────────────

const SESSION_DATA: Record<string, SessionDataEntry> = {

  '2024_MON_R': {
    session: {
      id: '2024_MON_R',
      sessionName: 'RACE',
      circuit: 'Monaco Grand Prix',
      circuitCode: 'MON',
      date: '2024-05-26',
      totalLaps: 78,
      currentLap: 47,
      conditions: 'DRY',
    },
    lapData: {
      VER: generateLaps(ms(1,10,456), ms(0,18,200), ms(0,32,100), ms(0,20,156), 'MEDIUM', 38, 10),
      NOR: generateLaps(ms(1,10,812), ms(0,18,350), ms(0,32,300), ms(0,20,162), 'MEDIUM', 38, 10),
      LEC: generateLaps(ms(1,11,234), ms(0,18,500), ms(0,32,500), ms(0,20,234), 'SOFT',   38, 10),
      SAI: generateLaps(ms(1,11,567), ms(0,18,600), ms(0,32,700), ms(0,20,267), 'SOFT',   38, 10),
      HAM: generateLaps(ms(1,11,890), ms(0,18,700), ms(0,33,100), ms(0,20,190), 'HARD',   38, 10),
    },
    telemetry: {
      VER: generateSpeedTrace(285, 'monaco'),
      NOR: generateSpeedTrace(278, 'monaco'),
      LEC: generateSpeedTrace(274, 'monaco'),
      SAI: generateSpeedTrace(271, 'monaco'),
      HAM: generateSpeedTrace(268, 'monaco'),
    },
    standings: [
      { position: 1, driverCode: 'VER', gap: 'LEADER', interval: 'LEADER', lastLap: ms(1,10,456), sector1: ms(0,18,200), sector2: ms(0,32,100), sector3: ms(0,20,156), compound: 'MEDIUM', tyreAge: 9,  pitCount: 1, isPersonalBest: false, isSessionBest: true  },
      { position: 2, driverCode: 'NOR', gap: '+4.312',  interval: '+4.312',  lastLap: ms(1,10,812), sector1: ms(0,18,350), sector2: ms(0,32,300), sector3: ms(0,20,162), compound: 'MEDIUM', tyreAge: 9,  pitCount: 1, isPersonalBest: true,  isSessionBest: false },
      { position: 3, driverCode: 'LEC', gap: '+8.901',  interval: '+4.589',  lastLap: ms(1,11,234), sector1: ms(0,18,500), sector2: ms(0,32,500), sector3: ms(0,20,234), compound: 'SOFT',   tyreAge: 5,  pitCount: 2, isPersonalBest: false, isSessionBest: false },
      { position: 4, driverCode: 'SAI', gap: '+12.445', interval: '+3.544',  lastLap: ms(1,11,567), sector1: ms(0,18,600), sector2: ms(0,32,700), sector3: ms(0,20,267), compound: 'SOFT',   tyreAge: 5,  pitCount: 2, isPersonalBest: false, isSessionBest: false },
      { position: 5, driverCode: 'HAM', gap: '+18.234', interval: '+5.789',  lastLap: ms(1,11,890), sector1: ms(0,18,700), sector2: ms(0,33,100), sector3: ms(0,20,190), compound: 'HARD',   tyreAge: 14, pitCount: 1, isPersonalBest: false, isSessionBest: false },
    ],
    stints: [
      { driverCode: 'VER', compound: 'SOFT',   startLap: 1,  endLap: 18 },
      { driverCode: 'VER', compound: 'MEDIUM', startLap: 19, endLap: 47 },
      { driverCode: 'NOR', compound: 'SOFT',   startLap: 1,  endLap: 20 },
      { driverCode: 'NOR', compound: 'MEDIUM', startLap: 21, endLap: 47 },
      { driverCode: 'LEC', compound: 'SOFT',   startLap: 1,  endLap: 15 },
      { driverCode: 'LEC', compound: 'MEDIUM', startLap: 16, endLap: 32 },
      { driverCode: 'LEC', compound: 'SOFT',   startLap: 33, endLap: 47 },
      { driverCode: 'SAI', compound: 'SOFT',   startLap: 1,  endLap: 16 },
      { driverCode: 'SAI', compound: 'MEDIUM', startLap: 17, endLap: 33 },
      { driverCode: 'SAI', compound: 'SOFT',   startLap: 34, endLap: 47 },
      { driverCode: 'HAM', compound: 'MEDIUM', startLap: 1,  endLap: 25 },
      { driverCode: 'HAM', compound: 'HARD',   startLap: 26, endLap: 47 },
    ],
    gapHistory: buildGapHistory(['VER','NOR','LEC','SAI','HAM'], { VER: 0, NOR: 4.3, LEC: 8.9, SAI: 12.4, HAM: 18.2 }, 47),
    diagnostics: {
      VER: { driverCode: 'VER', frontWingLeft: 82, frontWingRight: 81, rearWingLeft: 74, rearWingRight: 75, ersDeployment: 87, mguKRecovery: 62, frontBrakeTempLeft: 520, frontBrakeTempRight: 515, rearBrakeTempLeft: 480, rearBrakeTempRight: 475 },
      NOR: { driverCode: 'NOR', frontWingLeft: 79, frontWingRight: 80, rearWingLeft: 71, rearWingRight: 72, ersDeployment: 91, mguKRecovery: 58, frontBrakeTempLeft: 540, frontBrakeTempRight: 535, rearBrakeTempLeft: 490, rearBrakeTempRight: 488 },
      LEC: { driverCode: 'LEC', frontWingLeft: 85, frontWingRight: 84, rearWingLeft: 78, rearWingRight: 77, ersDeployment: 75, mguKRecovery: 70, frontBrakeTempLeft: 560, frontBrakeTempRight: 558, rearBrakeTempLeft: 510, rearBrakeTempRight: 505 },
      SAI: { driverCode: 'SAI', frontWingLeft: 83, frontWingRight: 82, rearWingLeft: 76, rearWingRight: 75, ersDeployment: 78, mguKRecovery: 65, frontBrakeTempLeft: 545, frontBrakeTempRight: 542, rearBrakeTempLeft: 495, rearBrakeTempRight: 492 },
      HAM: { driverCode: 'HAM', frontWingLeft: 77, frontWingRight: 78, rearWingLeft: 69, rearWingRight: 70, ersDeployment: 83, mguKRecovery: 55, frontBrakeTempLeft: 505, frontBrakeTempRight: 500, rearBrakeTempLeft: 465, rearBrakeTempRight: 460 },
    },
  },

  '2024_MON_Q': {
    session: {
      id: '2024_MON_Q',
      sessionName: 'QUALIFYING',
      circuit: 'Monaco Grand Prix',
      circuitCode: 'MON',
      date: '2024-05-25',
      totalLaps: 0,
      currentLap: 0,
      conditions: 'DRY',
    },
    lapData: {
      VER: generateLaps(ms(1, 9, 748), ms(0,17,900), ms(0,31,800), ms(0,20,48), 'SOFT', 1, 10),
      NOR: generateLaps(ms(1, 9, 921), ms(0,17,980), ms(0,31,900), ms(0,20,41), 'SOFT', 1, 10),
      LEC: generateLaps(ms(1,10, 270), ms(0,18,100), ms(0,32,100), ms(0,20,70), 'SOFT', 1, 10),
      SAI: generateLaps(ms(1,10, 512), ms(0,18,200), ms(0,32,250), ms(0,20,62), 'SOFT', 1, 10),
      HAM: generateLaps(ms(1,10, 834), ms(0,18,350), ms(0,32,400), ms(0,20,84), 'SOFT', 1, 10),
    },
    telemetry: {
      VER: generateSpeedTrace(290, 'monaco'),
      NOR: generateSpeedTrace(287, 'monaco'),
      LEC: generateSpeedTrace(283, 'monaco'),
      SAI: generateSpeedTrace(280, 'monaco'),
      HAM: generateSpeedTrace(277, 'monaco'),
    },
    standings: [
      { position: 1, driverCode: 'VER', gap: 'LEADER', interval: 'LEADER', lastLap: ms(1, 9,748), sector1: ms(0,17,900), sector2: ms(0,31,800), sector3: ms(0,20,48), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: true  },
      { position: 2, driverCode: 'NOR', gap: '+0.173',  interval: '+0.173',  lastLap: ms(1, 9,921), sector1: ms(0,17,980), sector2: ms(0,31,900), sector3: ms(0,20,41), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: false },
      { position: 3, driverCode: 'LEC', gap: '+0.522',  interval: '+0.349',  lastLap: ms(1,10,270), sector1: ms(0,18,100), sector2: ms(0,32,100), sector3: ms(0,20,70), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: false },
      { position: 4, driverCode: 'SAI', gap: '+0.764',  interval: '+0.242',  lastLap: ms(1,10,512), sector1: ms(0,18,200), sector2: ms(0,32,250), sector3: ms(0,20,62), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: false },
      { position: 5, driverCode: 'HAM', gap: '+1.086',  interval: '+0.322',  lastLap: ms(1,10,834), sector1: ms(0,18,350), sector2: ms(0,32,400), sector3: ms(0,20,84), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: false },
    ],
    stints: [
      { driverCode: 'VER', compound: 'SOFT', startLap: 1, endLap: 10 },
      { driverCode: 'NOR', compound: 'SOFT', startLap: 1, endLap: 10 },
      { driverCode: 'LEC', compound: 'SOFT', startLap: 1, endLap: 10 },
      { driverCode: 'SAI', compound: 'SOFT', startLap: 1, endLap: 10 },
      { driverCode: 'HAM', compound: 'SOFT', startLap: 1, endLap: 10 },
    ],
    gapHistory: buildGapHistory(['VER','NOR','LEC','SAI','HAM'], { VER: 0, NOR: 0.173, LEC: 0.522, SAI: 0.764, HAM: 1.086 }, 10),
    diagnostics: {
      VER: { driverCode: 'VER', frontWingLeft: 84, frontWingRight: 83, rearWingLeft: 76, rearWingRight: 77, ersDeployment: 95, mguKRecovery: 60, frontBrakeTempLeft: 530, frontBrakeTempRight: 528, rearBrakeTempLeft: 485, rearBrakeTempRight: 482 },
      NOR: { driverCode: 'NOR', frontWingLeft: 81, frontWingRight: 82, rearWingLeft: 73, rearWingRight: 74, ersDeployment: 97, mguKRecovery: 56, frontBrakeTempLeft: 548, frontBrakeTempRight: 544, rearBrakeTempLeft: 494, rearBrakeTempRight: 491 },
      LEC: { driverCode: 'LEC', frontWingLeft: 87, frontWingRight: 86, rearWingLeft: 80, rearWingRight: 79, ersDeployment: 93, mguKRecovery: 68, frontBrakeTempLeft: 565, frontBrakeTempRight: 562, rearBrakeTempLeft: 514, rearBrakeTempRight: 510 },
      SAI: { driverCode: 'SAI', frontWingLeft: 85, frontWingRight: 84, rearWingLeft: 78, rearWingRight: 77, ersDeployment: 94, mguKRecovery: 63, frontBrakeTempLeft: 550, frontBrakeTempRight: 547, rearBrakeTempLeft: 498, rearBrakeTempRight: 495 },
      HAM: { driverCode: 'HAM', frontWingLeft: 79, frontWingRight: 80, rearWingLeft: 71, rearWingRight: 72, ersDeployment: 96, mguKRecovery: 53, frontBrakeTempLeft: 510, frontBrakeTempRight: 506, rearBrakeTempLeft: 468, rearBrakeTempRight: 464 },
    },
  },

  '2024_MZA_R': {
    session: {
      id: '2024_MZA_R',
      sessionName: 'RACE',
      circuit: 'Italian Grand Prix',
      circuitCode: 'MZA',
      date: '2024-09-01',
      totalLaps: 53,
      currentLap: 32,
      conditions: 'DRY',
    },
    lapData: {
      VER: generateLaps(ms(1,20,456), ms(0,26,200), ms(0,34,100), ms(0,20,156), 'MEDIUM', 38, 10),
      NOR: generateLaps(ms(1,20,812), ms(0,26,350), ms(0,34,300), ms(0,20,162), 'MEDIUM', 38, 10),
      LEC: generateLaps(ms(1,21,234), ms(0,26,500), ms(0,34,500), ms(0,20,234), 'SOFT',   38, 10),
      SAI: generateLaps(ms(1,21,567), ms(0,26,600), ms(0,34,700), ms(0,20,267), 'SOFT',   38, 10),
      HAM: generateLaps(ms(1,21,890), ms(0,26,700), ms(0,35,100), ms(0,20,190), 'HARD',   38, 10),
    },
    telemetry: {
      VER: generateSpeedTrace(340, 'monza'),
      NOR: generateSpeedTrace(335, 'monza'),
      LEC: generateSpeedTrace(330, 'monza'),
      SAI: generateSpeedTrace(327, 'monza'),
      HAM: generateSpeedTrace(323, 'monza'),
    },
    standings: [
      { position: 1, driverCode: 'VER', gap: 'LEADER', interval: 'LEADER', lastLap: ms(1,20,456), sector1: ms(0,26,200), sector2: ms(0,34,100), sector3: ms(0,20,156), compound: 'MEDIUM', tyreAge: 17, pitCount: 1, isPersonalBest: false, isSessionBest: true  },
      { position: 2, driverCode: 'NOR', gap: '+3.124',  interval: '+3.124',  lastLap: ms(1,20,812), sector1: ms(0,26,350), sector2: ms(0,34,300), sector3: ms(0,20,162), compound: 'MEDIUM', tyreAge: 16, pitCount: 1, isPersonalBest: true,  isSessionBest: false },
      { position: 3, driverCode: 'LEC', gap: '+7.234',  interval: '+4.110',  lastLap: ms(1,21,234), sector1: ms(0,26,500), sector2: ms(0,34,500), sector3: ms(0,20,234), compound: 'SOFT',   tyreAge: 8,  pitCount: 1, isPersonalBest: false, isSessionBest: false },
      { position: 4, driverCode: 'SAI', gap: '+10.876', interval: '+3.642',  lastLap: ms(1,21,567), sector1: ms(0,26,600), sector2: ms(0,34,700), sector3: ms(0,20,267), compound: 'SOFT',   tyreAge: 8,  pitCount: 1, isPersonalBest: false, isSessionBest: false },
      { position: 5, driverCode: 'HAM', gap: '+15.612', interval: '+4.736',  lastLap: ms(1,21,890), sector1: ms(0,26,700), sector2: ms(0,35,100), sector3: ms(0,20,190), compound: 'HARD',   tyreAge: 32, pitCount: 0, isPersonalBest: false, isSessionBest: false },
    ],
    stints: [
      { driverCode: 'VER', compound: 'SOFT',   startLap: 1,  endLap: 15 },
      { driverCode: 'VER', compound: 'MEDIUM', startLap: 16, endLap: 32 },
      { driverCode: 'NOR', compound: 'SOFT',   startLap: 1,  endLap: 16 },
      { driverCode: 'NOR', compound: 'MEDIUM', startLap: 17, endLap: 32 },
      { driverCode: 'LEC', compound: 'SOFT',   startLap: 1,  endLap: 14 },
      { driverCode: 'LEC', compound: 'MEDIUM', startLap: 15, endLap: 32 },
      { driverCode: 'SAI', compound: 'SOFT',   startLap: 1,  endLap: 15 },
      { driverCode: 'SAI', compound: 'MEDIUM', startLap: 16, endLap: 32 },
      { driverCode: 'HAM', compound: 'MEDIUM', startLap: 1,  endLap: 32 },
    ],
    gapHistory: buildGapHistory(['VER','NOR','LEC','SAI','HAM'], { VER: 0, NOR: 3.1, LEC: 7.2, SAI: 10.8, HAM: 15.6 }, 32),
    diagnostics: {
      VER: { driverCode: 'VER', frontWingLeft: 68, frontWingRight: 67, rearWingLeft: 58, rearWingRight: 59, ersDeployment: 88, mguKRecovery: 72, frontBrakeTempLeft: 480, frontBrakeTempRight: 476, rearBrakeTempLeft: 440, rearBrakeTempRight: 436 },
      NOR: { driverCode: 'NOR', frontWingLeft: 65, frontWingRight: 66, rearWingLeft: 55, rearWingRight: 56, ersDeployment: 92, mguKRecovery: 68, frontBrakeTempLeft: 498, frontBrakeTempRight: 494, rearBrakeTempLeft: 452, rearBrakeTempRight: 448 },
      LEC: { driverCode: 'LEC', frontWingLeft: 70, frontWingRight: 69, rearWingLeft: 60, rearWingRight: 61, ersDeployment: 80, mguKRecovery: 75, frontBrakeTempLeft: 510, frontBrakeTempRight: 507, rearBrakeTempLeft: 462, rearBrakeTempRight: 458 },
      SAI: { driverCode: 'SAI', frontWingLeft: 69, frontWingRight: 68, rearWingLeft: 59, rearWingRight: 60, ersDeployment: 82, mguKRecovery: 71, frontBrakeTempLeft: 502, frontBrakeTempRight: 499, rearBrakeTempLeft: 455, rearBrakeTempRight: 451 },
      HAM: { driverCode: 'HAM', frontWingLeft: 63, frontWingRight: 64, rearWingLeft: 53, rearWingRight: 54, ersDeployment: 85, mguKRecovery: 65, frontBrakeTempLeft: 465, frontBrakeTempRight: 461, rearBrakeTempLeft: 425, rearBrakeTempRight: 421 },
    },
  },

  '2024_MZA_Q': {
    session: {
      id: '2024_MZA_Q',
      sessionName: 'QUALIFYING',
      circuit: 'Italian Grand Prix',
      circuitCode: 'MZA',
      date: '2024-08-31',
      totalLaps: 0,
      currentLap: 0,
      conditions: 'DRY',
    },
    lapData: {
      VER: generateLaps(ms(1,19,406), ms(0,25,800), ms(0,33,500), ms(0,20,106), 'SOFT', 1, 10),
      NOR: generateLaps(ms(1,19,587), ms(0,25,900), ms(0,33,600), ms(0,20,87), 'SOFT', 1, 10),
      LEC: generateLaps(ms(1,19,892), ms(0,26,0), ms(0,33,800), ms(0,20,92), 'SOFT', 1, 10),
      SAI: generateLaps(ms(1,20,134), ms(0,26,100), ms(0,33,950), ms(0,20,84), 'SOFT', 1, 10),
      HAM: generateLaps(ms(1,20,456), ms(0,26,250), ms(0,34,100), ms(0,20,106), 'SOFT', 1, 10),
    },
    telemetry: {
      VER: generateSpeedTrace(355, 'monza'),
      NOR: generateSpeedTrace(352, 'monza'),
      LEC: generateSpeedTrace(347, 'monza'),
      SAI: generateSpeedTrace(344, 'monza'),
      HAM: generateSpeedTrace(340, 'monza'),
    },
    standings: [
      { position: 1, driverCode: 'VER', gap: 'LEADER', interval: 'LEADER', lastLap: ms(1,19,406), sector1: ms(0,25,800), sector2: ms(0,33,500), sector3: ms(0,20,106), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: true  },
      { position: 2, driverCode: 'NOR', gap: '+0.181',  interval: '+0.181',  lastLap: ms(1,19,587), sector1: ms(0,25,900), sector2: ms(0,33,600), sector3: ms(0,20,87), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: false },
      { position: 3, driverCode: 'LEC', gap: '+0.486',  interval: '+0.305',  lastLap: ms(1,19,892), sector1: ms(0,26,0), sector2: ms(0,33,800), sector3: ms(0,20,92), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: false },
      { position: 4, driverCode: 'SAI', gap: '+0.728',  interval: '+0.242',  lastLap: ms(1,20,134), sector1: ms(0,26,100), sector2: ms(0,33,950), sector3: ms(0,20,84), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: false },
      { position: 5, driverCode: 'HAM', gap: '+1.050',  interval: '+0.322',  lastLap: ms(1,20,456), sector1: ms(0,26,250), sector2: ms(0,34,100), sector3: ms(0,20,106), compound: 'SOFT', tyreAge: 1, pitCount: 0, isPersonalBest: true,  isSessionBest: false },
    ],
    stints: [
      { driverCode: 'VER', compound: 'SOFT', startLap: 1, endLap: 10 },
      { driverCode: 'NOR', compound: 'SOFT', startLap: 1, endLap: 10 },
      { driverCode: 'LEC', compound: 'SOFT', startLap: 1, endLap: 10 },
      { driverCode: 'SAI', compound: 'SOFT', startLap: 1, endLap: 10 },
      { driverCode: 'HAM', compound: 'SOFT', startLap: 1, endLap: 10 },
    ],
    gapHistory: buildGapHistory(['VER','NOR','LEC','SAI','HAM'], { VER: 0, NOR: 0.181, LEC: 0.486, SAI: 0.728, HAM: 1.050 }, 10),
    diagnostics: {
      VER: { driverCode: 'VER', frontWingLeft: 66, frontWingRight: 65, rearWingLeft: 56, rearWingRight: 57, ersDeployment: 98, mguKRecovery: 70, frontBrakeTempLeft: 490, frontBrakeTempRight: 487, rearBrakeTempLeft: 448, rearBrakeTempRight: 444 },
      NOR: { driverCode: 'NOR', frontWingLeft: 63, frontWingRight: 64, rearWingLeft: 53, rearWingRight: 54, ersDeployment: 99, mguKRecovery: 66, frontBrakeTempLeft: 505, frontBrakeTempRight: 502, rearBrakeTempLeft: 458, rearBrakeTempRight: 454 },
      LEC: { driverCode: 'LEC', frontWingLeft: 68, frontWingRight: 67, rearWingLeft: 58, rearWingRight: 59, ersDeployment: 97, mguKRecovery: 73, frontBrakeTempLeft: 518, frontBrakeTempRight: 515, rearBrakeTempLeft: 468, rearBrakeTempRight: 464 },
      SAI: { driverCode: 'SAI', frontWingLeft: 67, frontWingRight: 66, rearWingLeft: 57, rearWingRight: 58, ersDeployment: 96, mguKRecovery: 69, frontBrakeTempLeft: 508, frontBrakeTempRight: 505, rearBrakeTempLeft: 460, rearBrakeTempRight: 456 },
      HAM: { driverCode: 'HAM', frontWingLeft: 61, frontWingRight: 62, rearWingLeft: 51, rearWingRight: 52, ersDeployment: 98, mguKRecovery: 63, frontBrakeTempLeft: 472, frontBrakeTempRight: 468, rearBrakeTempLeft: 430, rearBrakeTempRight: 426 },
    },
  },

};

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class MockTelemetryService {

  // ── Signals / state ────────────────────────────────────────────────────────
  isLive = signal(false);
  sessionComplete = signal(false);
  private _activeSessionId = signal('2024_MON_R');
  private _sessionSubject = new BehaviorSubject<Session>(SESSION_DATA['2024_MON_R'].session);
  private _standingsSubject = new BehaviorSubject<Standing[]>(SESSION_DATA['2024_MON_R'].standings);
  private _liveInterval: ReturnType<typeof setInterval> | null = null;

  // ── Private accessor ───────────────────────────────────────────────────────
  private get _data(): SessionDataEntry {
    return SESSION_DATA[this._activeSessionId()];
  }

  // ── Session meta ───────────────────────────────────────────────────────────

  getSessionsMeta(): Observable<SessionMeta[]> {
    return of(SESSIONS_META);
  }

  getActiveSessionId(): string {
    return this._activeSessionId();
  }

  switchSession(id: string): void {
    if (!SESSION_DATA[id]) return;
    this.stopLive();
    this._activeSessionId.set(id);
    this._sessionSubject.next(SESSION_DATA[id].session);
    this._standingsSubject.next(SESSION_DATA[id].standings);
  }

  // ── Session ────────────────────────────────────────────────────────────────

  getSession(): Observable<Session> {
    return this._sessionSubject.asObservable();
  }

  // ── Drivers ────────────────────────────────────────────────────────────────

  getDrivers(): Observable<Driver[]> {
    return of(DRIVERS);
  }

  getDriver(code: string): Observable<Driver | undefined> {
    return of(DRIVERS.find(d => d.driverCode === code));
  }

  // ── Laps ───────────────────────────────────────────────────────────────────

  getLaps(driverCode: string): Observable<Lap[]> {
    return of(this._data.lapData[driverCode] ?? []);
  }

  getLap(driverCode: string, lapNumber: number): Observable<Lap | undefined> {
    return of((this._data.lapData[driverCode] ?? []).find(l => l.lapNumber === lapNumber));
  }

  getSessionBestLap(): Observable<Lap | undefined> {
    const all = Object.values(this._data.lapData).flat();
    const best = all.reduce<Lap | undefined>(
      (b, l) => (!b || l.lapTime < b.lapTime) ? l : b,
      undefined
    );
    return of(best);
  }

  getLapStats(driverCode: string): Observable<LapStats> {
    return of(computeStats(driverCode, this._data.lapData[driverCode] ?? []));
  }

  getAllDriversLapStats(): Observable<LapStats[]> {
    const stats = DRIVERS.map(d => computeStats(d.driverCode, this._data.lapData[d.driverCode] ?? []));
    return of(stats);
  }

  // ── Telemetry ──────────────────────────────────────────────────────────────

  getTelemetry(driverCode: string): Observable<TelemetryFrame | undefined> {
    return of(this._data.telemetry[driverCode]);
  }

  getAverageTelemetry(driverCode: string): Observable<TelemetryFrame | undefined> {
    const profileKey = this._data.session.circuitCode === 'MZA' ? 'monza' : 'monaco';
    const existing = this._data.telemetry[driverCode];
    if (!existing) return of(undefined);
    const baseSpeed = Math.round(existing.speed.reduce((a, b) => Math.max(a, b), 0));
    const frame1 = generateSpeedTrace(baseSpeed - 5, profileKey);
    const frame2 = generateSpeedTrace(baseSpeed + 5, profileKey);
    return of(computeAverageTrace([frame1, frame2]));
  }

  getDrsZones(): Observable<DrsZone[]> {
    const circuitCode = this._data.session.circuitCode;
    return of(circuitCode === 'MZA' ? DRS_ZONES_MZA : DRS_ZONES_MON);
  }

  // ── Standings ──────────────────────────────────────────────────────────────

  getStandings(): Observable<Standing[]> {
    return this._standingsSubject.asObservable();
  }

  // ── Stints ─────────────────────────────────────────────────────────────────

  getStints(): Observable<Stint[]> {
    return of(this._data.stints);
  }

  // ── Gap history ────────────────────────────────────────────────────────────

  getGapHistory(): Observable<Record<string, number[]>> {
    return of(this._data.gapHistory);
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  getDiagnostics(driverCode: string): Observable<CarDiagnostics | undefined> {
    return of(this._data.diagnostics[driverCode]);
  }

  // ── Live mode ──────────────────────────────────────────────────────────────

  startLive(): void {
    if (this._liveInterval) return;
    this.isLive.set(true);
    this.sessionComplete.set(false);

    this._liveInterval = setInterval(() => {
      const current = this._sessionSubject.getValue();
      if (current.currentLap >= current.totalLaps) {
        this.stopLive();
        this.sessionComplete.set(true);
        return;
      }

      const updated: Session = { ...current, currentLap: current.currentLap + 1 };
      this._sessionSubject.next(updated);

      const standings = this._standingsSubject.getValue().map(s => {
        if (s.position === 1) return s;
        const gapMs = parseFloat(s.gap.replace('+', '')) * 1000;
        const newGapMs = gapMs + (Math.random() - 0.48) * 300;
        const newGap = '+' + (newGapMs / 1000).toFixed(3);
        const newLap = s.lastLap + Math.round((Math.random() - 0.48) * 200);
        return { ...s, gap: newGap, lastLap: newLap };
      });
      this._standingsSubject.next(standings);
    }, 3000);
  }

  stopLive(): void {
    if (this._liveInterval) {
      clearInterval(this._liveInterval);
      this._liveInterval = null;
    }
    this.isLive.set(false);
  }

  toggleLive(): void {
    this.isLive() ? this.stopLive() : this.startLive();
  }
}
