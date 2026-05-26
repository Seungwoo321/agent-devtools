/**
 * Terminal-handoff modal. Renders an overlay that shows the
 * `claude` paste-ready command(s) the server returned, with
 * Copy-to-clipboard buttons. Lives in the same shadow root as the
 * composer so it doesn't interact with the host app's CSS / focus.
 *
 * The modal has three observable states:
 *
 *   - `idle` — closed.
 *   - `loading` — request in flight after the user clicked the handoff
 *     button; the overlay is open but the command area shows a spinner
 *     so the user has feedback while the server writes the markdown.
 *   - `ready` — server returned; the command(s) are shown each with
 *     its own Copy button, the file path is shown under them. When the
 *     server also resolved an ACP session id for the tab, a second
 *     "Resume the same conversation" option appears side-by-side with
 *     the always-emitted "Start a new session with context" option.
 *   - `error` — the request failed; show the message and a Retry hint.
 *
 * Clipboard write goes through `navigator.clipboard.writeText` with a
 * fall-back to the imperative `document.execCommand('copy')` route for
 * the rare environment that doesn't expose the async clipboard API.
 */

const MODAL_ROOT_ATTR = 'data-agent-devtools-handoff-modal';
const BACKDROP_ATTR = 'data-agent-devtools-handoff-backdrop';
const COMMAND_ATTR = 'data-agent-devtools-handoff-command';
const RESUME_COMMAND_ATTR = 'data-agent-devtools-handoff-resume-command';
const COPY_ATTR = 'data-agent-devtools-handoff-copy';
const RESUME_COPY_ATTR = 'data-agent-devtools-handoff-resume-copy';
const CLOSE_ATTR = 'data-agent-devtools-handoff-close';
const STATUS_ATTR = 'data-agent-devtools-handoff-status';

export interface HandoffResult {
  /** Absolute path to the markdown file the server wrote. */
  readonly file: string;
  /**
   * `claude --append-system-prompt-file <md>` paste-ready command. Always
   * present — starts a fresh CLI conversation seeded with the widget
   * exchange.
   */
  readonly command: string;
  /**
   * `claude --resume <id>` paste-ready command. Present when the server
   * resolved an ACP session id for the tab — picks up the exact same
   * conversation, preserving message structure and prompt cache. Absent
   * when no ACP session was recorded (SDK provider, fresh tab, pruned
   * session store).
   */
  readonly resumeCommand?: string;
}

export interface CreateHandoffModalOptions {
  readonly container: HTMLElement;
  readonly document?: Document;
  /** Called when the user dismisses the modal (Escape / backdrop / ✕). */
  readonly onClose?: () => void;
  /**
   * Override the clipboard writer for tests. Defaults to
   * `navigator.clipboard.writeText` with a `document.execCommand`
   * fall-back.
   */
  readonly writeClipboard?: (text: string) => Promise<void>;
}

export interface HandoffModalHandle {
  readonly element: HTMLElement;
  showLoading(): void;
  showReady(result: HandoffResult): void;
  showError(message: string): void;
  hide(): void;
  destroy(): void;
}

