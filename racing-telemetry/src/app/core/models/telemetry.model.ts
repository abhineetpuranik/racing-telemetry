export interface TelemetryFrame {
  distance: number[];        // metres
  speed: number[];           // km/h
  throttle: number[];        // 0–100
  brake: number[];           // 0–100
  gear: number[];
  drs: boolean[];
}

export interface DrsZone {
  start: number;             // metres
  end: number;               // metres
}
