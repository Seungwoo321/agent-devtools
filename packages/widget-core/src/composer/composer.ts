/**
 * Chat composer panel. Renders inside the shadow-root container next to the
 * launcher and emits `submit` payloads carrying the user's prompt plus the
 * currently-picked element descriptor.
 *
 * The composer is a controlled view: it doesn't own picker lifecycle, errors
 * or transport. The orchestrator (next units) feeds it `picked`,
 * `pickerActive`, `sending` and listens to `onSubmit` / `onTogglePicker`.
 * That keeps this file scoped to DOM and the panel's local state (text +
 * visibility), avoiding leakage from network or picker concerns.
 *
 * Keyboard contract:
 *   - Enter (without Shift) submits when text is non-empty and not sending.
 *   - Shift+Enter inserts a newline.
 *   - Escape clears focus and hides the panel.
 *
 * When the slash-command autocomplete menu is open (the textarea holds a
 * leading-slash prefix with at least one matching command), the menu intercepts
 * navigation keys BEFORE the submit/close branches and consumes them so they
 * never leak to the host page:
 *   - ArrowDown / ArrowUp move the highlight (wrap-around).
 *   - Enter or Tab confirm the highlighted command — inserting `"/name "` with
 *     the caret left at the end for arguments — and close the menu WITHOUT
 *     submitting.
 *   - Escape closes only the menu, leaving the panel open and the text intact.
 */
import type { PickedEvidence } from '../context/types.js';
import type { SlashCommandInfo } from '../stream/index.js';

const PANEL_ATTR = 'data-agent-devtools-composer';
const PICK_TOGGLE_ATTR = 'data-agent-devtools-composer-pick';
const SETTINGS_TOGGLE_ATTR = 'data-agent-devtools-composer-settings';
const HANDOFF_ATTR = 'data-agent-devtools-composer-handoff';
const NEW_SESSION_ATTR = 'data-agent-devtools-composer-new-session';
const SAFE_MODE_ATTR = 'data-agent-devtools-composer-safe-mode';
const CHIP_ATTR = 'data-agent-devtools-composer-chip';
const TEXTAREA_ATTR = 'data-agent-devtools-composer-input';
const SEND_ATTR = 'data-agent-devtools-composer-send';
const CLOSE_ATTR = 'data-agent-devtools-composer-close';
const RESIZE_HANDLE_ATTR = 'data-agent-devtools-composer-resize';
// Slash-command autocomplete menu. The menu lives inside `panel` (so it stays
// in the closed shadow root with the rest of the widget) and floats just above
// the textarea. Rows expose `data-agent-devtools-composer-cmd-item`; the
// highlighted row carries `data-active` + `aria-selected="true"` so tests and
// any future stylesheet can target it without depending on the painted `var()`
// background a headless CSS engine drops.
const CMD_MENU_ATTR = 'data-agent-devtools-composer-cmd-menu';
const CMD_ITEM_ATTR = 'data-agent-devtools-composer-cmd-item';
const CMD_ITEM_ACTIVE_ATTR = 'data-active';
const CMD_NAME_ATTR = 'data-agent-devtools-composer-cmd-name';
const CMD_DESC_ATTR = 'data-agent-devtools-composer-cmd-desc';
const CMD_HINT_ATTR = 'data-agent-devtools-composer-cmd-hint';
/**
 * A value qualifies as a slash-command-in-progress only when it is a single
 * leading slash followed by zero-or-more NON-space chars and nothing after.
 * The capture group is the prefix the menu filters by (empty → show all).
 * The moment the user types a space after the command name, the value stops
 * matching and the menu closes — arguments are no longer command selection.
 */
const SLASH_COMMAND_RE = /^\/(\S*)$/;
// Layer 2 of the runtime-resilience design. The orchestrator subscribes to
// the error observer and pushes the live unread count down via
// `setErrorCount`; this banner is the in-composer surfacing that gives the
// user one click to ship the captured errors to the agent. Hidden when
// the count is zero so the panel stays clean during normal use.
const ERROR_BANNER_ATTR = 'data-agent-devtools-composer-error-banner';
const ERROR_BANNER_TEXT_ATTR = 'data-agent-devtools-composer-error-banner-text';
const ERROR_BANNER_ACTION_ATTR = 'data-agent-devtools-composer-error-banner-action';
/** Display "99+" past this count so the banner stays a single line. */
const ERROR_BANNER_OVERFLOW = 99;

/**
 * Resize axis identifiers. The panel is fixed-anchored to the launcher
 * (bottom-right by default), so the four edge handles + four corners give
 * the user a full 8-way grab surface. Drag semantics per axis:
 *   - `left` / `corner-nw` / `corner-sw`:   drag LEFT  → width  grows (left edge slides outward).
 *   - `right` / `corner-ne` / `corner-se`:  drag RIGHT → width  grows AND `right` style decreases (right edge follows cursor).
 *   - `top` / `corner-nw` / `corner-ne`:    drag UP    → height grows (top edge slides outward; bottom anchored).
 *   - `bottom` / `corner-sw` / `corner-se`: drag DOWN  → height grows AND `bottom` style decreases (bottom edge follows cursor).
 * The launcher anchor reasserts itself on the next `setAnchor` call, so a
 * free right/bottom drag persists until the launcher moves.
 */
type ResizeAxis =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'corner-nw'
  | 'corner-ne'
  | 'corner-sw'
  | 'corner-se';

const RESIZE_AXES: readonly ResizeAxis[] = [
  'left',
  'right',
  'top',
  'bottom',
  'corner-nw',
  'corner-ne',
  'corner-sw',
  'corner-se',
];

function axisGrowsLeft(axis: ResizeAxis): boolean {
  return axis === 'left' || axis === 'corner-nw' || axis === 'corner-sw';
}
function axisGrowsRight(axis: ResizeAxis): boolean {
  return axis === 'right' || axis === 'corner-ne' || axis === 'corner-se';
}
function axisGrowsTop(axis: ResizeAxis): boolean {
  return axis === 'top' || axis === 'corner-nw' || axis === 'corner-ne';
}
function axisGrowsBottom(axis: ResizeAxis): boolean {
  return axis === 'bottom' || axis === 'corner-sw' || axis === 'corner-se';
}

// Width math: the toolbar packs new-session, pick, safe-mode, settings,
// terminal-handoff and close into a single row. With the safe-mode pill
// adding a visible label (not just an icon), 320px clipped the trailing
// buttons; 360px restores comfortable spacing while staying narrow enough
// to dock against a code editor on a 1280px display.
const PANEL_DEFAULT_WIDTH = 360;
const PANEL_DEFAULT_HEIGHT = 420;
const PANEL_MIN_WIDTH = 320;
const PANEL_MIN_HEIGHT = 240;
const PANEL_SIZE_STORAGE_KEY = 'agent-devtools:panelSize';

// Reveal-on-hover tint for the otherwise-transparent resize handles. Matches
// the toolbar icon hover convention so the affordance reads as "interactive
// edge of the panel" rather than a stray UI element. The colour is a theme
// token resolved by the browser; light keeps the original black tint via the
// literal fallback, dark flips to the white `--adt-overlay-weak`.
const RESIZE_HANDLE_HOVER_BG = 'var(--adt-overlay-weak, rgba(0, 0, 0, 0.08))';

// Marks a handle as currently lit (hovered or mid-drag). The painted colour
// lives in the inline `background` token above, but `var()` is not resolvable
// in non-browser CSS engines, so this attribute is the framework-agnostic
// signal for "is this affordance showing" — used by tests and available to
// any future stylesheet rule.
const RESIZE_HANDLE_LIT_ATTR = 'data-agent-devtools-composer-resize-lit';

function setHandleLit(handle: HTMLElement, lit: boolean): void {
  if (lit) {
    handle.style.background = RESIZE_HANDLE_HOVER_BG;
    handle.setAttribute(RESIZE_HANDLE_LIT_ATTR, '');
  } else {
    handle.style.background = 'transparent';
    handle.removeAttribute(RESIZE_HANDLE_LIT_ATTR);
  }
}

