import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-counter',
  standalone: true,
  template: `
    <section class="counter">
      <p>Count: {{ count() }}</p>
      <button type="button" (click)="increment()">Increment</button>
    </section>
  `,
  styles: [
    `
      .counter {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      button {
        padding: 0.4rem 0.9rem;
        border-radius: 6px;
        border: 1px solid #888;
        background: #fafafa;
        cursor: pointer;
      }
    `,
  ],
})
export class CounterComponent {
  count = signal(0);
  increment(): void {
    this.count.update((c) => c + 1);
  }
}
