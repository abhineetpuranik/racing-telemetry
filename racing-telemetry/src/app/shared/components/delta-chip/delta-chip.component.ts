import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delta-chip',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delta-chip.component.html',
  styleUrl: './delta-chip.component.scss',
})
export class DeltaChipComponent {
  /** Delta in milliseconds. Negative = faster (green), positive = slower (red). */
  @Input() delta = 0;

  get colorClass(): string {
    if (this.delta === 0) return 'delta-chip--neutral';
    if (this.delta < 0) return Math.abs(this.delta) <= 100 ? 'delta-chip--yellow' : 'delta-chip--green';
    return Math.abs(this.delta) <= 100 ? 'delta-chip--yellow' : 'delta-chip--red';
  }

  get formatted(): string {
    const sign = this.delta <= 0 ? '' : '+';
    return `${sign}${(this.delta / 1000).toFixed(3)}`;
  }
}
