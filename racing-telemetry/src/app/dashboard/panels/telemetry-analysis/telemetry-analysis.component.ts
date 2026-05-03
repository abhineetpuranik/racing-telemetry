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
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { combineLatest, Subscription } from 'rxjs';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { TelemetryFrame } from '../../../core/models/telemetry.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';

Chart.register(...registerables);

const CHART_OPTS = {
  tooltip: {
    backgroundColor: '#0d0a0b',
    borderColor: '#2e1e24',
    borderWidth: 1,
    titleColor: '#6D7680',
    bodyColor: '#F3F9FB',
    titleFont: { family: 'Inter', size: 10 },
    bodyFont: { family: 'JetBrains Mono', size: 11 },
  },
  xScale: {
    type: 'linear' as const,
    ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 8 },
    grid: { color: 'rgba(30,18,21,0.8)' },
    border: { color: '#2e1e24' },
  },
  yScale: {
    ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 9 } },
    grid: { display: false },
    border: { color: '#2e1e24' },
  },
};

@Component({
  selector: 'app-telemetry-analysis',
  standalone: true,
  imports: [CommonModule, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './telemetry-analysis.component.html',
  styleUrl: './telemetry-analysis.component.scss',
})
export class TelemetryAnalysisComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() selectedDriver = 'VER';
  @ViewChild('speedCanvas') speedCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('deltaCanvas') deltaCanvasRef!: ElementRef<HTMLCanvasElement>;

  driverColor = '#f06292';

  private lapTelemetry: TelemetryFrame | null = null;
  private avgTelemetry: TelemetryFrame | null = null;
  private speedChart: Chart | null = null;
  private deltaChart: Chart | null = null;
  private viewReady = false;
  private sub!: Subscription;

  constructor(
    private svc: TelemetryService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void { this.subscribe(); }
  ngOnChanges(): void { this.subscribe(); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (isPlatformBrowser(this.platformId) && this.lapTelemetry && this.avgTelemetry) {
      this.rebuildCharts();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.speedChart?.destroy();
    this.deltaChart?.destroy();
  }

  private subscribe(): void {
    this.sub?.unsubscribe();
    // combineLatest re-fires on session switch AND on driver change
    this.sub = combineLatest([
      this.svc.getDriver(this.selectedDriver),
      this.svc.getTelemetry(this.selectedDriver),
      this.svc.getAverageTelemetry(this.selectedDriver),
    ]).subscribe(([driver, lap, avg]) => {
      this.driverColor  = driver?.teamColor ?? '#BF2052';
      this.lapTelemetry = lap ?? null;
      this.avgTelemetry = avg ?? null;
      if (isPlatformBrowser(this.platformId) && this.viewReady) {
        this.rebuildCharts();
      }
      this.cdr.markForCheck();
    });
  }

  private rebuildCharts(): void {
    if (!this.speedCanvasRef || !this.deltaCanvasRef) return;
    if (!this.lapTelemetry || !this.avgTelemetry) return;

    // Destroy existing charts before rebuilding
    this.speedChart?.destroy();
    this.deltaChart?.destroy();

    this.buildSpeedChart();
    this.buildDeltaChart();
  }

  private buildSpeedChart(): void {
    if (!this.speedCanvasRef) return;
    const ctx = this.speedCanvasRef.nativeElement.getContext('2d')!;

    this.speedChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.lapTelemetry?.distance ?? [],
        datasets: [
          {
            label: 'Selected Lap',
            data: this.lapTelemetry?.speed ?? [],
            borderColor: this.driverColor,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.2,
            fill: false,
          },
          {
            label: 'Average',
            data: this.avgTelemetry?.speed ?? [],
            borderColor: '#8B0025',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            tension: 0.2,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...CHART_OPTS.tooltip,
            callbacks: {
              title: items => `${items[0].label}m`,
              label: item => `${item.dataset.label}: ${item.formattedValue} km/h`,
            },
          },
        },
        scales: {
          x: { ...CHART_OPTS.xScale, title: { display: false } },
          y: {
            ...CHART_OPTS.yScale,
            min: 0,
            max: 380,
            title: { display: false },
          },
        },
      } as ChartConfiguration['options'],
    });
  }

  private buildDeltaChart(): void {
    if (!this.deltaCanvasRef) return;
    const ctx = this.deltaCanvasRef.nativeElement.getContext('2d')!;

    const deltaData = this.computeDelta();

    this.deltaChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.lapTelemetry?.distance ?? [],
        datasets: [{
          label: 'Delta vs Avg',
          data: deltaData,
          backgroundColor: deltaData.map(v =>
            v >= 0 ? 'rgba(240,98,146,0.5)' : 'rgba(102,187,106,0.5)'
          ),
          borderColor: deltaData.map(v =>
            v >= 0 ? 'rgba(240,98,146,0.8)' : 'rgba(102,187,106,0.8)'
          ),
          borderWidth: 0,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...CHART_OPTS.tooltip,
            callbacks: {
              title: items => `${items[0].label}m`,
              label: item => {
                const v = item.raw as number;
                return `${v > 0 ? '+' : ''}${v.toFixed(1)} km/h vs avg`;
              },
            },
          },
        },
        scales: {
          x: {
            ...CHART_OPTS.xScale,
            title: { display: true, text: 'Distance (m)', color: '#6D7680', font: { family: 'Inter', size: 9 } },
          },
          y: {
            ...CHART_OPTS.yScale,
            title: { display: false },
          },
        },
      } as ChartConfiguration['options'],
    });
  }

  private computeDelta(): number[] {
    if (!this.lapTelemetry || !this.avgTelemetry) return [];
    return this.lapTelemetry.speed.map((s, i) =>
      +(s - (this.avgTelemetry!.speed[i] ?? s)).toFixed(1)
    );
  }
}
