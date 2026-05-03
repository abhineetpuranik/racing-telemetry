import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { TelemetryFrame } from '../../../core/models/telemetry.model';
import { Driver } from '../../../core/models/driver.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';

Chart.register(...registerables);

@Component({
  selector: 'app-speed-trace',
  standalone: true,
  imports: [CommonModule, FormsModule, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './speed-trace.component.html',
  styleUrl: './speed-trace.component.scss',
})
export class SpeedTraceComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() selectedDriver = 'VER';
  @ViewChild('speedCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  selectedLap = 38;
  lapOptions = Array.from({ length: 10 }, (_, i) => 38 + i);
  compareDriver = '';
  allDriverCodes: string[] = [];

  private telemetry: TelemetryFrame | null = null;
  private compareTelemetry: TelemetryFrame | null = null;
  private driver: Driver | null = null;
  private compareDriverObj: Driver | null = null;
  private chart: Chart | null = null;

  constructor(
    private svc: TelemetryService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    this.svc.getDrivers().subscribe(drivers => {
      this.allDriverCodes = drivers.map(d => d.driverCode);
      this.cdr.markForCheck();
    });
    this.loadData();
  }

  ngOnChanges(): void { this.loadData(); }
  ngAfterViewInit(): void { if (isPlatformBrowser(this.platformId)) this.buildChart(); }
  ngOnDestroy(): void { this.chart?.destroy(); }

  onLapChange(): void { this.updateChart(); }

  onCompareDriverChange(): void {
    if (!this.compareDriver) {
      this.compareTelemetry = null;
      this.compareDriverObj = null;
      this.updateChart();
      return;
    }
    this.svc.getDriver(this.compareDriver).subscribe(d => { this.compareDriverObj = d ?? null; });
    this.svc.getTelemetry(this.compareDriver).subscribe(t => {
      this.compareTelemetry = t ?? null;
      this.updateChart();
      this.cdr.markForCheck();
    });
  }

  private loadData(): void {
    this.svc.getDriver(this.selectedDriver).subscribe(d => { this.driver = d ?? null; });
    this.svc.getTelemetry(this.selectedDriver).subscribe(t => {
      this.telemetry = t ?? null;
      this.updateChart();
      this.cdr.markForCheck();
    });
  }

  private buildChart(): void {
    if (!this.canvasRef) return;
    const ctx = this.canvasRef.nativeElement.getContext('2d')!;

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.telemetry?.distance ?? [],
        datasets: [
          {
            label: this.selectedDriver,
            data: this.telemetry?.speed ?? [],
            borderColor: this.driver?.teamColor ?? '#f06292',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.2,
            fill: false,
          },
          {
            label: '',
            data: [],
            borderColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 3],
            pointRadius: 0,
            tension: 0.2,
            fill: false,
          },
        ],
      },
      options: this.buildOptions(),
    } as ChartConfiguration);
  }

  private updateChart(): void {
    if (!this.chart || !this.telemetry) return;

    this.chart.data.labels = this.telemetry.distance;
    this.chart.data.datasets[0].data = this.telemetry.speed;
    (this.chart.data.datasets[0] as any).borderColor = this.driver?.teamColor ?? '#f06292';
    (this.chart.data.datasets[0] as any).label = this.selectedDriver;

    // Compare driver dataset
    if (this.compareTelemetry && this.compareDriverObj) {
      this.chart.data.datasets[1].data = this.compareTelemetry.speed;
      (this.chart.data.datasets[1] as any).borderColor = this.compareDriverObj.teamColor;
      (this.chart.data.datasets[1] as any).label = this.compareDriver;
    } else {
      this.chart.data.datasets[1].data = [];
      (this.chart.data.datasets[1] as any).label = '';
    }

    // Update legend visibility
    (this.chart.options as any).plugins.legend.display = !!this.compareDriver;
    this.chart.update('none');
  }

  private buildOptions(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: false,
          labels: {
            color: '#6D7680',
            font: { family: 'Inter', size: 9 },
            boxWidth: 10,
            padding: 8,
          },
        },
        tooltip: {
          backgroundColor: '#0d0a0b',
          borderColor: '#2e1e24',
          borderWidth: 1,
          titleColor: '#6D7680',
          bodyColor: '#F3F9FB',
          titleFont: { family: 'Inter', size: 10 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          callbacks: {
            title: items => `${items[0].label}m`,
            label: item => `${item.dataset.label}: ${item.formattedValue} km/h`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Distance (m)', color: '#6D7680', font: { family: 'Inter', size: 9 } },
          ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 8 },
          grid: { color: 'rgba(30,18,21,0.8)' },
          border: { color: '#2e1e24' },
        },
        y: {
          min: 0,
          max: 380,
          title: { display: true, text: 'Speed (km/h)', color: '#6D7680', font: { family: 'Inter', size: 9 } },
          ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 9 } },
          grid: { display: false },
          border: { color: '#2e1e24' },
        },
      },
    };
  }
}
