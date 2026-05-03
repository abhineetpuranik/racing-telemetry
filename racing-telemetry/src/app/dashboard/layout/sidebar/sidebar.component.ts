import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { Driver } from '../../../core/models/driver.model';
import { SessionMeta } from '../../../core/models/session.model';

export interface PanelVisibility {
  timingTower: boolean;
  lapBreakdown: boolean;
  speedTrace: boolean;
  pedalTrace: boolean;
  tyreStrategy: boolean;
  gapChart: boolean;
  carDiagnostics: boolean;
  sectorMap: boolean;
  lapEvolution: boolean;
  telemetryAnalysis: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  @Input() selectedDriver = 'SAI';
  @Input() panels!: PanelVisibility;
  @Output() driverSelected = new EventEmitter<string>();
  @Output() panelsChanged = new EventEmitter<PanelVisibility>();

  drivers: Driver[] = [];
  filteredDrivers: Driver[] = [];
  sessions: SessionMeta[] = [];
  activeSessionId = '2023_MZA_Q';
  driverFilter = '';

  readonly panelKeys: { key: keyof PanelVisibility; label: string }[] = [
    { key: 'timingTower',       label: 'Timing Tower' },
    { key: 'lapBreakdown',      label: 'Lap Breakdown' },
    { key: 'speedTrace',        label: 'Speed Trace' },
    { key: 'pedalTrace',        label: 'Pedal Trace' },
    { key: 'tyreStrategy',      label: 'Tyre Strategy' },
    { key: 'gapChart',          label: 'Position Tracker' },
    { key: 'carDiagnostics',    label: 'Car Diagnostics' },
    { key: 'sectorMap',         label: 'Sector Map' },
    { key: 'lapEvolution',      label: 'Lap Evolution' },
    { key: 'telemetryAnalysis', label: 'Telemetry vs Avg' },
  ];

  constructor(public svc: TelemetryService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.svc.getDrivers().subscribe(d => {
      this.drivers = d;
      this.filteredDrivers = d;
      this.cdr.markForCheck();
    });
    this.svc.getSessionsMeta().subscribe(s => {
      this.sessions = s;
      this.cdr.markForCheck();
    });
    this.activeSessionId = this.svc.getActiveSessionId();
  }

  get selectedDriverObj(): Driver | undefined {
    return this.drivers.find(d => d.driverCode === this.selectedDriver);
  }

  onFilterChange(): void {
    const q = this.driverFilter.trim().toLowerCase();
    this.filteredDrivers = q
      ? this.drivers.filter(d =>
          d.driverCode.toLowerCase().includes(q) ||
          d.fullName.toLowerCase().includes(q) ||
          d.team.toLowerCase().includes(q),
        )
      : this.drivers;
    this.cdr.markForCheck();
  }

  selectDriver(code: string): void {
    this.driverSelected.emit(code);
  }

  onSessionChange(id: string): void {
    this.activeSessionId = id;
    this.driverFilter = '';
    this.svc.switchSession(id);
    // Reload drivers for new session
    this.svc.getDrivers().subscribe(d => {
      this.drivers = d;
      this.filteredDrivers = d;
      this.cdr.markForCheck();
    });
  }

  togglePanel(key: keyof PanelVisibility): void {
    this.panelsChanged.emit({ ...this.panels, [key]: !this.panels[key] });
  }
}
