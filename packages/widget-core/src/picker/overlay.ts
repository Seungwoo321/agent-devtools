/**
 * Floating outline that follows the hovered element. Implemented as a single
 * absolutely-positioned div parented to <body>. We deliberately avoid Shadow
 * DOM here (that's the widget's concern, ADT-20); the picker overlay must
 * sit on the top compositing layer with `pointer-events: none` so clicks
 * fall through to the underlying target.
 *
 * The overlay does NOT participate in element measurement (pointer-events
 * none + position absolute keeps it out of `elementFromPoint` results). All
 * geometry comes from the target's `getBoundingClientRect`, offset by
 * scrollX/scrollY so the outline sticks to the document rather than the
 * viewport.
 */

const OUTLINE_ATTR = 'data-agent-devtools-picker-outline';

export interface OverlayHandle {
  /** Move the outline over the given element. Pass `null` to hide it. */
  show(target: Element | null): void;
  /** Detach the overlay from the document; safe to call multiple times. */
  destroy(): void;
}

export interface CreateOverlayOptions {
  /** Document to attach to. Defaults to `globalThis.document`. */
  document?: Document;
  /** Outline color (CSS color). Default: an opinionated agent-blue. */
  color?: string;
}

export function createOverlay(options: CreateOverlayOptions = {}): OverlayHandle {
  const doc = options.document ?? globalThis.document;
  const color = options.color ?? 'rgba(0, 122, 255, 0.9)';
  const el = doc.createElement('div');
  el.setAttribute(OUTLINE_ATTR, '');
  applyBaseStyles(el, color);
  doc.body.appendChild(el);

  let destroyed = false;

  return {
    show(target: Element | null): void {
      if (destroyed) return;
      if (!target) {
        el.style.display = 'none';
        return;
      }
      const rect = target.getBoundingClientRect();
      const scrollX = doc.defaultView?.scrollX ?? 0;
      const scrollY = doc.defaultView?.scrollY ?? 0;
      el.style.display = 'block';
      el.style.transform = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      el.remove();
    },
  };
}

function applyBaseStyles(el: HTMLElement, color: string): void {
  const s = el.style;
  s.position = 'absolute';
  s.top = '0';
  s.left = '0';
  s.pointerEvents = 'none';
  s.boxSizing = 'border-box';
  s.border = `2px solid ${color}`;
  s.borderRadius = '2px';
  s.zIndex = '2147483646';
  s.display = 'none';
  s.transition = 'transform 60ms linear, width 60ms linear, height 60ms linear';
}
