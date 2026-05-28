/**
 * Top-level wiring for the widget. The Vite plugin injects a script that
 * imports `mountAgentDevtools` and calls it after the host app has booted.
 *
 * Responsibilities:
 *   1. Build the shadow-root container (style isolation).
 *   2. Drop in the launcher; clicks toggle the composer.
 *   3. Open the composer panel with an embedded stream view.
 *   4. Stand up the picker so the composer's "Pick" button can capture an
 *      element + populate the picked-element chip.
 *   5. Forward composer submissions through `buildPageContext` →
 *      optional `enrichPageContext` (related-imports + source-slice from
 *      the dev server's module graph) → `transport.send`, which POSTs to
 *      `/v1/agent/stream` and streams events back into the message store.
 *      When no transport is configured the orchestrator surfaces a clear
 *      error item in the conversation so the failure mode is obvious in
 *      tests and ad-hoc harness embeds.
 *
 * The pieces are deliberately decoupled (each `create*` factory owns its
 * own DOM + listeners and returns a `destroy`) so this file is just glue.
 */
import {
  createComposer,
  type ComposerHandle,
  type ComposerSubmitPayload,
} from '../composer/index.js';
import { buildPageContext } from '../context/index.js';
import { describePicked } from '../context/picked.js';
import type { PageContext, PageFileEntry, PickedEvidence } from '../context/types.js';
import {
  createHandoffModal,
  type HandoffModalHandle,
  type HandoffRequester,
  type HandoffTurn,
} from '../handoff/index.js';
import { createErrorObserver, type ErrorObserverHandle } from '../observers/index.js';
import { createPicker, type Picker } from '../picker/index.js';
import {
  createAnimationFrameScheduler,
  createMessageStore,
  createStreamRenderer,
  type MessageItem,
  type MessageStore,
  type StreamRendererHandle,
} from '../stream/index.js';
import { createLauncher, type LauncherHandle } from '../launcher/index.js';
import {
  createSettingsPanel,
  createSettingsStore,
  type AgentServerInfo,
  type SettingsPanelHandle,
  type SettingsStore,
} from '../settings/index.js';
import { createShadowWidgetRoot, THEME_ATTR, type ShadowWidgetRoot } from '../widget/index.js';
import {
  loadPanelOpen,
  loadWidgetVisible,
  savePanelOpen,
  saveWidgetVisible,
} from './visibility-storage.js';

export interface TransportPayload {
  readonly text: string;
  readonly picked: PickedEvidence | null;
  readonly pageContext: PageContext;
  readonly store: MessageStore;
  readonly signal: AbortSignal;
}

export interface AgentDevtoolsTransport {
  /**
   * Send a user prompt + page context to the agent and stream events back
   * into the provided store. Implementations call `store.applyEvent(...)`
   * for each parsed `StreamEvent` and resolve when the stream ends.
   */
  send(payload: TransportPayload): Promise<void>;
  /**
   * Mint a fresh `clientSessionId` so the next `send()` opens a brand-new
   * server-side ACP session — the agent forgets prior turns. Called by
   * the orchestrator's "new conversation" handler in tandem with
   * `store.clear()`. Optional so non-default transports (handoff-only
   * harnesses, test doubles) can omit it; the orchestrator falls back to
   * a no-op when missing.
   */
  resetSession?(): void;
  /**
   * Read the live tab-scoped `clientSessionId` (the same id the
   * transport sends on every `send`). The handoff path reads this so
   * the server can look up a matching ACP session id and surface
   * `claude --resume <id>` as a second continuation option. Optional
   * for the same reason `resetSession` is.
   */
  getClientSessionId?(): string | undefined;
}

