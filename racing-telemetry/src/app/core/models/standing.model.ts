import { Lap } from './lap.model';

export interface Standing {
  position: number;
  driverCode: string;
  gap: string;               // e.g. "+1.432" or "LEADER"
  interval: string;          // e.g. "+0.213"
  lastLap: number;           // ms
  sector1: number;
  sector2: number;
  sector3: number;
  compound: Lap['compound'];
  tyreAge: number;
  pitCount: number;
  isPersonalBest: boolean;
  isSessionBest: boolean;
}
