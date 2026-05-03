import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { Lap } from '../../../core/models/lap.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';

type SectorStatus = 'session-best' | 'personal-best' | 'faster' | 'normal';

const STATUS_COLORS: Record<SectorStatus, string> = {
  'session-best':  '#7f00ff',
  'personal-best': '#00e87a',
  'faster':        '#e8b800',
  'normal':        '#7a7a8a',
};

function formatSector(ms: number): string {
  const s = Math.floor(ms / 1000);
  const rem = ms % 1000;
  return `${s}.${String(rem).padStart(3, '0')}`;
}

@Component({
  selector: 'app-sector-map',
  standalone: true,
  imports: [CommonModule, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sector-map.component.html',
  styleUrl: './sector-map.component.scss',
})
export class SectorMapComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedDriver = 'VER';

  currentLap: Lap | null = null;
  sessionBestLap: Lap | null = null;
  sectorColors: string[] = ['#7a7a8a', '#7a7a8a', '#7a7a8a'];
  circuitCode = 'MON';
  panelLabel = 'Sector Map — Monaco';

  readonly formatSector = formatSector;
  readonly legendItems = [
    { color: STATUS_COLORS['session-best'],  label: 'Session Best' },
    { color: STATUS_COLORS['personal-best'], label: 'Personal Best' },
    { color: STATUS_COLORS['faster'],        label: 'Faster' },
    { color: STATUS_COLORS['normal'],        label: 'No Improvement' },
  ];

  private sub!: Subscription;

  constructor(private svc: TelemetryService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.subscribe(); }
  ngOnChanges(): void { this.subscribe(); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private subscribe(): void {
    this.sub?.unsubscribe();
    // Subscribe to _data$ once — extract everything in one map
    this.sub = this.svc.getSessionFileData().subscribe(data => {
      this.circuitCode    = data.session.circuitCode;
      this.panelLabel     = `Sector Map — ${data.session.circuit}`;
      this.sessionBestLap = this.findSessionBest(data.lapData);
      this.currentLap     = (data.lapData[this.selectedDriver] ?? []).at(-1) ?? null;
      this.computeColors();
      this.cdr.markForCheck();
    });
  }

  private findSessionBest(lapData: Record<string, import('../../../core/models/lap.model').Lap[]>): import('../../../core/models/lap.model').Lap | null {
    const all = Object.values(lapData).flat();
    return all.reduce<import('../../../core/models/lap.model').Lap | null>(
      (b, l) => (!b || l.lapTime < b.lapTime) ? l : b, null
    );
  }

  private computeColors(): void {
    if (!this.currentLap || !this.sessionBestLap) {
      this.sectorColors = ['#7a7a8a', '#7a7a8a', '#7a7a8a'];
      return;
    }
    const sectors: [number, number][] = [
      [this.currentLap.sector1, this.sessionBestLap.sector1],
      [this.currentLap.sector2, this.sessionBestLap.sector2],
      [this.currentLap.sector3, this.sessionBestLap.sector3],
    ];
    this.sectorColors = sectors.map(([cur, best]) => {
      if (cur <= best)         return STATUS_COLORS['session-best'];
      if (cur <= best * 1.005) return STATUS_COLORS['personal-best'];
      if (cur <= best * 1.01)  return STATUS_COLORS['faster'];
      return STATUS_COLORS['normal'];
    });
  }
}
