import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent, PanelVisibility } from '../sidebar/sidebar.component';
import { TimingTowerComponent } from '../../panels/timing-tower/timing-tower.component';
import { LapBreakdownComponent } from '../../panels/lap-breakdown/lap-breakdown.component';
import { SpeedTraceComponent } from '../../panels/speed-trace/speed-trace.component';
import { PedalTraceComponent } from '../../panels/pedal-trace/pedal-trace.component';
import { TyreStrategyComponent } from '../../panels/tyre-strategy/tyre-strategy.component';
import { GapChartComponent } from '../../panels/gap-chart/gap-chart.component';
import { CarDiagnosticsComponent } from '../../panels/car-diagnostics/car-diagnostics.component';
import { SectorMapComponent } from '../../panels/sector-map/sector-map.component';
import { LapEvolutionComponent } from '../../panels/lap-evolution/lap-evolution.component';
import { TelemetryAnalysisComponent } from '../../panels/telemetry-analysis/telemetry-analysis.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    SidebarComponent,
    TimingTowerComponent,
    LapBreakdownComponent,
    SpeedTraceComponent,
    PedalTraceComponent,
    TyreStrategyComponent,
    GapChartComponent,
    CarDiagnosticsComponent,
    SectorMapComponent,
    LapEvolutionComponent,
    TelemetryAnalysisComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  selectedDriver = signal('VER');

  panels = signal<PanelVisibility>({
    timingTower:       true,
    lapBreakdown:      true,
    speedTrace:        true,
    pedalTrace:        true,
    tyreStrategy:      true,
    gapChart:          true,
    carDiagnostics:    true,
    sectorMap:         true,
    lapEvolution:      true,
    telemetryAnalysis: true,
  });

  onDriverSelected(code: string): void {
    this.selectedDriver.set(code);
  }

  onPanelsChanged(p: PanelVisibility): void {
    this.panels.set(p);
  }
}
