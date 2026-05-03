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
import { CarDiagnostics } from '../../../core/models/diagnostics.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';

function brakeColor(temp: number): string {
  if (temp < 300) return '#3671C6';
  if (temp < 600) return '#00e87a';
  return '#e8003d';
}

@Component({
  selector: 'app-car-diagnostics',
  standalone: true,
  imports: [CommonModule, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './car-diagnostics.component.html',
  styleUrl: './car-diagnostics.component.scss',
})
export class CarDiagnosticsComponent implements OnInit, OnChanges {
  @Input() selectedDriver = 'VER';

  diag: CarDiagnostics | null = null;
  readonly brakeColor = brakeColor;

  constructor(private svc: TelemetryService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.loadData(); }
  ngOnChanges(): void { this.loadData(); }

  private loadData(): void {
    this.svc.getDiagnostics(this.selectedDriver).subscribe(d => {
      this.diag = d ?? null;
      this.cdr.markForCheck();
    });
  }
}
