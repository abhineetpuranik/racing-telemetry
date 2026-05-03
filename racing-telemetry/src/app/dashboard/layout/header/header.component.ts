import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { ThemeService } from '../../../core/services/theme.service';
import { Session } from '../../../core/models/session.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit, OnDestroy {
  session: Session | null = null;
  currentTime = '';

  private sub!: Subscription;
  private clockInterval!: ReturnType<typeof setInterval>;

  constructor(
    public svc: TelemetryService,
    public theme: ThemeService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.sub = this.svc.getSession().subscribe(s => {
      this.session = s;
      this.cdr.markForCheck();
    });

    this.currentTime = this.getTime();
    this.clockInterval = setInterval(() => {
      this.currentTime = this.getTime();
      this.cdr.markForCheck();
    }, 1000);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    clearInterval(this.clockInterval);
  }

  get conditionsClass(): string {
    const map: Record<string, string> = {
      DRY:   'conditions--dry',
      WET:   'conditions--wet',
      MIXED: 'conditions--mixed',
    };
    return map[this.session?.conditions ?? ''] ?? 'conditions--dry';
  }

  private getTime(): string {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
  }
}
