import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { Stint } from '../../../core/models/stint.model';
import { Driver } from '../../../core/models/driver.model';
import { Lap } from '../../../core/models/lap.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';

const COMPOUND_COLORS: Record<Lap['compound'], string> = {
  SOFT:         '#e8003d',
  MEDIUM:       '#e8b800',
  HARD:         '#9e9e9e',
  INTERMEDIATE: '#00e87a',
  WET:          '#0066ff',
};

@Component({
  selector: 'app-tyre-strategy',
  standalone: true,
  imports: [CommonModule, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tyre-strategy.component.html',
  styleUrl: './tyre-strategy.component.scss',
})
export class TyreStrategyComponent implements OnInit, OnDestroy {
  drivers: Driver[] = [];
  stints: Stint[] = [];
  totalLaps = 1;
  axisTicks: number[] = [];
  panelLabel = 'Tyre Strategy';

  private sub!: Subscription;

  constructor(private svc: TelemetryService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Subscribe to _data$ once — extract everything in one map to avoid combineLatest timing issues
    this.sub = this.svc.getSessionFileData().subscribe(data => {
      this.drivers    = data.drivers;
      this.stints     = data.stints;
      this.panelLabel = `Tyre Strategy — ${data.session.circuit} ${data.session.sessionName}`;
      this.totalLaps  = data.session.totalLaps > 0
        ? data.session.totalLaps
        : this.deriveTotalLaps(data.stints);
      this.axisTicks  = this.buildTicks(this.totalLaps);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  getStints(code: string): Stint[] {
    return this.stints.filter(s => s.driverCode === code);
  }

  getPitLaps(code: string): number[] {
    return this.getStints(code).slice(1).map(s => s.startLap - 1);
  }

  getCompoundColor(compound: Lap['compound']): string {
    return COMPOUND_COLORS[compound] ?? '#7a7a8a';
  }

  private deriveTotalLaps(stints: Stint[]): number {
    return Math.max(...stints.map(s => s.endLap), 1);
  }

  private buildTicks(total: number): number[] {
    // Aim for ~6 ticks regardless of race length
    const step = Math.ceil(total / 6);
    const ticks: number[] = [1];
    for (let t = step; t < total; t += step) ticks.push(t);
    ticks.push(total);
    return [...new Set(ticks)];
  }
}