export function createHandoffModal(options: CreateHandoffModalOptions): HandoffModalHandle {
  const container = options.container;
  const doc = options.document ?? container.ownerDocument;
  if (!doc) throw new Error('createHandoffModal: container must be in a document');

  const writeClipboard = options.writeClipboard ?? defaultWriteClipboard;

  const backdrop = doc.createElement('div');
  backdrop.setAttribute(BACKDROP_ATTR, '');
  applyBackdropStyles(backdrop);
  backdrop.style.display = 'none';

  const modal = doc.createElement('div');
  modal.setAttribute(MODAL_ROOT_ATTR, '');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  applyModalStyles(modal);

  const header = doc.createElement('header');
  applyModalHeaderStyles(header);
  const title = doc.createElement('span');
  title.textContent = 'Continue in terminal';
  applyModalTitleStyles(title);
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute(CLOSE_ATTR, '');
  closeButton.setAttribute('aria-label', 'Close handoff modal');
  closeButton.textContent = '✕';
  applyModalCloseStyles(closeButton);
  header.appendChild(title);
  header.appendChild(closeButton);

  const body = doc.createElement('div');
  applyModalBodyStyles(body);

  const intro = doc.createElement('p');
  intro.textContent =
    'Pick one of the commands below and paste it into your terminal. Both carry the picked element, page state, and prior turns.';
  applyModalIntroStyles(intro);
  body.appendChild(intro);

  // ── Resume section (only shown when the server resolved an ACP session id). ──
  const resumeSection = doc.createElement('section');
  applyOptionSectionStyles(resumeSection);
  resumeSection.style.display = 'none';
  const resumeHeading = doc.createElement('h3');
  resumeHeading.textContent = 'Resume the same conversation';
  applyOptionHeadingStyles(resumeHeading);
  const resumeCaption = doc.createElement('p');
  resumeCaption.textContent =
    'Picks up the exact session the widget was running. Preserves the message structure and the prompt cache.';
  applyOptionCaptionStyles(resumeCaption);
  const resumeCommandBox = doc.createElement('pre');
  resumeCommandBox.setAttribute(RESUME_COMMAND_ATTR, '');
  applyCommandBoxStyles(resumeCommandBox);
  const resumeActions = doc.createElement('div');
  applyActionsStyles(resumeActions);
  const resumeCopyButton = doc.createElement('button');
  resumeCopyButton.type = 'button';
  resumeCopyButton.setAttribute(RESUME_COPY_ATTR, '');
  resumeCopyButton.textContent = 'Copy resume command';
  applyCopyButtonStyles(resumeCopyButton);
  resumeActions.appendChild(resumeCopyButton);
  resumeSection.appendChild(resumeHeading);
  resumeSection.appendChild(resumeCaption);
  resumeSection.appendChild(resumeCommandBox);
  resumeSection.appendChild(resumeActions);
  body.appendChild(resumeSection);

  // ── Append-system-prompt section (always shown when ready). ──
  const appendSection = doc.createElement('section');
  applyOptionSectionStyles(appendSection);
  const appendHeading = doc.createElement('h3');
  appendHeading.textContent = 'Start a new session with context';
  applyOptionHeadingStyles(appendHeading);
  const appendCaption = doc.createElement('p');
  appendCaption.textContent =
    'Opens a fresh CLI conversation seeded with the widget context. Works regardless of provider and survives session-storage changes.';
  applyOptionCaptionStyles(appendCaption);
  const commandBox = doc.createElement('pre');
  commandBox.setAttribute(COMMAND_ATTR, '');
  applyCommandBoxStyles(commandBox);
  const actions = doc.createElement('div');
  applyActionsStyles(actions);
  const copyButton = doc.createElement('button');
  copyButton.type = 'button';
  copyButton.setAttribute(COPY_ATTR, '');
  copyButton.textContent = 'Copy command';
  applyCopyButtonStyles(copyButton);
  actions.appendChild(copyButton);
  appendSection.appendChild(appendHeading);
  appendSection.appendChild(appendCaption);
  appendSection.appendChild(commandBox);
  appendSection.appendChild(actions);
  body.appendChild(appendSection);

  // ── Shared status + file label sit below both sections. ──
  const status = doc.createElement('span');
  status.setAttribute(STATUS_ATTR, '');
  applyStatusStyles(status);
  body.appendChild(status);

  const fileLabel = doc.createElement('p');
  applyFileLabelStyles(fileLabel);
  body.appendChild(fileLabel);

  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);
  container.appendChild(backdrop);

  let currentCommand = '';
  let currentResumeCommand = '';
  let destroyed = false;

  function setStatus(text: string, kind: 'info' | 'error' = 'info'): void {
    status.textContent = text;
    status.style.color = kind === 'error' ? '#b00020' : '#1a7f37';
  }

  function showLoading(): void {
    if (destroyed) return;
    currentCommand = '';
    currentResumeCommand = '';
    commandBox.textContent = 'Preparing handoff…';
    copyButton.disabled = true;
    resumeSection.style.display = 'none';
    resumeCommandBox.textContent = '';
    resumeCopyButton.disabled = true;
    fileLabel.textContent = '';
    setStatus('');
    backdrop.style.display = 'flex';
  }

  function showReady(result: HandoffResult): void {
    if (destroyed) return;
    currentCommand = result.command;
    commandBox.textContent = result.command;
    copyButton.disabled = false;
    if (result.resumeCommand && result.resumeCommand.length > 0) {
      currentResumeCommand = result.resumeCommand;
      resumeCommandBox.textContent = result.resumeCommand;
      resumeCopyButton.disabled = false;
      resumeSection.style.display = 'flex';
    } else {
      currentResumeCommand = '';
      resumeCommandBox.textContent = '';
      resumeCopyButton.disabled = true;
      resumeSection.style.display = 'none';
    }
    fileLabel.textContent = `File: ${result.file}`;
    setStatus('');
    backdrop.style.display = 'flex';
  }

  function showError(message: string): void {
    if (destroyed) return;
    currentCommand = '';
    currentResumeCommand = '';
    commandBox.textContent = `Handoff failed: ${message}`;
    copyButton.disabled = true;
    resumeSection.style.display = 'none';
    resumeCommandBox.textContent = '';
    resumeCopyButton.disabled = true;
    fileLabel.textContent = '';
    setStatus('');
    backdrop.style.display = 'flex';
  }

  function hide(): void {
    if (destroyed) return;
    backdrop.style.display = 'none';
    setStatus('');
  }

  function onClose(): void {
    hide();
    options.onClose?.();
  }

  function onBackdropClick(event: MouseEvent): void {
    if (event.target === backdrop) onClose();
  }

  async function copyText(text: string, label: string): Promise<void> {
    try {
      await writeClipboard(text);
      setStatus(`${label} copied`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Copy failed: ${message}`, 'error');
    }
  }

  function onCopyClick(): void {
    if (!currentCommand) return;
    void copyText(currentCommand, 'Command');
  }

  function onResumeCopyClick(): void {
    if (!currentResumeCommand) return;
    void copyText(currentResumeCommand, 'Resume command');
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && backdrop.style.display !== 'none') {
      event.preventDefault();
      onClose();
    }
  }

  closeButton.addEventListener('click', onClose);
  backdrop.addEventListener('click', onBackdropClick);
  copyButton.addEventListener('click', onCopyClick);
  resumeCopyButton.addEventListener('click', onResumeCopyClick);
  doc.addEventListener('keydown', onKeyDown);

  return {
    element: backdrop,
    showLoading,
    showReady,
    showError,
    hide,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      closeButton.removeEventListener('click', onClose);
      backdrop.removeEventListener('click', onBackdropClick);
      copyButton.removeEventListener('click', onCopyClick);
      resumeCopyButton.removeEventListener('click', onResumeCopyClick);
      doc.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
    },
  };
}

async function defaultWriteClipboard(text: string): Promise<void> {
  // Prefer the async clipboard API; many browsers gate it behind a
  // user-gesture, which a click handler satisfies.
  const nav = globalThis.navigator as Navigator | undefined;
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return;
  }
  // Fallback path for environments without async clipboard. We create a
  // throwaway textarea, select it, and use the legacy `execCommand`.
  const doc = globalThis.document as Document | undefined;
  if (!doc) throw new Error('clipboard not available');
  const ta = doc.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  doc.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const ok = doc.execCommand('copy');
    if (!ok) throw new Error('execCommand(copy) returned false');
  } finally {
    ta.remove();
  }
}

function applyBackdropStyles(el: HTMLElement): void {
  const s = el.style;
  s.position = 'fixed';
  s.inset = '0';
  s.background = 'rgba(0, 0, 0, 0.45)';
  s.display = 'flex';
  s.alignItems = 'center';
  s.justifyContent = 'center';
  s.zIndex = '2147483647';
  s.fontFamily = 'inherit';
}

function applyModalStyles(el: HTMLElement): void {
  const s = el.style;
  s.width = 'min(560px, calc(100vw - 32px))';
  s.maxHeight = 'calc(100vh - 64px)';
  s.background = '#ffffff';
  s.color = '#1a1a1a';
  s.borderRadius = '12px';
  s.boxShadow = '0 24px 48px rgba(0, 0, 0, 0.32)';
  s.display = 'flex';
  s.flexDirection = 'column';
  s.overflow = 'hidden';
  s.fontSize = '13px';
}

function applyModalHeaderStyles(el: HTMLElement): void {
  const s = el.style;
  s.display = 'flex';
  s.alignItems = 'center';
  s.gap = '8px';
  s.padding = '12px 16px';
  s.borderBottom = '1px solid rgba(0, 0, 0, 0.08)';
}

function applyModalTitleStyles(el: HTMLElement): void {
  const s = el.style;
  s.flex = '1';
  s.fontWeight = '600';
  s.fontSize = '14px';
}

function applyModalCloseStyles(el: HTMLButtonElement): void {
  const s = el.style;
  s.width = '28px';
  s.height = '28px';
  s.borderRadius = '6px';
  s.border = '0';
  s.background = 'transparent';
  s.color = '#1a1a1a';
  s.fontSize = '16px';
  s.cursor = 'pointer';
}

function applyModalBodyStyles(el: HTMLElement): void {
  const s = el.style;
  s.padding = '16px';
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '12px';
  s.overflow = 'auto';
}

function applyModalIntroStyles(el: HTMLElement): void {
  const s = el.style;
  s.margin = '0';
  s.color = '#3a3a3a';
  s.lineHeight = '1.5';
}

function applyCommandBoxStyles(el: HTMLElement): void {
  const s = el.style;
  s.margin = '0';
  s.padding = '10px 12px';
  s.background = '#f5f5f5';
  s.border = '1px solid rgba(0, 0, 0, 0.08)';
  s.borderRadius = '8px';
  s.fontFamily = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
  s.fontSize = '12px';
  s.whiteSpace = 'pre-wrap';
  s.wordBreak = 'break-all';
}

function applyActionsStyles(el: HTMLElement): void {
  const s = el.style;
  s.display = 'flex';
  s.alignItems = 'center';
  s.gap = '12px';
}

function applyCopyButtonStyles(el: HTMLButtonElement): void {
  const s = el.style;
  s.padding = '6px 14px';
  s.border = '1px solid rgba(0, 0, 0, 0.16)';
  s.borderRadius = '8px';
  s.background = '#1a1a1a';
  s.color = '#ffffff';
  s.fontSize = '13px';
  s.fontWeight = '600';
  s.cursor = 'pointer';
}

function applyStatusStyles(el: HTMLElement): void {
  const s = el.style;
  s.fontSize = '12px';
  s.fontWeight = '500';
}

function applyFileLabelStyles(el: HTMLElement): void {
  const s = el.style;
  s.margin = '0';
  s.fontSize = '11px';
  s.color = '#6a6a6a';
  s.fontFamily = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
}

function applyOptionSectionStyles(el: HTMLElement): void {
  const s = el.style;
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '8px';
  s.padding = '12px';
  s.border = '1px solid rgba(0, 0, 0, 0.08)';
  s.borderRadius = '8px';
  s.background = '#fafafa';
}

function applyOptionHeadingStyles(el: HTMLElement): void {
  const s = el.style;
  s.margin = '0';
  s.fontSize = '13px';
  s.fontWeight = '600';
  s.color = '#1a1a1a';
}

function applyOptionCaptionStyles(el: HTMLElement): void {
  const s = el.style;
  s.margin = '0';
  s.fontSize = '12px';
  s.lineHeight = '1.45';
  s.color = '#4a4a4a';
}