// Picked-element chip fill + border. The fill MUST be alpha-free in every
// theme so the conversation stream rendered behind the chip slot cannot bleed
// through it (a prior 6% alpha tint vanished once messages stacked up). Both
// the light literal fallback (`#eef0f3`) and the dark token (`--adt-chip-bg:
// #2f2f33`) are opaque hex. The border may carry alpha — it is a hairline, not
// a fill. Exported for white-box opacity assertions (not part of the package's
// public entry).
export const CHIP_BG = 'var(--adt-chip-bg, #eef0f3)';
export const CHIP_BORDER = '1px solid var(--adt-border, rgba(0, 0, 0, 0.08))';

export interface ComposerSubmitPayload {
  readonly text: string;
  readonly picked: PickedEvidence | null;
}

/**
 * Launcher offsets used to compute the composer's anchor.
 *
 * `x` is the launcher's distance from the viewport's right edge in CSS px,
 * `y` its distance from the bottom edge — i.e. the same coordinate space
 * the launcher itself uses to set `right`/`bottom`. The composer aligns
 * its right edge with the launcher's right edge and sits `gap` px above
 * the launcher button.
 */
export interface ComposerAnchor {
  readonly x: number;
  readonly y: number;
  /** Launcher square size in CSS px. Defaults to 48 (matches launcher default). */
  readonly launcherSize?: number;
  /** Vertical gap between the launcher's top edge and the composer's bottom edge. Defaults to 16. */
  readonly gap?: number;
}

const DEFAULT_LAUNCHER_SIZE = 48;
const DEFAULT_ANCHOR_GAP = 16;

export interface CreateComposerOptions {
  /** Shadow-root container to mount inside. */
  readonly container: HTMLElement;
  /** Document override. Defaults to `container.ownerDocument`. */
  readonly document?: Document;
  /**
   * Storage backend for persisting the user's drag-resized panel size.
   * Defaults to `globalThis.localStorage`. Tests inject a stub. Pass
   * `null` to disable persistence entirely.
   */
  readonly sizeStorage?: Storage | null;
  /** Storage key for the persisted panel size. Defaults to `agent-devtools:panelSize`. */
  readonly sizeStorageKey?: string;
  /** Initial visibility. Defaults to false. */
  readonly visible?: boolean;
  /** Initial picked descriptor. */
  readonly picked?: PickedEvidence | null;
  /** Initial picker-active flag (drives the toggle button style). */
  readonly pickerActive?: boolean;
  /** Required: called with `{ text, picked }` when the user submits. */
  readonly onSubmit: (payload: ComposerSubmitPayload) => void;
  /**
   * Initial slash-command catalogue for the autocomplete menu. The
   * orchestrator typically feeds the live list from the agent's
   * `available_commands_update` notification via `setCommands`; this initial
   * value lets the menu paint correctly on first render. Defaults to empty.
   */
  readonly commands?: readonly SlashCommandInfo[];
  /**
   * Initial state of the header-level "Safe mode" toggle. The orchestrator
   * owns the canonical value (it lives in the shared settings store) and
   * feeds it in here so the toggle paints correctly on first render. When
   * omitted the toggle defaults to ON, matching the in-memory contract
   * documented on `Settings.safeMode`.
   */
  readonly safeMode?: boolean;
  /**
   * Called when the user clicks the "Safe mode" toggle. The orchestrator
   * persists the flip into the shared settings store. The composer keeps
   * its local render in sync via `setSafeMode`, so callers don't need to
   * round-trip through the store to update the visible label.
   */
  readonly onToggleSafeMode?: (next: boolean) => void;
  /** Called when the user toggles the pick-element button. */
  readonly onTogglePicker?: (next: boolean) => void;
  /** Called when the user clears the picked chip. */
  readonly onClearPicked?: () => void;
  /** Called when the user closes the composer (Escape / close button). */
  readonly onClose?: () => void;
  /**
   * Called when the user clicks the gear icon. The orchestrator owns the
   * settings panel (created from `../settings`), so the composer only emits
   * the intent — it doesn't render the panel itself.
   */
  readonly onToggleSettings?: () => void;
  /**
   * Called when the user clicks the terminal-handoff button. The
   * orchestrator collects the conversation history, picked element, and
   * page context, POSTs to `/v1/agent/handoff`, and renders a modal with
   * the resulting `claude --append-system-prompt-file …` command.
   */
  readonly onHandoff?: () => void;
  /**
   * Called when the user clicks the "new conversation" button. The
   * orchestrator clears the message store (which also clears persisted
   * conversation in sessionStorage) and asks the transport to mint a
   * fresh `clientSessionId` so the next prompt opens a brand-new
   * server-side ACP session — the agent forgets prior turns.
   */
  readonly onNewSession?: () => void;
  /**
   * Called when the user clicks the in-banner "Analyze errors" button.
   * The orchestrator prefills the textarea with an analysis prompt
   * referencing the captured records and clears the unread count. The
   * callback receives the count visible on the banner at click-time
   * (the orchestrator can use it to size the request — small counts
   * may inline records, large counts may attach a summary).
   *
   * Optional: when omitted the banner button is hidden and the count
   * is shown as a passive chip. A widget that wants the affordance but
   * not the wiring (rare — almost always a test) can supply a no-op.
   */
  readonly onAnalyzeErrors?: (count: number) => void;
}

export interface ComposerHandle {
  /** Root panel element. */
  readonly element: HTMLElement;
  /** Update the picked descriptor (or clear it). */
  setPicked(picked: PickedEvidence | null): void;
  /** Highlight the pick toggle. */
  setPickerActive(active: boolean): void;
  /** Highlight the gear icon while the settings overlay is open. */
  setSettingsActive(active: boolean): void;
  /** Repaint the header-level "Safe mode" toggle to reflect external state. */
  setSafeMode(safeMode: boolean): void;
  /** Disable input + send while a request is in flight. */
  setSending(sending: boolean): void;
  /** Show / hide the panel. */
  setVisible(visible: boolean): void;
  /**
   * Surface the live unread runtime-error count as an in-panel banner
   * with an "Analyze errors" affordance. Counts above 99 collapse to
   * "99+". Setting 0 hides the banner. Non-finite / negative values are
   * normalised to 0 so a sloppy caller can't paint "-3 errors".
   */
  setErrorCount(count: number): void;
  /** Current displayed error count (0 when the banner is hidden). */
  getErrorCount(): number;
  /**
   * Anchor the panel to the launcher's position. The composer's right edge
   * aligns with the launcher's right edge, and its bottom sits one `gap`
   * above the launcher's top edge. If the panel would overflow the top of
   * the viewport (launcher dragged near the top), it slides down so its
   * top sticks to the viewport top.
   */
  setAnchor(anchor: ComposerAnchor): void;
  /**
   * Replace the slash-command catalogue used by the autocomplete menu. If the
   * menu is currently open it re-filters against the live textarea prefix and
   * re-renders in place.
   */
  setCommands(commands: readonly SlashCommandInfo[]): void;
  /** Set the textarea value programmatically. */
  setText(text: string): void;
  /** Current text. */
  getText(): string;
  /** Focus the textarea. */
  focus(): void;
  /** Remove the panel and detach listeners. */
  destroy(): void;
}

