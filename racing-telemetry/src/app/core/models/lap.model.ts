export interface Lap {
  lapNumber: number;
  lapTime: number;           // milliseconds
  sector1: number;
  sector2: number;
  sector3: number;
  isPersonalBest: boolean;
  isSessionBest: boolean;
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';
  tyreAge: number;
}

export interface LapStats {
  driverCode: string;
  avgLapTime: number;        // ms
  bestLapTime: number;       // ms
  stdDev: number;            // ms — consistency metric
  avgSector1: number;
  avgSector2: number;
  avgSector3: number;
  totalLaps: number;
}