export interface MountAgentDevtoolsOptions {
  /** Document to mount into. Defaults to `globalThis.document`. */
  document?: Document;
  /**
   * The DOM container React mounted into (passed to `createRoot`). Used to
   * find the root fiber for page-context collection.
   */
  rootContainer?: Element | null;
  /** Transport adapter (POSTs to the dev server). MVP runs without one. */
  transport?: AgentDevtoolsTransport;
  /**
   * Bypass the production-build guard. Defaults to `false`. The widget is
   * dev-only by design — Vite replaces `process.env.NODE_ENV` with
   * `'production'` at build time, which trips a runtime refusal so a
   * widget that accidentally ships in a production bundle stays dormant.
   * Set this to `true` only for explicit staging/preview deployments
   * where you have deliberately enabled the widget out-of-environment.
   */
  force?: boolean;
  /**
   * Use an open shadow root for the widget host. Defaults to `false`
   * (closed). Closed mode prevents page scripts from reaching into the
   * widget's internal DOM, which is the desired default. Set this to
   * `true` only when a controlled caller — typically a Playwright-driven
   * E2E run — needs to query and drive the widget UI through the host's
   * `shadowRoot` property.
   */
  shadowOpen?: boolean;
  /**
   * Reactive settings store shared with the transport. When omitted, the
   * widget creates one internally — fine for standalone callers, but the
   * Vite plugin's bootstrap injects its own pre-wired store so the same
   * store reference can power both this panel AND the transport's
   * `getSettings` callback. Without that shared reference the panel
   * mutates would not reach the transport.
   */
  settingsStore?: SettingsStore;
  /**
   * Async server snapshot fetcher (`/v1/agent/info`). Called once after
   * mount; the result hydrates the settings panel's workspace root and
   * disables provider radios that aren't registered. Returns `null` on
   * any failure so the widget stays usable while the dev server boots.
   */
  getServerInfo?: () => Promise<AgentServerInfo | null>;
  /**
   * POSTs the in-memory conversation + page context to
   * `/v1/agent/handoff` and resolves with `{ file, command }`. When set,
   * the composer's "Continue in terminal" button opens a modal showing
   * the resulting `claude --append-system-prompt-file …` command. When
   * omitted, the button still appears but clicking it surfaces a "not
   * configured" error so the UX failure mode is obvious instead of
   * silent.
   */
  requestHandoff?: HandoffRequester;
  /**
   * Framework-specific element → PickedEvidence resolver. When omitted,
   * the DOM-only fallback (`describePicked` from `@agent-devtools/widget-core/context`)
   * is used — same shape, just without `componentName` / `componentChain` /
   * `source` / `propsSnapshot` populated from a framework graph. Adapter
   * wrappers (`@agent-devtools/react`, `@agent-devtools/vue`, ...) inject
   * their own framework-aware walker.
   */
  describePicked?: (element: Element) => PickedEvidence;
  /**
   * Framework-specific page-file collector. Adapter wrappers inject a
   * walker that produces a deduped list of source files seen in the
   * rendered component tree, anchored at `rootContainer`. When omitted,
   * `pageContext.pageFiles` comes back empty — the agent simply has
   * fewer files to grep, not a malformed context.
   */
  collectPageFiles?: (rootContainer: Element | null) => readonly PageFileEntry[];
  /**
   * Framework-specific route-file resolver. Adapter wrappers (Next Pages
   * Router, Nuxt) hook this to their router and return the workspace-
   * relative file path that defined the current route (e.g.
   * `pages/blog/[slug].tsx`). When omitted, `route.routeFile` is absent
   * — the agent still has `pathname` to work from, just without the
   * shortcut to the route's source file.
   */
  resolveRouteFile?: (pathname: string) => string | undefined;
  /**
   * Async hook called after `buildPageContext` and before the transport
   * sends. The Vite plugin wires this to a `createPageContextEnricher`
   * that asks the dev server's module graph for the imports of
   * `picked.source.fileName` and merges the result into
   * `pageContext.picked.relatedImports`. The orchestrator swallows
   * rejections and aborts so enrichment can never block a send — the
   * agent gets the unenriched page context instead.
   */
  enrichPageContext?: (pageContext: PageContext, signal: AbortSignal) => Promise<PageContext>;
  /**
   * Whether the widget (launcher + composer) is visible on first mount.
   * Defaults to `true`. Set to `false` to ship the widget hidden until a
   * developer triggers the toggle hotkey — useful for dev environments
   * where non-frontend operators (backend engineers debugging, QA) load
   * the page and shouldn't see the floating launcher by default.
   *
   * The Vite plugin exposes this as `defaultVisible` so it can be set
   * declaratively in `vite.config`.
   */
  defaultVisible?: boolean;
  /**
   * Disable the keyboard toggle (Ctrl/Cmd + Shift + ;) that flips widget
   * visibility. Defaults to `false`. Set to `true` to remove the
   * keydown listener entirely — pair this with `defaultVisible: false`
   * for hosts that must never surface the widget without code-level
   * intervention.
   */
  disableToggleHotkey?: boolean;
}