export function createComposer(options: CreateComposerOptions): ComposerHandle {
  const container = options.container;
  const doc = options.document ?? container.ownerDocument;
  if (!doc) throw new Error('createComposer: container must be in a document');

  let picked: PickedEvidence | null = options.picked ?? null;
  let pickerActive = options.pickerActive ?? false;
  let settingsActive = false;
  let safeMode = options.safeMode ?? true;
  let sending = false;
  let visible = options.visible ?? false;
  let destroyed = false;
  let chipTooltipSeq = 0;

  // Slash-command autocomplete state. `commandCatalogue` is the full advertised
  // list; `commandMatches` is the prefix-filtered subset currently rendered;
  // `commandHighlight` indexes the active row within `commandMatches`. The menu
  // is "open" iff `commandMatches.length > 0` AND the menu element is visible.
  let commandCatalogue: readonly SlashCommandInfo[] = options.commands ?? [];
  let commandMatches: readonly SlashCommandInfo[] = [];
  let commandHighlight = 0;
  let commandMenuOpen = false;

  const panel = doc.createElement('div');
  panel.setAttribute(PANEL_ATTR, '');
  applyPanelStyles(panel);

  // Drag-resize state. The panel anchors to the launcher (bottom-right by
  // default) but mounts an 8-way handle set so the user can grow/shrink
  // from any edge or corner. The four "outward" axes (right / bottom /
  // corner-ne / corner-se / corner-sw — anything that decreases the panel's
  // `right` or `bottom` style) explicitly track CSS px so the dragged edge
  // visibly follows the cursor instead of the opposite edge moving. The
  // launcher anchor reasserts itself on the next `setAnchor` call.
  const sizeStorage = resolveSizeStorage(options.sizeStorage);
  const sizeStorageKey = options.sizeStorageKey ?? PANEL_SIZE_STORAGE_KEY;
  let lastAnchor: ComposerAnchor | null = null;
  const initialSize = loadPanelSize(sizeStorage, sizeStorageKey);
  applyPanelSize(panel, initialSize.width, initialSize.height);
  const resizeHandles = new Map<ResizeAxis, HTMLElement>();
  for (const axis of RESIZE_AXES) {
    const el = doc.createElement('div');
    el.setAttribute(RESIZE_HANDLE_ATTR, axis);
    el.setAttribute('aria-hidden', 'true');
    applyResizeHandleStyles(el, axis);
    panel.appendChild(el);
    resizeHandles.set(axis, el);
  }

  const header = doc.createElement('header');
  applyHeaderStyles(header);
  const title = doc.createElement('span');
  title.textContent = 'agent';
  applyTitleStyles(title);
  const pickButton = doc.createElement('button');
  pickButton.type = 'button';
  pickButton.setAttribute(PICK_TOGGLE_ATTR, '');
  pickButton.setAttribute('aria-label', 'Pick element');
  pickButton.textContent = 'Pick';
  applyPickButtonStyles(pickButton, pickerActive);
  // Header-level safety switch. When on (the default), the transport
  // attaches a per-action permission policy that locks bash / web fetch /
  // MCP tool calls to "ask" while leaving file edits on auto. The button
  // is `role="switch"` so screen readers announce a toggle state instead
  // of a button press, and the visible "On" / "Off" suffix gives sighted
  // users an at-a-glance affordance without depending on colour alone.
  const safeModeButton = doc.createElement('button');
  safeModeButton.type = 'button';
  safeModeButton.setAttribute(SAFE_MODE_ATTR, '');
  safeModeButton.setAttribute('role', 'switch');
  safeModeButton.setAttribute('aria-label', 'Safe mode');
  applySafeModeButtonState(safeModeButton, safeMode);
  const settingsButton = doc.createElement('button');
  settingsButton.type = 'button';
  settingsButton.setAttribute(SETTINGS_TOGGLE_ATTR, '');
  settingsButton.setAttribute('aria-label', 'Open settings');
  // The gear toggles the settings panel — opt into aria-pressed so the active
  // state is announced (and observable) independent of the painted colour.
  settingsButton.setAttribute('aria-pressed', String(settingsActive));
  // Plain U+2699 GEAR rather than an SVG to dodge a font-rendering edge case
  // in shadow roots and keep the bundle tiny.
  settingsButton.textContent = '⚙';
  applyIconButtonStyles(settingsButton, settingsActive);
  // U+2934 (right-then-down arrow) reads as "send out / take elsewhere" —
  // matches the verb "hand off this conversation to another runtime".
  const handoffButton = doc.createElement('button');
  handoffButton.type = 'button';
  handoffButton.setAttribute(HANDOFF_ATTR, '');
  handoffButton.setAttribute('aria-label', 'Continue in terminal');
  handoffButton.setAttribute('title', 'Continue this conversation in your terminal');
  handoffButton.textContent = '⤴';
  applyIconButtonStyles(handoffButton, false);
  // U+2295 (circled plus) reads unambiguously as "start a new thing" and
  // renders crisply at 14px without depending on emoji fonts. The action is
  // destructive (drops the current conversation + mints a fresh server-side
  // ACP session), so the title spells it out.
  const newSessionButton = doc.createElement('button');
  newSessionButton.type = 'button';
  newSessionButton.setAttribute(NEW_SESSION_ATTR, '');
  newSessionButton.setAttribute('aria-label', 'Start a new conversation');
  newSessionButton.setAttribute(
    'title',
    'Start a new conversation (clears history and resets the agent session)',
  );
  newSessionButton.textContent = '⊕';
  applyIconButtonStyles(newSessionButton, false);
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute(CLOSE_ATTR, '');
  closeButton.setAttribute('aria-label', 'Close composer');
  closeButton.textContent = '✕';
  applyCloseButtonStyles(closeButton);
  header.appendChild(title);
  header.appendChild(safeModeButton);
  header.appendChild(pickButton);
  header.appendChild(handoffButton);
  header.appendChild(newSessionButton);
  header.appendChild(settingsButton);
  header.appendChild(closeButton);

  const chipHost = doc.createElement('div');
  chipHost.setAttribute(CHIP_ATTR, '');
  applyChipHostStyles(chipHost, picked != null);

  // Runtime-error surfacing banner. Lives between the chip slot and the
  // stream view so it stays visible regardless of stream scroll position.
  // Hidden by default; the orchestrator pushes the live count down via
  // `setErrorCount` and the banner unhides itself when count > 0.
  const errorBanner = doc.createElement('div');
  errorBanner.setAttribute(ERROR_BANNER_ATTR, '');
  errorBanner.setAttribute('role', 'status');
  errorBanner.setAttribute('aria-live', 'polite');
  applyErrorBannerStyles(errorBanner);
  const errorBannerText = doc.createElement('span');
  errorBannerText.setAttribute(ERROR_BANNER_TEXT_ATTR, '');
  applyErrorBannerTextStyles(errorBannerText);
  const errorBannerAction = doc.createElement('button');
  errorBannerAction.type = 'button';
  errorBannerAction.setAttribute(ERROR_BANNER_ACTION_ATTR, '');
  errorBannerAction.setAttribute('aria-label', 'Analyze captured runtime errors');
  errorBannerAction.textContent = 'Analyze';
  applyErrorBannerActionStyles(errorBannerAction);
  errorBanner.appendChild(errorBannerText);
  errorBanner.appendChild(errorBannerAction);
  let errorCount = 0;

  const textarea = doc.createElement('textarea');
  textarea.setAttribute(TEXTAREA_ATTR, '');
  textarea.setAttribute('placeholder', 'Ask the agent about this page…');
  textarea.rows = 3;
  applyTextareaStyles(textarea);

  // Slash-command autocomplete menu. Appended to `panel` (closed shadow root)
  // and absolutely positioned just above the textarea. Hidden until the user
  // types a qualifying slash prefix with at least one match.
  const commandMenu = doc.createElement('div');
  commandMenu.setAttribute(CMD_MENU_ATTR, '');
  commandMenu.setAttribute('role', 'listbox');
  commandMenu.setAttribute('aria-label', 'Slash commands');
  applyCommandMenuStyles(commandMenu);

  const footer = doc.createElement('footer');
  applyFooterStyles(footer);
  const sendButton = doc.createElement('button');
  sendButton.type = 'button';
  sendButton.setAttribute(SEND_ATTR, '');
  sendButton.textContent = 'Send';
  applySendButtonStyles(sendButton);
  sendButton.disabled = true;
  footer.appendChild(sendButton);

  panel.appendChild(header);
  panel.appendChild(chipHost);
  panel.appendChild(errorBanner);
  panel.appendChild(textarea);
  panel.appendChild(commandMenu);
  panel.appendChild(footer);
  container.appendChild(panel);

  renderChip();
  renderErrorBanner();
  renderVisibility();

  function renderChip(): void {
    chipHost.innerHTML = '';
    applyChipHostStyles(chipHost, picked != null);
    if (!picked) return;
    const chip = doc!.createElement('span');
    applyChipStyles(chip);
    // tabindex makes the chip focusable so keyboard users can land on it
    // and surface the same tooltip the mouse path shows. aria-describedby
    // wires the chip to the tooltip's text so screen readers announce the
    // expanded info even when the visual tooltip is hidden.
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('role', 'group');
    const tooltipId = `agent-devtools-chip-tooltip-${++chipTooltipSeq}`;
    chip.setAttribute('aria-describedby', tooltipId);
    // The custom role="tooltip" element below carries the same content the
    // native `title` bubble would, and aria-describedby wires it for assistive
    // tech. Setting `title` in addition would layer the OS tooltip on top of
    // our popup on hover.
    const summary = summarizePicked(picked);

    const label = doc!.createElement('span');
    label.setAttribute('data-agent-devtools-composer-chip-label', '');
    label.textContent = picked.componentName || picked.tagName.toLowerCase();
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';
    label.style.minWidth = '0';
    chip.appendChild(label);
    const remove = doc!.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove picked element');
    remove.textContent = '✕';
    applyChipRemoveStyles(remove);
    remove.addEventListener('click', onClearPicked);
    chip.appendChild(remove);

    const tooltip = doc!.createElement('div');
    tooltip.setAttribute('data-agent-devtools-composer-chip-tooltip', '');
    tooltip.setAttribute('id', tooltipId);
    tooltip.setAttribute('role', 'tooltip');
    applyChipTooltipStyles(tooltip);
    populateChipTooltip(doc!, tooltip, summary);
    chip.appendChild(tooltip);

    function showTooltip(): void {
      tooltip.style.opacity = '1';
      tooltip.style.visibility = 'visible';
    }
    function hideTooltip(): void {
      tooltip.style.opacity = '0';
      tooltip.style.visibility = 'hidden';
    }
    chip.addEventListener('pointerenter', showTooltip);
    chip.addEventListener('pointerleave', hideTooltip);
    chip.addEventListener('focus', showTooltip);
    chip.addEventListener('blur', hideTooltip);

    chipHost.appendChild(chip);
  }

  function renderVisibility(): void {
    panel.style.display = visible ? 'flex' : 'none';
  }

  function renderErrorBanner(): void {
    if (errorCount <= 0) {
      errorBanner.style.display = 'none';
      errorBannerText.textContent = '';
      return;
    }
    const display =
      errorCount > ERROR_BANNER_OVERFLOW ? `${ERROR_BANNER_OVERFLOW}+` : String(errorCount);
    const noun = errorCount === 1 ? 'runtime error' : 'runtime errors';
    errorBannerText.textContent = `${display} ${noun} captured`;
    // Hide the action button entirely when no analyze callback is wired —
    // the banner becomes a passive chip rather than a dead button.
    errorBannerAction.style.display = options.onAnalyzeErrors ? 'inline-flex' : 'none';
    errorBanner.style.display = 'flex';
  }

  function onErrorBannerActionClick(): void {
    // Snapshot the count before we let the orchestrator react — handler may
    // reset it via setErrorCount(0), and we want the captured-at-click value
    // for the prompt template.
    const snapshot = errorCount;
    options.onAnalyzeErrors?.(snapshot);
  }

  function refreshSendDisabled(): void {
    sendButton.disabled = sending || textarea.value.trim().length === 0;
  }

  function onInput(): void {
    refreshSendDisabled();
    syncCommandMenu();
  }

  /**
   * Recompute the menu's open/closed state and contents from the current
   * textarea value. Opens when the value is a slash-command-in-progress (a
   * leading slash + zero-or-more non-space chars) AND at least one catalogue
   * command name starts with the typed prefix (case-insensitive). Resets the
   * highlight to the first match on every re-filter. Otherwise closes.
   */
  function syncCommandMenu(): void {
    const match = SLASH_COMMAND_RE.exec(textarea.value);
    if (!match) {
      closeCommandMenu();
      return;
    }
    const prefix = (match[1] ?? '').toLowerCase();
    const next = commandCatalogue.filter((command) =>
      command.name.toLowerCase().startsWith(prefix),
    );
    if (next.length === 0) {
      closeCommandMenu();
      return;
    }
    commandMatches = next;
    commandHighlight = 0;
    commandMenuOpen = true;
    renderCommandMenu();
  }

  function closeCommandMenu(): void {
    if (!commandMenuOpen && commandMatches.length === 0) {
      commandMenu.style.display = 'none';
      return;
    }
    commandMenuOpen = false;
    commandMatches = [];
    commandHighlight = 0;
    commandMenu.innerHTML = '';
    commandMenu.style.display = 'none';
  }

  function renderCommandMenu(): void {
    commandMenu.innerHTML = '';
    commandMenu.style.display = 'block';
    commandMatches.forEach((command, index) => {
      const row = doc!.createElement('div');
      row.setAttribute(CMD_ITEM_ATTR, '');
      row.setAttribute('role', 'option');
      const active = index === commandHighlight;
      applyCommandItemStyles(row, active);
      if (active) {
        row.setAttribute(CMD_ITEM_ACTIVE_ATTR, '');
        row.setAttribute('aria-selected', 'true');
      } else {
        row.setAttribute('aria-selected', 'false');
      }

      const name = doc!.createElement('span');
      name.setAttribute(CMD_NAME_ATTR, '');
      name.textContent = `/${command.name}`;
      applyCommandNameStyles(name);
      row.appendChild(name);

      const desc = doc!.createElement('span');
      desc.setAttribute(CMD_DESC_ATTR, '');
      desc.textContent = command.description;
      applyCommandDescStyles(desc);
      row.appendChild(desc);

      // Only render the argument-hint slot when the agent actually supplied a
      // non-empty hint — an absent or blank hint leaves the row clean rather
      // than painting an empty monospace span.
      if (command.argumentHint && command.argumentHint.trim().length > 0) {
        const hint = doc!.createElement('span');
        hint.setAttribute(CMD_HINT_ATTR, '');
        hint.textContent = command.argumentHint;
        applyCommandHintStyles(hint);
        row.appendChild(hint);
      }

      // Confirm on pointerdown rather than click so the selection lands before
      // the textarea's blur can fire — keeps the row clickable without a
      // blur-close race (we don't close on blur anyway, but this is robust).
      row.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        confirmCommand(index);
      });

      commandMenu.appendChild(row);
    });
  }

  function moveCommandHighlight(delta: number): void {
    const count = commandMatches.length;
    if (count === 0) return;
    commandHighlight = (commandHighlight + delta + count) % count;
    renderCommandMenu();
  }

  /**
   * Insert the chosen command into the textarea as `"/" + name + " "`, leaving
   * the caret at the end ready for arguments, then close the menu. Does NOT
   * submit — confirming a command is a distinct gesture from sending a turn.
   */
  function confirmCommand(index: number): void {
    const command = commandMatches[index];
    if (!command) return;
    const value = `/${command.name} `;
    textarea.value = value;
    const caret = value.length;
    try {
      textarea.setSelectionRange(caret, caret);
    } catch {
      /* setSelectionRange can throw on detached/hidden inputs — caret is best-effort */
    }
    closeCommandMenu();
    refreshSendDisabled();
    textarea.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    // Menu-open handling runs BEFORE the submit/close branches so the keys are
    // consumed by the autocomplete instead of the panel. Arrow/confirm/dismiss
    // are stopPropagation-ed so they never leak to the host page.
    if (commandMenuOpen && commandMatches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        moveCommandHighlight(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        moveCommandHighlight(-1);
        return;
      }
      if ((event.key === 'Enter' && !event.shiftKey && !event.isComposing) || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        confirmCommand(commandHighlight);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeCommandMenu();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose?.();
    }
  }

  function submit(): void {
    if (sending) return;
    const text = textarea.value.trim();
    if (!text) return;
    options.onSubmit({ text, picked });
  }

  function onSendClick(): void {
    submit();
  }

  function onPickClick(): void {
    options.onTogglePicker?.(!pickerActive);
  }

  function onSafeModeClick(): void {
    // Composer owns the visible affordance, but the canonical value lives in
    // the orchestrator's settings store. Flip the local mirror first so the
    // click feels instant, then notify — the orchestrator will call back
    // through `setSafeMode` if any external listener mutates the store in a
    // way that produces a different value.
    safeMode = !safeMode;
    applySafeModeButtonState(safeModeButton, safeMode);
    options.onToggleSafeMode?.(safeMode);
  }

  function onSettingsClick(): void {
    options.onToggleSettings?.();
  }

  function onHandoffClick(): void {
    options.onHandoff?.();
  }

  function onNewSessionClick(): void {
    options.onNewSession?.();
  }

  function onCloseClick(): void {
    options.onClose?.();
  }

  function onClearPicked(): void {
    options.onClearPicked?.();
  }

  // Stop pointer events on the panel from reaching the page; the shadow
  // host's pointer-events:none lets the panel itself opt in here.
  function onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
  }

  interface ResizeDrag {
    readonly axis: ResizeAxis;
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly startWidth: number;
    readonly startHeight: number;
    /** Panel's `right` CSS value at pointerdown, in px. */
    readonly startRight: number;
    /** Panel's `bottom` CSS value at pointerdown, in px. */
    readonly startBottom: number;
  }
  let activeDrag: ResizeDrag | null = null;

  function onHandlePointerDown(axis: ResizeAxis) {
    return (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      activeDrag = {
        axis,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width || panel.offsetWidth || PANEL_DEFAULT_WIDTH,
        startHeight: rect.height || panel.offsetHeight || PANEL_DEFAULT_HEIGHT,
        startRight: parseFloat(panel.style.right) || 0,
        startBottom: parseFloat(panel.style.bottom) || 0,
      };
      const handle = event.currentTarget as HTMLElement;
      // Keep the affordance lit while the drag is in flight — pointer
      // capture can suppress hover transitions once the cursor leaves the
      // 6px strip, so we paint it explicitly.
      setHandleLit(handle, true);
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* setPointerCapture is unsupported in some test envs — fine */
      }
    };
  }

  function onHandlePointerMove(event: PointerEvent): void {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - activeDrag.startX;
    const deltaY = event.clientY - activeDrag.startY;

    // Width: left-side axes grow when cursor moves left (-deltaX), right-side
    // axes grow when cursor moves right (+deltaX). Pure-vertical axes
    // (top/bottom) leave width untouched.
    let nextWidth = activeDrag.startWidth;
    if (axisGrowsLeft(activeDrag.axis)) {
      nextWidth = activeDrag.startWidth - deltaX;
    } else if (axisGrowsRight(activeDrag.axis)) {
      nextWidth = activeDrag.startWidth + deltaX;
    }

    // Height mirrors width across the vertical axis.
    let nextHeight = activeDrag.startHeight;
    if (axisGrowsTop(activeDrag.axis)) {
      nextHeight = activeDrag.startHeight - deltaY;
    } else if (axisGrowsBottom(activeDrag.axis)) {
      nextHeight = activeDrag.startHeight + deltaY;
    }

    applyPanelSize(panel, nextWidth, nextHeight);

    const touchesRight = axisGrowsRight(activeDrag.axis);
    const touchesBottom = axisGrowsBottom(activeDrag.axis);

    if (touchesRight || touchesBottom) {
      // The user is actively dragging the right and/or bottom edge of the
      // panel — let those edges follow the cursor directly. Skip
      // `applyAnchor` because it would yank `right`/`bottom` back to the
      // launcher-derived values and undo the visible drag. The launcher
      // anchor re-asserts itself on the next `setAnchor` call.
      if (touchesRight) {
        panel.style.right = `${Math.max(0, activeDrag.startRight - deltaX)}px`;
      }
      if (touchesBottom) {
        panel.style.bottom = `${Math.max(0, activeDrag.startBottom - deltaY)}px`;
      }
      // Corner-ne still grows the top edge upward — clamp `bottom` for the
      // top-overflow case, but only via the standalone clamp (not
      // applyAnchor) so the just-set `right` survives.
      if (axisGrowsTop(activeDrag.axis)) {
        clampBottomForTopOverflow(panel);
      }
      return;
    }

    // Inward axes (left / top / corner-nw): the launcher anchor is the
    // source of truth for right/bottom. Re-apply it on every move so
    // shrinking restores the launcher-derived position after a previous
    // top-overflow clamp pushed `bottom` down.
    if (lastAnchor) applyAnchor(panel, lastAnchor);
  }

  function onHandlePointerUp(event: PointerEvent): void {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const handle = event.currentTarget as HTMLElement;
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    // Drop the lit background — if the cursor is still over the handle the
    // next pointerenter will repaint it; otherwise the affordance correctly
    // disappears.
    setHandleLit(handle, false);
    activeDrag = null;
    const width = panel.offsetWidth || parseFloat(panel.style.width) || PANEL_DEFAULT_WIDTH;
    const height = panel.offsetHeight || parseFloat(panel.style.height) || PANEL_DEFAULT_HEIGHT;
    savePanelSize(sizeStorage, sizeStorageKey, width, height);
  }

  function onHandlePointerEnter(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    setHandleLit(handle, true);
  }

  function onHandlePointerLeave(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    // Keep the lit state while the user is mid-drag from this handle — the
    // cursor can wander far off the 6px strip while pointer capture keeps
    // the drag alive.
    if (activeDrag && activeDrag.pointerId === event.pointerId) return;
    setHandleLit(handle, false);
  }

  const handleListeners: Array<[HTMLElement, (event: PointerEvent) => void, () => void]> = [];
  for (const [axis, el] of resizeHandles) {
    const down = onHandlePointerDown(axis);
    el.addEventListener('pointerdown', down as EventListener);
    el.addEventListener('pointermove', onHandlePointerMove as EventListener);
    el.addEventListener('pointerup', onHandlePointerUp as EventListener);
    el.addEventListener('pointerenter', onHandlePointerEnter as EventListener);
    el.addEventListener('pointerleave', onHandlePointerLeave as EventListener);
    handleListeners.push([
      el,
      down as (event: PointerEvent) => void,
      () => {
        el.removeEventListener('pointerdown', down as EventListener);
        el.removeEventListener('pointermove', onHandlePointerMove as EventListener);
        el.removeEventListener('pointerup', onHandlePointerUp as EventListener);
        el.removeEventListener('pointerenter', onHandlePointerEnter as EventListener);
        el.removeEventListener('pointerleave', onHandlePointerLeave as EventListener);
      },
    ]);
  }

  textarea.addEventListener('input', onInput);
  textarea.addEventListener('keydown', onKeyDown);
  sendButton.addEventListener('click', onSendClick);
  pickButton.addEventListener('click', onPickClick);
  safeModeButton.addEventListener('click', onSafeModeClick);
  settingsButton.addEventListener('click', onSettingsClick);
  handoffButton.addEventListener('click', onHandoffClick);
  newSessionButton.addEventListener('click', onNewSessionClick);
  closeButton.addEventListener('click', onCloseClick);
  errorBannerAction.addEventListener('click', onErrorBannerActionClick);
  panel.addEventListener('pointerdown', onPointerDown);

  return {
    element: panel,
    setPicked(next): void {
      if (destroyed) return;
      picked = next;
      renderChip();
    },
    setPickerActive(active): void {
      if (destroyed) return;
      pickerActive = active;
      applyPickButtonStyles(pickButton, pickerActive);
    },
    setSettingsActive(active): void {
      if (destroyed) return;
      settingsActive = active;
      applyIconButtonStyles(settingsButton, settingsActive);
    },
    setSafeMode(next): void {
      if (destroyed) return;
      // External update path — repaint without firing `onToggleSafeMode`
      // (that callback is reserved for user-driven clicks; this setter is
      // how the orchestrator pushes the canonical store value back down).
      safeMode = next;
      applySafeModeButtonState(safeModeButton, safeMode);
    },
    setSending(next): void {
      if (destroyed) return;
      sending = next;
      textarea.disabled = next;
      refreshSendDisabled();
    },
    setVisible(next): void {
      if (destroyed) return;
      visible = next;
      renderVisibility();
    },
    setErrorCount(count): void {
      if (destroyed) return;
      const normalised = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
      if (normalised === errorCount) return;
      errorCount = normalised;
      renderErrorBanner();
    },
    getErrorCount(): number {
      return errorCount;
    },
    setAnchor(anchor): void {
      if (destroyed) return;
      lastAnchor = anchor;
      applyAnchor(panel, anchor);
    },
    setCommands(commands): void {
      if (destroyed) return;
      commandCatalogue = commands;
      // Re-filter against the live prefix so an open menu reflects the new
      // catalogue immediately (and closes if nothing matches now).
      if (commandMenuOpen) syncCommandMenu();
    },
    setText(text): void {
      if (destroyed) return;
      textarea.value = text;
      refreshSendDisabled();
      syncCommandMenu();
    },
    getText(): string {
      return textarea.value;
    },
    focus(): void {
      if (destroyed) return;
      textarea.focus();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      textarea.removeEventListener('input', onInput);
      textarea.removeEventListener('keydown', onKeyDown);
      sendButton.removeEventListener('click', onSendClick);
      pickButton.removeEventListener('click', onPickClick);
      safeModeButton.removeEventListener('click', onSafeModeClick);
      settingsButton.removeEventListener('click', onSettingsClick);
      handoffButton.removeEventListener('click', onHandoffClick);
      newSessionButton.removeEventListener('click', onNewSessionClick);
      closeButton.removeEventListener('click', onCloseClick);
      errorBannerAction.removeEventListener('click', onErrorBannerActionClick);
      panel.removeEventListener('pointerdown', onPointerDown);
      for (const [, , detach] of handleListeners) detach();
      // Drop the menu rows (each carries a pointerdown listener) before the
      // panel detaches so no autocomplete handler outlives the composer.
      commandMenu.innerHTML = '';
      panel.remove();
    },
  };
}

