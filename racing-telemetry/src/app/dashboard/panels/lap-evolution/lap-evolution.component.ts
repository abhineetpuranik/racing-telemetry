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
import { Chart, ChartConfiguration, registerables, ScatterDataPoint } from 'chart.js';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { Lap } from '../../../core/models/lap.model';
import { Driver } from '../../../core/models/driver.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';

Chart.register(...registerables);

const COMPOUND_COLORS: Record<string, string> = {
  SOFT:         '#ef5350',
  MEDIUM:       '#ffa726',
  HARD:         '#9e9e9e',   // mid-grey — visible on both light and dark
  INTERMEDIATE: '#66bb6a',
  WET:          '#64b5f6',
};

function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
}

@Component({
  selector: 'app-lap-evolution',
  standalone: true,
  imports: [CommonModule, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lap-evolution.component.html',
  styleUrl: './lap-evolution.component.scss',
})
export class LapEvolutionComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() selectedDriver = 'VER';
  @ViewChild('lapCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private laps: Lap[] = [];
  private driver: Driver | null = null;
  private chart: Chart | null = null;

  constructor(
    private svc: TelemetryService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void { this.loadData(); }
  ngOnChanges(): void { this.loadData(); }
  ngAfterViewInit(): void { if (isPlatformBrowser(this.platformId)) this.buildChart(); }
  ngOnDestroy(): void { this.chart?.destroy(); }

  private loadData(): void {
    this.svc.getDriver(this.selectedDriver).subscribe(d => { this.driver = d ?? null; });
    this.svc.getLaps(this.selectedDriver).subscribe(laps => {
      // Filter out outlier laps (pit in/out, SC laps) — keep laps within 120% of best
      const validLaps = laps.filter(l => l.lapTime > 0);
      const bestTime  = validLaps.length ? Math.min(...validLaps.map(l => l.lapTime)) : 0;
      this.laps = bestTime > 0
        ? validLaps.filter(l => l.lapTime <= bestTime * 1.2)
        : validLaps;

      this.chart?.destroy();
      this.chart = null;
      if (isPlatformBrowser(this.platformId) && this.canvasRef) {
        this.buildChart();
      }
      this.cdr.markForCheck();
    });
  }

  private buildChart(): void {
    if (!this.canvasRef) return;
    const ctx = this.canvasRef.nativeElement.getContext('2d')!;

    // Group laps by compound for separate datasets
    const datasets = this.buildDatasets();

    this.chart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: this.buildOptions(),
    } as ChartConfiguration);
  }

  private buildDatasets() {
    const byCompound = new Map<string, Lap[]>();
    for (const lap of this.laps) {
      if (!byCompound.has(lap.compound)) byCompound.set(lap.compound, []);
      byCompound.get(lap.compound)!.push(lap);
    }

    const datasets: ChartConfiguration['data']['datasets'] = [];

    // Line connecting all laps in order
    datasets.push({
      label: 'Lap time',
      data: this.laps.map(l => ({ x: l.lapNumber, y: l.lapTime / 1000 })),
      type: 'line' as const,
      borderColor: 'rgba(240,98,146,0.3)',
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
      order: 2,
    } as any);

    // Compound-colored scatter points
    byCompound.forEach((laps, compound) => {
      datasets.push({
        label: compound,
        data: laps.map(l => ({ x: l.lapNumber, y: l.lapTime / 1000 })),
        backgroundColor: COMPOUND_COLORS[compound] ?? '#6D7680',
        borderColor: 'transparent',
        pointRadius: 5,
        pointHoverRadius: 7,
        order: 1,
      });
    });

    return datasets;
  }

  private updateChart(): void {
    if (!this.chart) return;
    this.chart.data.datasets = this.buildDatasets();
    this.chart.update('none');
  }

  private buildOptions(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#6D7680',
            font: { family: 'Inter', size: 9 },
            boxWidth: 8,
            padding: 10,
            filter: item => item.text !== 'Lap time',
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
            title: items => `Lap ${(items[0].raw as ScatterDataPoint).x}`,
            label: item => {
              const raw = item.raw as ScatterDataPoint;
              const y = raw.y ?? 0;
              return `${item.dataset.label}: ${formatMs(Math.round(y * 1000))}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Lap', color: '#6D7680', font: { family: 'Inter', size: 9 } },
          ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 20 },
          grid: { color: 'rgba(30,18,21,0.4)' },
          border: { color: '#2e1e24' },
        },
        y: {
          title: { display: true, text: 'Lap Time (s)', color: '#6D7680', font: { family: 'Inter', size: 9 } },
          ticks: {
            color: '#6D7680',
            font: { family: 'JetBrains Mono', size: 9 },
            callback: val => formatMs(Math.round((val as number) * 1000)),
          },
          grid: { display: false },
          border: { color: '#2e1e24' },
        },
      },
    };
  }
}
