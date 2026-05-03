import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { Subscription, combineLatest } from 'rxjs';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { Driver } from '../../../core/models/driver.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';

Chart.register(...registerables);

function buildPositionHistory(
  drivers: Driver[],
  gapHistory: Record<string, number[]>,
  lapCount: number,
): Record<string, number[]> {
  const positions: Record<string, number[]> = {};
  for (const d of drivers) positions[d.driverCode] = [];

  for (let lap = 0; lap < lapCount; lap++) {
    const lapGaps = drivers
      .map(d => ({ code: d.driverCode, gap: gapHistory[d.driverCode]?.[lap] ?? Infinity }))
      .sort((a, b) => a.gap - b.gap);

    lapGaps.forEach((entry, idx) => {
      positions[entry.code].push(entry.gap === Infinity ? NaN : idx + 1);
    });
  }
  return positions;
}

@Component({
  selector: 'app-gap-chart',
  standalone: true,
  imports: [CommonModule, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gap-chart.component.html',
  styleUrl: './gap-chart.component.scss',
})
export class GapChartComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gapCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  isRace = true;
  panelLabel = 'Race Position Tracker';

  private chart: Chart | null = null;
  private drivers: Driver[] = [];
  private gapHistory: Record<string, number[]> = {};
  private viewReady = false;
  private dataReady = false;
  private sub!: Subscription;

  constructor(
    private svc: TelemetryService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    // combineLatest re-fires whenever either stream emits — handles session switches
    this.sub = combineLatest([
      this.svc.getDrivers(),
      this.svc.getGapHistory(),
    ]).subscribe(([drivers, gaps]) => {
      this.drivers    = drivers;
      this.gapHistory = gaps;

      const maxLaps = Math.max(...Object.values(gaps).map(a => a.length), 0);
      this.isRace   = maxLaps > 15;
      this.panelLabel = this.isRace ? 'Race Position Tracker' : 'Qualifying — Gap to Pole';

      this.dataReady = true;
      this.rebuildChart();
      this.cdr.markForCheck();
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (isPlatformBrowser(this.platformId) && this.dataReady) this.rebuildChart();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.chart?.destroy();
  }

  private rebuildChart(): void {
    if (!isPlatformBrowser(this.platformId) || !this.viewReady || !this.canvasRef || !this.dataReady) return;

    this.chart?.destroy();
    const ctx = this.canvasRef.nativeElement.getContext('2d')!;

    if (this.isRace) {
      this.buildBumpChart(ctx);
    } else {
      this.buildQualiBars(ctx);
    }
  }

  private buildBumpChart(ctx: CanvasRenderingContext2D): void {
    const lapCount  = Math.max(...Object.values(this.gapHistory).map(a => a.length), 1);
    const labels    = Array.from({ length: lapCount }, (_, i) => i + 1);
    const positions = buildPositionHistory(this.drivers, this.gapHistory, lapCount);

    const datasets = this.drivers.map(d => ({
      label:           d.driverCode,
      data:            positions[d.driverCode] ?? [],
      borderColor:     d.teamColor,
      backgroundColor: 'transparent',
      borderWidth:     1.5,
      pointRadius:     0,
      pointHoverRadius:4,
      tension:         0.2,
      spanGaps:        false,
    }));

    this.chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#6D7680',
              font: { family: 'Inter', size: 9 },
              boxWidth: 10,
              padding: 6,
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
              title: items => `Lap ${items[0].label}`,
              label: item => `P${item.raw}  ${item.dataset.label}`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: 1,
            max: lapCount,
            title: { display: true, text: 'Lap', color: '#6D7680', font: { family: 'Inter', size: 9 } },
            ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 12 },
            grid: { color: 'rgba(30,18,21,0.5)' },
            border: { color: '#2e1e24' },
          },
          y: {
            reverse: true,
            min: 1,
            max: this.drivers.length,
            title: { display: true, text: 'Position', color: '#6D7680', font: { family: 'Inter', size: 9 } },
            ticks: {
              color: '#6D7680',
              font: { family: 'JetBrains Mono', size: 9 },
              stepSize: 1,
              callback: val => `P${val}`,
            },
            grid: { color: 'rgba(30,18,21,0.5)' },
            border: { color: '#2e1e24' },
          },
        },
      } as ChartConfiguration['options'],
    });
  }

  private buildQualiBars(ctx: CanvasRenderingContext2D): void {
    const sorted = [...this.drivers]
      .map(d => {
        const gaps = this.gapHistory[d.driverCode] ?? [];
        const best = gaps.length ? Math.min(...gaps.filter(g => g >= 0)) : Infinity;
        return { driver: d, gap: best };
      })
      .filter(x => x.gap !== Infinity)
      .sort((a, b) => a.gap - b.gap);

    const leader = sorted[0]?.gap ?? 0;

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(x => x.driver.driverCode),
        datasets: [{
          label: 'Gap to pole (s)',
          data:  sorted.map(x => +(x.gap - leader).toFixed(3)),
          backgroundColor: sorted.map(x => x.driver.teamColor + 'cc'),
          borderColor:     sorted.map(x => x.driver.teamColor),
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0d0a0b',
            borderColor: '#2e1e24',
            borderWidth: 1,
            titleColor: '#6D7680',
            bodyColor: '#F3F9FB',
            titleFont: { family: 'Inter', size: 10 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            callbacks: {
              label: item => item.raw === 0 ? 'POLE' : `+${(item.raw as number).toFixed(3)}s`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Gap to pole (s)', color: '#6D7680', font: { family: 'Inter', size: 9 } },
            ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 9 } },
            grid: { color: 'rgba(30,18,21,0.5)' },
            border: { color: '#2e1e24' },
          },
          y: {
            ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 10, weight: 'bold' } },
            grid: { display: false },
            border: { color: '#2e1e24' },
          },
        },
      } as ChartConfiguration['options'],
    });
  }
}
