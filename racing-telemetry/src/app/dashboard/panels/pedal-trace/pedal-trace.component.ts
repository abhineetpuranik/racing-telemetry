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
import { TelemetryService } from '../../../core/services/telemetry.service';
import { TelemetryFrame } from '../../../core/models/telemetry.model';
import { PanelComponent } from '../../../shared/components/panel/panel.component';

Chart.register(...registerables);

@Component({
  selector: 'app-pedal-trace',
  standalone: true,
  imports: [CommonModule, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pedal-trace.component.html',
  styleUrl: './pedal-trace.component.scss',
})
export class PedalTraceComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() selectedDriver = 'VER';
  @ViewChild('pedalCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private telemetry: TelemetryFrame | null = null;
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
            label: 'Throttle',
            data: this.telemetry?.throttle ?? [],
            borderColor: '#00e87a',
            backgroundColor: 'rgba(0,232,122,0.25)',
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.2,
            fill: true,
          },
          {
            label: 'Brake',
            data: this.telemetry?.brake ?? [],
            borderColor: '#e8003d',
            backgroundColor: 'rgba(232,0,61,0.25)',
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.2,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: '#6D7680', font: { family: 'Inter', size: 9 }, boxWidth: 10, padding: 8 },
          },
          tooltip: {
            backgroundColor: '#0d0a0b',
            borderColor: '#2e1e24',
            borderWidth: 1,
            titleColor: '#6D7680',
            bodyColor: '#F3F9FB',
            titleFont: { family: 'Inter', size: 10 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
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
            min: 0, max: 100,
            title: { display: true, text: '%', color: '#6D7680', font: { family: 'Inter', size: 9 } },
            ticks: { color: '#6D7680', font: { family: 'JetBrains Mono', size: 9 } },
            grid: { display: false },
            border: { color: '#2e1e24' },
          },
        },
      } as ChartConfiguration['options'],
    });
  }

  private updateChart(): void {
    if (!this.chart || !this.telemetry) return;
    this.chart.data.labels = this.telemetry.distance;
    this.chart.data.datasets[0].data = this.telemetry.throttle;
    this.chart.data.datasets[1].data = this.telemetry.brake;
    this.chart.update('none');
  }
}
