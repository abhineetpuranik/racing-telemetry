import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { Standing } from '../../../core/models/standing.model';
import { Driver } from '../../../core/models/driver.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';
import { TyreBadgeComponent } from '../../../shared/components/tyre-badge/tyre-badge.component';
import { ValueFlashDirective } from '../../../shared/directives/value-flash.directive';

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
  selector: 'app-timing-tower',
  standalone: true,
  imports: [CommonModule, PanelComponent, TyreBadgeComponent, ValueFlashDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timing-tower.component.html',
  styleUrl: './timing-tower.component.scss',
})
export class TimingTowerComponent implements OnInit, OnDestroy {
  @Input() selectedDriver = 'VER';
  @Output() driverSelected = new EventEmitter<string>();

  standings: Standing[] = [];

  readonly formatMs = formatMs;
  readonly formatSector = formatSector;

  private driverMap = new Map<string, Driver>();
  private subs = new Subscription();

  constructor(private svc: TelemetryService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.subs.add(
      this.svc.getDrivers().subscribe(drivers => {
        drivers.forEach(d => this.driverMap.set(d.driverCode, d));
      }),
    );
    this.subs.add(
      this.svc.getStandings().subscribe(s => {
        this.standings = s;
        this.cdr.markForCheck();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  getTeamColor(code: string): string {
    return this.driverMap.get(code)?.teamColor ?? '#7a7a8a';
  }

  selectDriver(code: string): void {
    this.driverSelected.emit(code);
  }
}
