import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValueFlashDirective } from '../../directives/value-flash.directive';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule, ValueFlashDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss',
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() delta: number | null = null;
  @Input() highlight = false;

  get deltaColorClass(): string {
    if (this.delta === null || this.delta === 0) return 'delta-chip--neutral';
    if (this.delta < 0) return Math.abs(this.delta) <= 100 ? 'delta-chip--yellow' : 'delta-chip--green';
    return Math.abs(this.delta) <= 100 ? 'delta-chip--yellow' : 'delta-chip--red';
  }

  get deltaFormatted(): string {
    if (this.delta === null) return '';
    const sign = this.delta <= 0 ? '' : '+';
    return `${sign}${(this.delta / 1000).toFixed(3)}`;
  }
}
