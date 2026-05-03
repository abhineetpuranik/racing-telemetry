import { Directive, Input, OnChanges, ElementRef, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appValueFlash]',
  standalone: true,
})
export class ValueFlashDirective implements OnChanges {
  @Input('appValueFlash') value: unknown;

  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.renderer.addClass(this.el.nativeElement, 'value-flash');
    this.timeout = setTimeout(() => {
      this.renderer.removeClass(this.el.nativeElement, 'value-flash');
    }, 400);
  }
}
