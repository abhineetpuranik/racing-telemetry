import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { Lap } from '../../../core/models/lap.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { DeltaChipComponent } from '../../../shared/components/delta-chip/delta-chip.component';
import { TyreBadgeComponent } from '../../../shared/components/tyre-badge/tyre-badge.component';

function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
}

function formatSector(ms: number): string {
  const s = Math.floor(ms / 1000);
  const rem = ms % 1000;
  return `${s}.${String(rem).padStart(3, '0')}`;
}

@Component({
  selector: 'app-lap-breakdown',
  standalone: true,
  imports: [CommonModule, PanelComponent, StatCardComponent, DeltaChipComponent, TyreBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lap-breakdown.component.html',
  styleUrl: './lap-breakdown.component.scss',
})
export class LapBreakdownComponent implements OnInit, OnChanges {
  @Input() selectedDriver = 'VER';

  currentLap: Lap | null = null;
  sessionBestLap: Lap | null = null;
  s1Delta: number | null = null;
  s2Delta: number | null = null;
  s3Delta: number | null = null;
  lapDelta: number | null = null;

  readonly formatMs = formatMs;
  readonly formatSector = formatSector;

  constructor(private svc: TelemetryService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.loadData(); }
  ngOnChanges(): void { this.loadData(); }

  private loadData(): void {
    this.svc.getSessionBestLap().subscribe(sb => { this.sessionBestLap = sb ?? null; });
    this.svc.getLaps(this.selectedDriver).subscribe(laps => {
      this.currentLap = laps[laps.length - 1] ?? null;
      this.computeDeltas();
      this.cdr.markForCheck();
    });
  }

  private computeDeltas(): void {
    if (!this.currentLap || !this.sessionBestLap) {
      this.s1Delta = this.s2Delta = this.s3Delta = this.lapDelta = null;
      return;
    }
    this.s1Delta  = this.currentLap.sector1 - this.sessionBestLap.sector1;
    this.s2Delta  = this.currentLap.sector2 - this.sessionBestLap.sector2;
    this.s3Delta  = this.currentLap.sector3 - this.sessionBestLap.sector3;
    this.lapDelta = this.currentLap.lapTime  - this.sessionBestLap.lapTime;
  }
}