function applyPanelStyles(panel: HTMLElement): void {
  const s = panel.style;
  s.position = 'fixed';
  // Default anchor (right: 24, bottom: 88 — directly above a launcher at
  // right: 24, bottom: 24). Replaced as soon as `setAnchor` is called with
  // the live launcher position.
  s.right = '24px';
  s.bottom = '88px';
  // Width / height are owned by the resize subsystem (`applyPanelSize`)
  // so the user's drag-resized dimensions persist across reloads.
  s.background = 'var(--adt-surface, #ffffff)';
  s.color = 'var(--adt-text, #1a1a1a)';
  s.border = '1px solid var(--adt-border, rgba(0, 0, 0, 0.08))';
  s.borderRadius = '12px';
  s.boxShadow = '0 12px 32px var(--adt-shadow, rgba(0, 0, 0, 0.18))';
  s.flexDirection = 'column';
  s.overflow = 'hidden';
  s.fontFamily = 'inherit';
  s.fontSize = '13px';
}

/**
 * Set the panel's explicit width/height after clamping to viewport-aware
 * bounds. Width is bounded by `[PANEL_MIN_WIDTH, 80vw]`, height by
 * `[PANEL_MIN_HEIGHT, 90vh]`. Without an upper bound the user could drag
 * the panel past the viewport edge and lose the close button.
 */
