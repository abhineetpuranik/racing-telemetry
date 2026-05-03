import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Lap } from '../../../core/models/lap.model';

const COMPOUND_CONFIG: Record<Lap['compound'], { color: string; letter: string }> = {
  SOFT:         { color: '#e8003d', letter: 'S' },
  MEDIUM:       { color: '#e8b800', letter: 'M' },
  HARD:         { color: '#e0e0e8', letter: 'H' },
  INTERMEDIATE: { color: '#00e87a', letter: 'I' },
  WET:          { color: '#0066ff', letter: 'W' },
};

@Component({
  selector: 'app-tyre-badge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tyre-badge.component.html',
  styleUrl: './tyre-badge.component.scss',
})
export class TyreBadgeComponent {
  @Input() compound: Lap['compound'] = 'MEDIUM';
  @Input() age: number | null = null;

  get config() {
    return COMPOUND_CONFIG[this.compound] ?? COMPOUND_CONFIG['MEDIUM'];
  }
}
