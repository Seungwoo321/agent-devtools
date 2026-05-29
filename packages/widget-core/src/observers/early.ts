/**
 * Ultra-early boot error trap.
 *
 * The widget observer starts up inside `mountAgentDevtools`, which only runs
 * after the host app's module bundle has loaded enough for the bootstrap
 * script to import widget-core. Anything that throws BEFORE that point — a
 * `<script type="module">` that fails to parse, a top-level await that
 * rejects during initial module evaluation, a synchronous render that throws
 * during the host's first `createRoot()` — would never reach the observer
 * and the devtool would see a blank white screen with no captured evidence.
 *
 * The fix is a tiny classic `<script>` (NOT `type="module"`, so it executes
 * synchronously in document order) injected by every bundler integration
 * before its module bootstrap. The script installs capture-phase
 * `error` / `unhandledrejection` listeners and pushes records into a
 * bounded array exposed on the window under {@link EARLY_ERRORS_GLOBAL}.
 *
 * When the observer eventually starts, it calls {@link drainEarlyErrors}
 * to dispose the trap, copy buffered records into its own ring buffer, and
 * mark the global drained so a second observer (which shouldn't happen,
 * but is defended against) finds nothing left to ingest.
 *
 * Contract shared with bundler plugins:
 *
 *   - The window key is {@link EARLY_ERRORS_GLOBAL}; do not invent
 *     alternates per bundler — drift here would silently leak boot errors.
 *   - The plugin must inject the script returned by
 *     {@link buildEarlyErrorTrapScript} as a CLASSIC script (no `type` or
 *     `type="text/javascript"`) and BEFORE the module bootstrap.
 *   - The script is idempotent: a second include is a no-op.
 *
 * Layer 3 redaction does NOT happen here — that runs at the observer's
 * single push choke point so all sources (early trap, sub-observers,
 * widget-internal guard) share one masking path.
 */
import type { ErrorRecord } from './types.js';

/** Window-global key shared between {@link buildEarlyErrorTrapScript} and {@link drainEarlyErrors}. */
export const EARLY_ERRORS_GLOBAL = '__AGENT_DEVTOOLS_EARLY_ERRORS__';

/** Hard cap on early-buffer growth so a boot loop can't OOM the page. */
const EARLY_CAPACITY = 100;

interface EarlyGlobal {
  records?: unknown;
  dispose?: unknown;
}

interface EarlyRaw {
  kind?: unknown;
  timestamp?: unknown;
  message?: unknown;
  stack?: unknown;
}

/**
 * Build the classic-script source. Returned as a plain string so bundler
 * integrations can drop it inline (e.g. Vite's `HtmlTagDescriptor.children`).
 * Keep this self-contained — no imports, no ES2020-only syntax — so it runs
 * in the same target as the host's classic-script context.
 */
export function buildEarlyErrorTrapScript(): string {
  // The inlined source references EARLY_ERRORS_GLOBAL / EARLY_CAPACITY by
  // value so the constants stay single-source even across the
  // module → string boundary.
  return [
    '(function(){',
    `var KEY=${JSON.stringify(EARLY_ERRORS_GLOBAL)};`,
    `var MAX=${EARLY_CAPACITY};`,
    'if (typeof window === "undefined" || window[KEY]) return;',
    'var records=[];',
    'function safePush(record){',
    '  if (records.length >= MAX) records.shift();',
    '  records.push(record);',
    '}',
    'function onError(e){',
    '  try {',
    '    var msg = (e && typeof e.message === "string" && e.message) || "window error";',
    '    var stack = e && e.error && typeof e.error.stack === "string" ? e.error.stack : undefined;',
    '    safePush({ kind: "window-error", timestamp: Date.now(), message: msg, stack: stack });',
    '  } catch (_) { /* trap must not throw */ }',
    '}',
    'function onRejection(e){',
    '  try {',
    '    var r = e ? e.reason : undefined;',
    '    var message; var stack;',
    '    if (r && typeof r === "object" && typeof r.message === "string") {',
    '      var name = typeof r.name === "string" ? r.name : "Error";',
    '      message = name + ": " + r.message;',
    '      if (typeof r.stack === "string") stack = r.stack;',
    '    } else if (typeof r === "string") {',
    '      message = r;',
    '    } else if (r === null || r === undefined) {',
    '      message = "unhandled rejection (no reason)";',
    '    } else {',
    '      try { message = JSON.stringify(r); } catch (_) { message = String(r); }',
    '      if (message === undefined) message = String(r);',
    '    }',
    '    safePush({ kind: "unhandled-rejection", timestamp: Date.now(), message: message, stack: stack });',
    '  } catch (_) {}',
    '}',
    'window.addEventListener("error", onError, true);',
    'window.addEventListener("unhandledrejection", onRejection, true);',
    'window[KEY] = {',
    '  records: records,',
    '  dispose: function(){',
    '    window.removeEventListener("error", onError, true);',
    '    window.removeEventListener("unhandledrejection", onRejection, true);',
    '  }',
    '};',
    '})();',
  ].join('\n');
}

/**
 * Dispose the early trap's listeners and copy any buffered records into the
 * observer via `ingest`. Idempotent — a second call finds the global already
 * drained and does nothing. Tolerant of a missing or malformed global so a
 * page that loaded without the trap (older bundler, opt-out path) doesn't
 * blow up the observer's start sequence.
 */
export function drainEarlyErrors(ingest: (record: ErrorRecord) => void, win: unknown): void {
  if (!win || typeof win !== 'object') return;
  const slot = (win as Record<string, unknown>)[EARLY_ERRORS_GLOBAL] as EarlyGlobal | undefined;
  if (!slot || typeof slot !== 'object') return;
  if (typeof slot.dispose === 'function') {
    try {
      (slot.dispose as () => void)();
    } catch {
      // dispose failure is harmless — listeners may already be gone.
    }
  }
  const records = Array.isArray(slot.records) ? (slot.records as EarlyRaw[]) : [];
  // Reset BEFORE ingest so a re-entrant ingest call (a subscriber that
  // somehow triggers another drain) finds nothing left to copy.
  slot.records = [];
  slot.dispose = (): void => undefined;
  for (const raw of records) {
    const normalized = normalizeEarly(raw);
    if (normalized) ingest(normalized);
  }
}

function normalizeEarly(raw: EarlyRaw): ErrorRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'window-error' || raw.kind === 'unhandled-rejection' ? raw.kind : null;
  if (!kind) return null;
  const message = typeof raw.message === 'string' ? raw.message : 'early error';
  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();
  const out: ErrorRecord = { kind, timestamp, message };
  if (typeof raw.stack === 'string' && raw.stack.length > 0) out.stack = raw.stack;
  return out;
}