const PRODUCTION_REFUSAL_MESSAGE =
  'agent-devtools: refusing to mount in a production build. ' +
  'This widget is dev-only. If you really mean it, pass { force: true } ' +
  '— or (recommended) gate the import behind `if (import.meta.env.DEV)`.';

export interface AgentDevtoolsHandle {
  readonly widget: ShadowWidgetRoot;
  readonly launcher: LauncherHandle;
  readonly composer: ComposerHandle;
  readonly streamRenderer: StreamRendererHandle;
  readonly settingsPanel: SettingsPanelHandle;
  readonly settingsStore: SettingsStore;
  readonly handoffModal: HandoffModalHandle;
  readonly store: MessageStore;
  readonly observer: ErrorObserverHandle;
  readonly picker: Picker;
  destroy(): void;
}

const NO_TRANSPORT_MESSAGE =
  'Agent server not configured. Wire `transport` into mountAgentDevtools().';

export function mountAgentDevtools(options: MountAgentDevtoolsOptions = {}): AgentDevtoolsHandle {
  if (!options.force && isProductionBuild()) {
    throw new Error(PRODUCTION_REFUSAL_MESSAGE);
  }
  const doc = options.document ?? globalThis.document;
  if (!doc) throw new Error('mountAgentDevtools: no document available');
  const resolvePicked = options.describePicked ?? describePicked;

  const widget = createShadowWidgetRoot({
    document: doc,
    ...(options.shadowOpen === true && { openMode: true }),
  });
  const store = createMessageStore();

  let pickedElement: Element | null = null;
  let inflight: AbortController | null = null;
  let destroyed = false;

  const settingsStore = options.settingsStore ?? createSettingsStore();
  let settingsVisible = false;

  // Drive the widget colour scheme off a single `data-theme` attribute on the
  // shadow host. Every component reads `var(--adt-*)` tokens defined per theme
  // in the shadow root, so flipping this one attribute recolours the whole
  // widget without re-rendering any component. `auto` defers to the host OS
  // `prefers-color-scheme` via the media query in the base styles.
  widget.host.setAttribute(THEME_ATTR, settingsStore.get().theme);
  let lastTheme = settingsStore.get().theme;
  const unsubscribeTheme = settingsStore.subscribe((settings) => {
    if (settings.theme === lastTheme) return;
    lastTheme = settings.theme;
    widget.host.setAttribute(THEME_ATTR, settings.theme);
  });

  // Restore the user's last open/closed choice so a refresh re-opens the
  // panel they left open. Nothing persisted yet → start closed (the
  // composer's own default).
  const persistedPanelOpen = loadPanelOpen() ?? false;

  const composer = createComposer({
    container: widget.container,
    document: doc,
    visible: persistedPanelOpen,
    onSubmit: handleSubmit,
    onTogglePicker: handleTogglePicker,
    onToggleSettings: () => toggleSettings(!settingsVisible),
    onClearPicked: handleClearPicked,
    onClose: handleClose,
    onHandoff: handleHandoff,
    onNewSession: handleNewSession,
    // Seed the toggle from the canonical store value so the very first
    // render matches whatever the orchestrator handed us (typically the
    // mount-default `true`, but tests can preload another value).
    safeMode: settingsStore.get().safeMode,
    onToggleSafeMode: (next): void => {
      // Composer already painted the local mirror — push the value into
      // the store so the transport and any other store subscriber see it
      // on the very next read.
      settingsStore.set({ safeMode: next });
    },
  });
  // External mutations to the store (e.g. an upcoming settings-panel
  // surface) must propagate back to the composer's visible affordance.
  // Compare against the last value so we skip no-op repaints.
  let lastSafeMode = settingsStore.get().safeMode;
  const unsubscribeSafeMode = settingsStore.subscribe((settings) => {
    if (settings.safeMode === lastSafeMode) return;
    lastSafeMode = settings.safeMode;
    composer.setSafeMode(settings.safeMode);
  });
  // Insert the stream renderer above the textarea so the conversation
  // scrolls in the panel while the composer's input sticks to the bottom.
  const textarea = composer.element.querySelector('textarea');
  const streamRenderer = createStreamRenderer({
    container: composer.element,
    document: doc,
    store,
    // Stream assistant text into the bubble at a steady cadence so bursty
    // server-side buffering doesn't translate into visibly lumpy reveal.
    // Falls back to instant rendering in environments without rAF (SSR,
    // certain test harnesses).
    frameScheduler: createAnimationFrameScheduler(),
  });
  if (textarea && textarea.parentElement === composer.element) {
    composer.element.insertBefore(streamRenderer.element, textarea);
  }

  // Settings panel sits in the same slot as the stream view (overlays it
  // via `position: absolute; inset: 0`). Inserted BEFORE the stream
  // renderer so that the stream renderer's `nextSibling` remains the
  // textarea — a stable invariant some orchestration tests rely on.
  const settingsPanel = createSettingsPanel({
    container: composer.element,
    document: doc,
    store: settingsStore,
    onClose: () => toggleSettings(false),
  });
  if (streamRenderer.element.parentElement === composer.element) {
    composer.element.insertBefore(settingsPanel.element, streamRenderer.element);
  }
  // Hydrate the panel asynchronously — if the server takes a moment to
  // come up, the widget stays usable and the panel just shows "(not
  // configured)" until the fetch resolves.
  if (options.getServerInfo) {
    void options
      .getServerInfo()
      .then((info) => {
        if (destroyed) return;
        settingsPanel.setServerInfo(info);
      })
      .catch(() => undefined);
  }

  // Handoff modal lives in the same shadow root so its styles are isolated
  // from the host app and its keydown listener cleans up with the widget.
  let handoffController: AbortController | null = null;
  const handoffModal = createHandoffModal({
    container: widget.container,
    document: doc,
    onClose: () => {
      handoffController?.abort();
      handoffController = null;
    },
  });

  const observer = createErrorObserver();
  observer.start();

  const picker = createPicker({
    document: doc,
    onPick(element): void {
      pickedElement = element;
      composer.setPicked(resolvePicked(element));
      composer.setPickerActive(false);
      composer.setVisible(true);
      // Picking lands the user in an open panel — persist that as their
      // open/closed choice so a refresh keeps it open.
      savePanelOpen(true);
      streamRenderer.scrollToBottom();
      composer.focus();
    },
    onCancel(): void {
      composer.setPickerActive(false);
    },
  });

  const launcher = createLauncher({
    container: widget.container,
    document: doc,
    onClick(): void {
      const willOpen = composer.element.style.display === 'none';
      composer.setVisible(willOpen);
      // The launcher click is the canonical user-driven open/close toggle —
      // persist it so the panel reopens (or stays closed) after a refresh.
      savePanelOpen(willOpen);
      if (willOpen) {
        // The list does not retain scrollTop while `display: none` because
        // the browser does not lay it out. Re-anchor to the latest turn
        // after the panel becomes visible so the user lands on the most
        // recent message instead of the first.
        streamRenderer.scrollToBottom();
        composer.focus();
      }
    },
    onPositionChange(position): void {
      // Keep the chat panel glued to the launcher: same right-edge, sitting
      // above the button. The composer's `setAnchor` handles viewport
      // clamping so a launcher dragged near the top of the page doesn't
      // strand the panel off-screen.
      composer.setAnchor({ x: position.x, y: position.y });
    },
  });

  async function handleSubmit(payload: ComposerSubmitPayload): Promise<void> {
    const text = payload.text.trim();
    if (!text) return;
    composer.setText('');
    store.appendUserMessage(text, payload.picked ?? undefined);

    if (!options.transport) {
      store.applyEvent({ type: 'error', message: NO_TRANSPORT_MESSAGE });
      return;
    }

    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    composer.setSending(true);

    try {
      const baseContext = buildPageContext({
        document: doc,
        rootContainer: options.rootContainer ?? null,
        pickedElement,
        errors: observer.getRecords(),
        describePicked: resolvePicked,
        ...(options.collectPageFiles && { collectPageFiles: options.collectPageFiles }),
        ...(options.resolveRouteFile && { resolveRouteFile: options.resolveRouteFile }),
      });
      const pageContext = await maybeEnrichPageContext(
        baseContext,
        controller.signal,
        options.enrichPageContext,
      );
      if (controller.signal.aborted) return;
      await options.transport.send({
        text,
        picked: pageContext.picked ?? payload.picked,
        pageContext,
        store,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      store.applyEvent({ type: 'error', message });
    } finally {
      if (inflight === controller) inflight = null;
      composer.setSending(false);
    }
  }

  function handleTogglePicker(next: boolean): void {
    composer.setPickerActive(next);
    if (next) {
      composer.setVisible(false);
      picker.start();
    } else {
      picker.cancel();
    }
  }

  function handleClearPicked(): void {
    pickedElement = null;
    composer.setPicked(null);
  }

  function handleClose(): void {
    composer.setVisible(false);
    // Escape / close button are user-driven closes — remember them.
    savePanelOpen(false);
  }

  function handleNewSession(): void {
    // Abort any in-flight stream so its trailing chunks don't land in
    // the just-cleared store. The catch on the inflight promise will
    // observe `signal.aborted` and drop the chunks silently.
    inflight?.abort();
    inflight = null;
    composer.setSending(false);
    composer.setText('');
    handleClearPicked();
    store.clear();
    // Mint a fresh `clientSessionId` so the very next prompt opens a new
    // server-side ACP session. Without this the client would keep the
    // same session id and the server would happily resume the agent's
    // prior context — silently undoing the visible "new chat".
    options.transport?.resetSession?.();
  }

  function toggleSettings(next: boolean): void {
    settingsVisible = next;
    composer.setSettingsActive(next);
    settingsPanel.setVisible(next);
    // Stream view and settings share the same slot; only one is visible
    // at a time. The stream renderer's own root applies `display: flex`,
    // so restore to the same value rather than '' (which would leave the
    // element collapsed in environments without the host stylesheet).
    streamRenderer.element.style.display = next ? 'none' : 'flex';
  }

  async function handleHandoff(): Promise<void> {
    handoffController?.abort();
    if (!options.requestHandoff) {
      handoffModal.showError(NO_HANDOFF_MESSAGE);
      return;
    }
    const conversation = collectHandoffConversation(store.getItems());
    const controller = new AbortController();
    handoffController = controller;
    handoffModal.showLoading();
    try {
      const baseContext = buildPageContext({
        document: doc,
        rootContainer: options.rootContainer ?? null,
        pickedElement,
        errors: observer.getRecords(),
        describePicked: resolvePicked,
        ...(options.collectPageFiles && { collectPageFiles: options.collectPageFiles }),
        ...(options.resolveRouteFile && { resolveRouteFile: options.resolveRouteFile }),
      });
      const pageContext = await maybeEnrichPageContext(
        baseContext,
        controller.signal,
        options.enrichPageContext,
      );
      if (controller.signal.aborted) return;
      const clientSessionId = options.transport?.getClientSessionId?.();
      const result = await options.requestHandoff({
        conversation,
        picked: pageContext.picked ?? (pickedElement ? resolvePicked(pickedElement) : null),
        pageContext,
        permissionMode: settingsStore.get().permissionMode,
        signal: controller.signal,
        ...(clientSessionId !== undefined && clientSessionId.length > 0 && { clientSessionId }),
      });
      if (controller.signal.aborted) return;
      handoffModal.showReady(result);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      handoffModal.showError(message);
    } finally {
      if (handoffController === controller) handoffController = null;
    }
  }

  // ── Widget-level visibility (launcher + composer combined) ──────────
  //
  // The orchestrator owns the "is the widget surface visible at all"
  // axis. The launcher controls only its own button; the composer
  // already has its panel-level `setVisible`. We coordinate the two so
  // operators can toggle the entire devtools surface with one hotkey
  // — and so `defaultVisible: false` ships a fully dormant widget for
  // dev environments where non-frontend users load the page.
  //
  // A persisted choice (from a prior hotkey toggle) wins over
  // `defaultVisible`, which is only the seed for a first-ever visit.
  let widgetVisible = loadWidgetVisible() ?? options.defaultVisible ?? true;
  if (!widgetVisible) {
    launcher.setVisible(false);
    // Collapse the composer's DOM without touching the persisted panel-open
    // choice — this is a system-driven hide, not the user closing the panel.
    composer.setVisible(false);
  }

  function setWidgetVisible(next: boolean): void {
    if (widgetVisible === next) return;
    widgetVisible = next;
    // The hotkey toggle is user-driven — remember it across reloads.
    saveWidgetVisible(next);
    launcher.setVisible(next);
    if (!next) {
      // Going dark: collapse the composer and abort any picker so the
      // widget surface leaves no overlay behind. The composer's DOM hides
      // but the persisted panel-open choice is left intact (system-driven
      // collapse), so a later refresh with the widget shown can still
      // restore the panel. Keep the message store intact too — toggling
      // visibility is not "new session".
      composer.setVisible(false);
      picker.cancel();
    }
  }

  const handleToggleKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    if (!(event.metaKey || event.ctrlKey)) return;
    if (!event.shiftKey) return;
    // `event.code` is layout-stable; `event.key` covers older browsers and
    // the IME case where the shifted ';' arrives as ':'.
    const isSemicolon = event.code === 'Semicolon' || event.key === ';' || event.key === ':';
    if (!isSemicolon) return;
    event.preventDefault();
    setWidgetVisible(!widgetVisible);
  };
  const hotkeyEnabled = options.disableToggleHotkey !== true;
  if (hotkeyEnabled) {
    doc.addEventListener('keydown', handleToggleKeydown);
  }

  return {
    widget,
    launcher,
    composer,
    streamRenderer,
    settingsPanel,
    settingsStore,
    handoffModal,
    store,
    observer,
    picker,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (hotkeyEnabled) {
        doc.removeEventListener('keydown', handleToggleKeydown);
      }
      inflight?.abort();
      handoffController?.abort();
      unsubscribeSafeMode();
      unsubscribeTheme();
      picker.stop();
      observer.stop();
      handoffModal.destroy();
      settingsPanel.destroy();
      streamRenderer.destroy();
      composer.destroy();
      launcher.destroy();
      widget.destroy();
    },
  };
}