function applyPanelSize(panel: HTMLElement, width: number, height: number): void {
  const view = panel.ownerDocument?.defaultView;
  const maxWidth = view?.innerWidth ? view.innerWidth * 0.8 : 1600;
  const maxHeight = view?.innerHeight ? view.innerHeight * 0.9 : 1200;
  const clampedWidth = Math.round(Math.min(Math.max(width, PANEL_MIN_WIDTH), maxWidth));
  const clampedHeight = Math.round(Math.min(Math.max(height, PANEL_MIN_HEIGHT), maxHeight));
  panel.style.width = `${clampedWidth}px`;
  panel.style.height = `${clampedHeight}px`;
}

function applyResizeHandleStyles(el: HTMLElement, axis: ResizeAxis): void {
  const s = el.style;
  s.position = 'absolute';
  s.background = 'transparent';
  s.touchAction = 'none';
  // Corners (12×12 squares) sit ON TOP of the edge handles (zIndex 2 vs 1)
  // so a diagonal grab resolves to the corner — both axes resize together
  // rather than one edge stealing the event. Edge handles reserve a 6px
  // gap at each end (`top: 6px; bottom: 6px` on vertical edges, mirrored
  // on horizontal) so the corners get a clean target square.
  switch (axis) {
    case 'left':
      s.left = '0';
      s.top = '6px';
      s.bottom = '6px';
      s.width = '6px';
      s.cursor = 'ew-resize';
      s.zIndex = '1';
      return;
    case 'right':
      s.right = '0';
      s.top = '6px';
      s.bottom = '6px';
      s.width = '6px';
      s.cursor = 'ew-resize';
      s.zIndex = '1';
      return;
    case 'top':
      s.left = '6px';
      s.right = '6px';
      s.top = '0';
      s.height = '6px';
      s.cursor = 'ns-resize';
      s.zIndex = '1';
      return;
    case 'bottom':
      s.left = '6px';
      s.right = '6px';
      s.bottom = '0';
      s.height = '6px';
      s.cursor = 'ns-resize';
      s.zIndex = '1';
      return;
    case 'corner-nw':
      s.left = '0';
      s.top = '0';
      s.width = '12px';
      s.height = '12px';
      s.cursor = 'nwse-resize';
      s.zIndex = '2';
      return;
    case 'corner-ne':
      s.right = '0';
      s.top = '0';
      s.width = '12px';
      s.height = '12px';
      s.cursor = 'nesw-resize';
      s.zIndex = '2';
      return;
    case 'corner-sw':
      s.left = '0';
      s.bottom = '0';
      s.width = '12px';
      s.height = '12px';
      s.cursor = 'nesw-resize';
      s.zIndex = '2';
      return;
    case 'corner-se':
      s.right = '0';
      s.bottom = '0';
      s.width = '12px';
      s.height = '12px';
      s.cursor = 'nwse-resize';
      s.zIndex = '2';
      return;
  }
}

