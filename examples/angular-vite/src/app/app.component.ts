import { Component } from '@angular/core';
import { CounterComponent } from './counter.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CounterComponent],
  template: `
    <main class="page">
      <h1>{{ greeting }}</h1>
      <p>
        Standalone Angular host that loads the floating widget through
        <code>&#64;agent-devtools/angular</code>. Open the launcher in the bottom-right corner, pick
        the counter button, and the picker should resolve to <code>CounterComponent</code>.
      </p>
      <app-counter />
    </main>
  `,
  styles: [
    `
      .page {
        font-family:
          system-ui,
          -apple-system,
          'Segoe UI',
          sans-serif;
        max-width: 36rem;
        margin: 3rem auto;
        padding: 0 1.25rem;
        line-height: 1.5;
      }
      h1 {
        margin-bottom: 0.5rem;
      }
    `,
  ],
})
export class AppComponent {
  greeting = 'agent-devtools Angular smoke';
}