const NO_HANDOFF_MESSAGE =
  'Terminal handoff is not configured. Run the agent-devtools dev server (Vite plugin) to enable this button.';

/**
 * Filter the message store down to the user / assistant text turns the
 * server expects on `POST /v1/agent/handoff`. Tool-use, tool-result, and
 * error items are skipped — they make the handoff markdown noisy and
 * aren't useful as additional system context for the resumed terminal
 * session. Streaming assistant text items are included as-is; if the user
 * hits the handoff button mid-stream, they get the partial text rather
 * than waiting for `text-stop`.
 */
function collectHandoffConversation(items: readonly MessageItem[]): HandoffTurn[] {
  const turns: HandoffTurn[] = [];
  for (const item of items) {
    if (item.kind === 'user') {
      turns.push({ role: 'user', text: item.text });
    } else if (item.kind === 'assistant-text') {
      turns.push({ role: 'assistant', text: item.text });
    }
  }
  return turns;
}

/**
 * Run the adapter-supplied `enrichPageContext` hook and return its result.
 * Swallows any rejection and any post-abort result so enrichment can
 * never block the surrounding send — the caller gets the unenriched
 * `baseContext` instead and the orchestrator continues with the rest of
 * the flow. `signal.aborted` short-circuits before calling the hook at
 * all so an abort during `buildPageContext` skips enrichment entirely.
 */
async function maybeEnrichPageContext(
  baseContext: PageContext,
  signal: AbortSignal,
  enrich: MountAgentDevtoolsOptions['enrichPageContext'],
): Promise<PageContext> {
  if (!enrich || signal.aborted) return baseContext;
  try {
    const enriched = await enrich(baseContext, signal);
    if (signal.aborted) return baseContext;
    return enriched;
  } catch {
    return baseContext;
  }
}

/**
 * Detect a production-mode build. Vite (and most bundlers) statically
 * replace `process.env.NODE_ENV` at build time, so this read folds into a
 * literal `'production'`/`'development'`/`undefined` comparison in the
 * shipped bundle — the function body itself is a few bytes after DCE.
 *
 * In a pure Node environment (SSR, tests) `process.env.NODE_ENV` is read
 * at runtime. We treat any non-'production' value (including unset) as
 * non-production so the widget keeps working in plain test runners.
 */
function isProductionBuild(): boolean {
  const proc =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      : undefined;
  const env = proc?.env?.NODE_ENV;
  return env === 'production';
}