/**
 * Push the panel's `bottom` style down so the top edge stays inside the
 * viewport. Called after any height-growing resize so a panel that grew
 * upward past the viewport top is corrected without disturbing `right` —
 * the dedicated path that `applyAnchor` doesn't cover when the user is
 * also dragging the `right` style directly (corner-ne).
 */
function clampBottomForTopOverflow(panel: HTMLElement): void {
  const view = panel.ownerDocument?.defaultView;
  const viewportHeight = view?.innerHeight;
  if (!Number.isFinite(viewportHeight)) return;
  const panelHeight = panel.offsetHeight || parseFloat(panel.style.height) || PANEL_DEFAULT_HEIGHT;
  const bottomPx = parseFloat(panel.style.bottom) || 0;
  if (bottomPx + panelHeight > (viewportHeight as number)) {
    panel.style.bottom = `${Math.max(0, (viewportHeight as number) - panelHeight)}px`;
  }
}

function resolveSizeStorage(override: Storage | null | undefined): Storage | null {
  if (override !== undefined) return override;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

interface PersistedPanelSize {
  readonly width: number;
  readonly height: number;
}

function loadPanelSize(storage: Storage | null, key: string): PersistedPanelSize {
  const fallback: PersistedPanelSize = {
    width: PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_HEIGHT,
  };
  if (!storage) return fallback;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown };
    const width =
      typeof parsed.width === 'number' && Number.isFinite(parsed.width)
        ? parsed.width
        : PANEL_DEFAULT_WIDTH;
    const height =
      typeof parsed.height === 'number' && Number.isFinite(parsed.height)
        ? parsed.height
        : PANEL_DEFAULT_HEIGHT;
    return { width, height };
  } catch {
    return fallback;
  }
}

