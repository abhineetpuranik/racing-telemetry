import { Lap } from './lap.model';

export interface Stint {
  driverCode: string;
  compound: Lap['compound'];
  startLap: number;
  endLap: number;
}
