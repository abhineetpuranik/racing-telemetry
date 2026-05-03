import { Injectable, signal, effect, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'f1-theme';

  theme = signal<Theme>('dark');

  constructor(@Inject(PLATFORM_ID) private platformId: object) {
    if (!isPlatformBrowser(this.platformId)) return;

    // Restore saved preference
    const saved = localStorage.getItem(this.STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') {
      this.theme.set(saved);
    }

    // Apply theme attribute to <html> whenever signal changes
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem(this.STORAGE_KEY, t);
    });
  }

  toggle(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }
}