function savePanelSize(storage: Storage | null, key: string, width: number, height: number): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ width, height }));
  } catch {
    /* silent — quota / disabled storage is fine */
  }
}

function applyAnchor(panel: HTMLElement, anchor: ComposerAnchor): void {
  const launcherSize = anchor.launcherSize ?? DEFAULT_LAUNCHER_SIZE;
  const gap = anchor.gap ?? DEFAULT_ANCHOR_GAP;
  const right = Math.max(0, anchor.x);
  // Default: sit above the launcher (composer's bottom edge = launcher's top edge + gap).
  let bottom = Math.max(0, anchor.y + launcherSize + gap);

  // If the panel would overflow the top of the viewport (launcher is near
  // the top), slide it down so its top stays inside the viewport. We use
  // the rendered height when available so a tall panel (with a long
  // stream) re-anchors correctly; fall back to the CSS max-height.
  const view = panel.ownerDocument?.defaultView;
  const viewportHeight = view?.innerHeight;
  if (Number.isFinite(viewportHeight)) {
    const panelHeight = panel.offsetHeight || 420;
    const topOffset = bottom + panelHeight;
    if (topOffset > (viewportHeight as number)) {
      bottom = Math.max(0, (viewportHeight as number) - panelHeight);
    }
  }

  panel.style.right = `${right}px`;
  panel.style.bottom = `${bottom}px`;
  panel.style.left = 'auto';
  panel.style.top = 'auto';
}

function applyHeaderStyles(header: HTMLElement): void {
  const s = header.style;
  s.display = 'flex';
  s.alignItems = 'center';
  s.gap = '8px';
  s.padding = '10px 12px';
  s.borderBottom = '1px solid var(--adt-border, rgba(0, 0, 0, 0.06))';
}

function applyTitleStyles(title: HTMLElement): void {
  const s = title.style;
  s.flex = '1';
  s.fontWeight = '600';
  s.fontSize = '13px';
}

function applyPickButtonStyles(button: HTMLButtonElement, active: boolean): void {
  const s = button.style;
  s.padding = '4px 10px';
  s.borderRadius = '999px';
  s.border = active
    ? '1px solid var(--adt-accent, #1a1a1a)'
    : '1px solid var(--adt-border, rgba(0, 0, 0, 0.16))';
  s.background = active ? 'var(--adt-accent, #1a1a1a)' : 'transparent';
  s.color = active ? 'var(--adt-accent-text, #ffffff)' : 'var(--adt-text, #1a1a1a)';
  s.fontSize = '12px';
  s.cursor = 'pointer';
}

/**
 * Paint the header-level "Safe mode" toggle to match the supplied boolean.
 * Mirrors `applyPickButtonStyles` so the on-state reads as a filled pill —
 * the visible "Safe · On" / "Safe · Off" label keeps the affordance
 * accessible to users who cannot perceive the colour swap, and the
 * `aria-checked` + `data-safe-mode` pair gives assistive tech and
 * automated tests a programmatic hook.
 */
function applySafeModeButtonState(button: HTMLButtonElement, safeMode: boolean): void {
  button.setAttribute('aria-checked', safeMode ? 'true' : 'false');
  button.setAttribute('data-safe-mode', safeMode ? 'on' : 'off');
  button.textContent = safeMode ? 'Safe · On' : 'Safe · Off';
  const s = button.style;
  s.padding = '4px 10px';
  s.borderRadius = '999px';
  s.border = safeMode
    ? '1px solid var(--adt-accent, #1a1a1a)'
    : '1px solid var(--adt-border, rgba(0, 0, 0, 0.16))';
  s.background = safeMode ? 'var(--adt-accent, #1a1a1a)' : 'transparent';
  s.color = safeMode ? 'var(--adt-accent-text, #ffffff)' : 'var(--adt-text, #1a1a1a)';
  s.fontSize = '12px';
  s.cursor = 'pointer';
}

function applyIconButtonStyles(button: HTMLButtonElement, active: boolean): void {
  const s = button.style;
  s.width = '24px';
  s.height = '24px';
  s.padding = '0';
  s.borderRadius = '6px';
  s.border = '0';
  s.background = active ? 'var(--adt-overlay-weak, rgba(0, 0, 0, 0.08))' : 'transparent';
  s.color = active ? 'var(--adt-text, #1a1a1a)' : 'var(--adt-text-muted, #666)';
  s.cursor = 'pointer';
  s.fontSize = '14px';
  s.lineHeight = '1';
  // Toggle buttons (the gear) opt into aria-pressed at creation; momentary
  // action buttons (handoff / new-session) never carry it and stay plain.
  // This is also the framework-agnostic signal for the active state, since
  // the painted background is a `var()` token that headless CSS engines drop.
  if (button.hasAttribute('aria-pressed')) {
    button.setAttribute('aria-pressed', String(active));
  }
}

function applyCloseButtonStyles(button: HTMLButtonElement): void {
  const s = button.style;
  s.width = '24px';
  s.height = '24px';
  s.padding = '0';
  s.borderRadius = '6px';
  s.border = '0';
  s.background = 'transparent';
  s.color = 'var(--adt-text-muted, #666)';
  s.cursor = 'pointer';
  s.fontSize = '14px';
  s.lineHeight = '1';
}

function applyChipHostStyles(host: HTMLElement, hasChip: boolean): void {
  const s = host.style;
  // Collapse the slot when there is no chip so the textarea sits close to
  // the header — otherwise the constant top padding stacks with the
  // textarea's own margin and the empty state looks oversized.
  s.padding = hasChip ? '10px 12px 0 12px' : '0';
  s.minHeight = '0';
}

function applyErrorBannerStyles(banner: HTMLElement): void {
  const s = banner.style;
  // Slim row that sits flush against the chip slot above. Tinted error
  // background (token with literal fallback) plus a hairline border so the
  // banner reads as a runtime-error surface, not part of the conversation.
  s.display = 'none';
  s.alignItems = 'center';
  s.justifyContent = 'space-between';
  s.gap = '8px';
  s.margin = '8px 12px 0 12px';
  s.padding = '6px 10px';
  s.borderRadius = '8px';
  s.background = 'var(--adt-error-bg, rgba(229, 72, 77, 0.12))';
  s.border = '1px solid var(--adt-error-border, rgba(229, 72, 77, 0.35))';
  s.color = 'var(--adt-error-text-strong, #b51a1d)';
  s.fontSize = '12px';
  s.lineHeight = '1.4';
}

function applyErrorBannerTextStyles(text: HTMLElement): void {
  const s = text.style;
  s.flex = '1 1 auto';
  s.minWidth = '0';
  s.overflow = 'hidden';
  s.textOverflow = 'ellipsis';
  s.whiteSpace = 'nowrap';
  s.fontWeight = '500';
}

function applyErrorBannerActionStyles(button: HTMLButtonElement): void {
  const s = button.style;
  s.display = 'inline-flex';
  s.alignItems = 'center';
  s.padding = '2px 10px';
  s.borderRadius = '999px';
  s.border = '1px solid var(--adt-error-border, rgba(229, 72, 77, 0.6))';
  s.background = 'var(--adt-error, #e5484d)';
  s.color = 'var(--adt-error-text, #ffffff)';
  s.fontSize = '11px';
  s.fontWeight = '600';
  s.cursor = 'pointer';
  s.fontFamily = 'inherit';
  s.lineHeight = '1.4';
  s.whiteSpace = 'nowrap';
}

function applyChipStyles(chip: HTMLElement): void {
  const s = chip.style;
  s.display = 'inline-flex';
  s.alignItems = 'center';
  s.gap = '6px';
  s.padding = '4px 8px';
  s.borderRadius = '999px';
  // Solid fill + subtle border so the chip never reads as transparent
  // against the conversation stream rendered above it inside the panel.
  // A previous 6% alpha tint visually disappeared once a few messages
  // landed behind the chip host slot. See CHIP_BG / CHIP_BORDER for the
  // opacity contract.
  s.background = CHIP_BG;
  s.border = CHIP_BORDER;
  s.color = 'var(--adt-text, #1a1a1a)';
  s.fontSize = '12px';
  s.maxWidth = '100%';
  // overflow is hidden on the LABEL (see populateChipTooltip / chip label
  // construction); keep the chip itself visible so the absolutely-positioned
  // tooltip can render outside the chip's content box.
  s.whiteSpace = 'nowrap';
  // Anchor the absolutely-positioned tooltip and remove the focus outline in
  // favor of a softer ring so the keyboard-focus state matches the widget's
  // visual language.
  s.position = 'relative';
  s.outline = 'none';
  s.cursor = 'help';
}

