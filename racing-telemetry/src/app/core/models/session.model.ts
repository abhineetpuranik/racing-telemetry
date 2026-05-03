export interface Session {
  id: string;                // e.g. "2024_MON_R"
  sessionName: string;       // e.g. "RACE", "QUALIFYING"
  circuit: string;           // e.g. "Monaco Grand Prix"
  circuitCode: string;       // e.g. "MON"
  date: string;
  totalLaps: number;
  currentLap: number;
  conditions: 'DRY' | 'WET' | 'MIXED';
}

export interface SessionMeta {
  id: string;
  label: string;             // e.g. "Monaco — Race"
  circuitCode: string;
  sessionName: string;
  year: number;
}