interface PickedSummary {
  readonly componentName: string;
  readonly tag: string;
  readonly source: string | null;
  readonly chain: string | null;
  readonly selector: string | null;
}

function summarizePicked(picked: PickedEvidence): PickedSummary {
  const componentName = picked.componentName || picked.tagName.toLowerCase();
  const tag = `<${picked.tagName.toLowerCase()}>`;
  const source = picked.source ? `${picked.source.fileName}:${picked.source.lineNumber}` : null;
  const chainNames = picked.componentChain
    .map((entry) => entry.componentName)
    .filter((name) => name && name !== componentName);
  const chain = chainNames.length > 0 ? chainNames.join(' → ') : null;
  const selector =
    picked.selector && picked.selector !== picked.tagName.toLowerCase() ? picked.selector : null;

  return { componentName, tag, source, chain, selector };
}

function applyChipTooltipStyles(tooltip: HTMLElement): void {
  const s = tooltip.style;
  s.position = 'absolute';
  // Sit directly below the chip; left-align with the chip's left edge so
  // the tooltip never clips off the right side of the panel.
  s.top = 'calc(100% + 6px)';
  s.left = '0';
  s.zIndex = '3';
  s.minWidth = '180px';
  s.maxWidth = '320px';
  s.padding = '8px 10px';
  s.borderRadius = '8px';
  s.background = 'var(--adt-accent, #1a1a1a)';
  s.color = 'var(--adt-accent-text, #ffffff)';
  s.fontSize = '11px';
  s.lineHeight = '1.4';
  s.boxShadow = '0 4px 14px var(--adt-shadow, rgba(0, 0, 0, 0.22))';
  s.opacity = '0';
  s.visibility = 'hidden';
  s.transition = 'opacity 120ms ease-out';
  s.pointerEvents = 'none';
  s.whiteSpace = 'normal';
  s.wordBreak = 'break-all';
}

function populateChipTooltip(doc: Document, tooltip: HTMLElement, summary: PickedSummary): void {
  tooltip.innerHTML = '';

  const head = doc.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'baseline';
  head.style.gap = '6px';
  head.style.marginBottom = summary.source || summary.chain || summary.selector ? '6px' : '0';

  const name = doc.createElement('span');
  name.textContent = summary.componentName;
  name.style.fontWeight = '600';
  head.appendChild(name);

  const tag = doc.createElement('span');
  tag.textContent = summary.tag;
  tag.style.fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  tag.style.opacity = '0.72';
  tag.style.fontSize = '10px';
  head.appendChild(tag);
  tooltip.appendChild(head);

  function addRow(labelText: string, valueText: string, mono: boolean): void {
    const row = doc.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';
    row.style.marginTop = '2px';
    const label = doc.createElement('span');
    label.textContent = labelText;
    label.style.opacity = '0.6';
    label.style.flex = '0 0 auto';
    row.appendChild(label);
    const value = doc.createElement('span');
    value.textContent = valueText;
    value.style.flex = '1 1 auto';
    value.style.minWidth = '0';
    if (mono) {
      value.style.fontFamily =
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
    }
    row.appendChild(value);
    tooltip.appendChild(row);
  }

  if (summary.source) addRow('source', summary.source, true);
  if (summary.chain) addRow('chain', summary.chain, false);
  if (summary.selector) addRow('selector', summary.selector, true);
}

function applyChipRemoveStyles(button: HTMLButtonElement): void {
  const s = button.style;
  s.width = '16px';
  s.height = '16px';
  s.padding = '0';
  s.borderRadius = '999px';
  s.border = '0';
  s.background = 'var(--adt-overlay-weak, rgba(0, 0, 0, 0.12))';
  s.color = 'var(--adt-text, #1a1a1a)';
  s.cursor = 'pointer';
  s.fontSize = '10px';
  s.lineHeight = '1';
}

function applyTextareaStyles(textarea: HTMLTextAreaElement): void {
  const s = textarea.style;
  s.margin = '12px';
  s.padding = '8px 10px';
  s.border = '1px solid var(--adt-border, rgba(0, 0, 0, 0.16))';
  s.borderRadius = '8px';
  s.resize = 'none';
  s.fontFamily = 'inherit';
  s.fontSize = '13px';
  s.lineHeight = '1.4';
  s.background = 'var(--adt-surface, #ffffff)';
  s.color = 'var(--adt-text, #1a1a1a)';
  s.outline = 'none';
  // Lock the input to the rows=3 box so the stream area scrolls instead of
  // squeezing the textarea once the conversation history fills the panel.
  s.flex = '0 0 auto';
}

function applyFooterStyles(footer: HTMLElement): void {
  const s = footer.style;
  s.display = 'flex';
  s.justifyContent = 'flex-end';
  s.padding = '0 12px 12px 12px';
  s.gap = '8px';
}

function applySendButtonStyles(button: HTMLButtonElement): void {
  const s = button.style;
  s.padding = '6px 14px';
  s.borderRadius = '8px';
  s.border = '0';
  s.background = 'var(--adt-accent, #1a1a1a)';
  s.color = 'var(--adt-accent-text, #ffffff)';
  s.fontSize = '13px';
  s.fontWeight = '500';
  s.cursor = 'pointer';
}

function applyCommandMenuStyles(menu: HTMLElement): void {
  const s = menu.style;
  // Float just above the textarea (which sits with a 12px margin) without
  // pushing the layout. The textarea reserves a 12px margin on every side, so
  // anchoring at `bottom: 64px` lifts the menu clear of the input box and the
  // footer. Hidden until a qualifying prefix produces matches.
  s.display = 'none';
  s.position = 'absolute';
  s.left = '12px';
  s.right = '12px';
  s.bottom = '64px';
  s.zIndex = '4';
  s.maxHeight = '220px';
  s.overflowY = 'auto';
  s.background = 'var(--adt-surface, #ffffff)';
  s.border = '1px solid var(--adt-border, rgba(0, 0, 0, 0.16))';
  s.borderRadius = '8px';
  s.boxShadow = '0 6px 20px var(--adt-shadow, rgba(0, 0, 0, 0.18))';
  s.padding = '4px';
  s.fontSize = '12px';
}

function applyCommandItemStyles(row: HTMLElement, active: boolean): void {
  const s = row.style;
  s.display = 'flex';
  s.alignItems = 'baseline';
  s.gap = '8px';
  s.padding = '6px 8px';
  s.borderRadius = '6px';
  s.cursor = 'pointer';
  s.background = active ? 'var(--adt-overlay-weak, rgba(0, 0, 0, 0.08))' : 'transparent';
}

function applyCommandNameStyles(name: HTMLElement): void {
  const s = name.style;
  s.fontWeight = '600';
  s.color = 'var(--adt-text, #1a1a1a)';
  s.flex = '0 0 auto';
  s.whiteSpace = 'nowrap';
}

function applyCommandDescStyles(desc: HTMLElement): void {
  const s = desc.style;
  s.color = 'var(--adt-text-muted, #666)';
  s.flex = '1 1 auto';
  s.minWidth = '0';
  s.overflow = 'hidden';
  s.textOverflow = 'ellipsis';
  s.whiteSpace = 'nowrap';
}

function applyCommandHintStyles(hint: HTMLElement): void {
  const s = hint.style;
  s.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  s.color = 'var(--adt-text-muted, #666)';
  s.opacity = '0.8';
  s.fontSize = '11px';
  s.flex = '0 0 auto';
  s.whiteSpace = 'nowrap';
}
