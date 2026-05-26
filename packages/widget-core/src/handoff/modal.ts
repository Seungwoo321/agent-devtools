/**
 * Terminal-handoff modal. Renders an overlay that shows the
 * `claude --append-system-prompt-file …` command the server returned,
 * with a Copy-to-clipboard button. Lives in the same shadow root as the
 * composer so it doesn't interact with the host app's CSS / focus.
 *
 * The modal has three observable states:
 *
 *   - `idle` — closed.
 *   - `loading` — request in flight after the user clicked the handoff
 *     button; the overlay is open but the command area shows a spinner
 *     so the user has feedback while the server writes the markdown.
 *   - `ready` — server returned; the command is shown with a Copy
 *     button and the file path under it.
 *   - `error` — the request failed; show the message and a Retry hint.
 *
 * Clipboard write goes through `navigator.clipboard.writeText` with a
 * fall-back to the imperative `document.execCommand('copy')` route for
 * the rare environment that doesn't expose the async clipboard API.
 */

const MODAL_ROOT_ATTR = 'data-agent-devtools-handoff-modal';
const BACKDROP_ATTR = 'data-agent-devtools-handoff-backdrop';
const COMMAND_ATTR = 'data-agent-devtools-handoff-command';
const COPY_ATTR = 'data-agent-devtools-handoff-copy';
const CLOSE_ATTR = 'data-agent-devtools-handoff-close';
const STATUS_ATTR = 'data-agent-devtools-handoff-status';

export interface HandoffResult {
  /** Absolute path to the markdown file the server wrote. */
  readonly file: string;
  /** Shell command for the user to paste into the terminal. */
  readonly command: string;
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
    'Paste this into your terminal to continue the conversation with the same context (picked element, page state, prior turns).';
  applyModalIntroStyles(intro);
  body.appendChild(intro);

  const commandBox = doc.createElement('pre');
  commandBox.setAttribute(COMMAND_ATTR, '');
  applyCommandBoxStyles(commandBox);
  body.appendChild(commandBox);

  const actions = doc.createElement('div');
  applyActionsStyles(actions);
  const copyButton = doc.createElement('button');
  copyButton.type = 'button';
  copyButton.setAttribute(COPY_ATTR, '');
  copyButton.textContent = 'Copy';
  applyCopyButtonStyles(copyButton);
  const status = doc.createElement('span');
  status.setAttribute(STATUS_ATTR, '');
  applyStatusStyles(status);
  actions.appendChild(copyButton);
  actions.appendChild(status);
  body.appendChild(actions);

  const fileLabel = doc.createElement('p');
  applyFileLabelStyles(fileLabel);
  body.appendChild(fileLabel);

  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);
  container.appendChild(backdrop);

  let currentCommand = '';
  let destroyed = false;

  function setStatus(text: string, kind: 'info' | 'error' = 'info'): void {
    status.textContent = text;
    status.style.color = kind === 'error' ? '#b00020' : '#1a7f37';
  }

  function showLoading(): void {
    if (destroyed) return;
    currentCommand = '';
    commandBox.textContent = 'Preparing handoff…';
    copyButton.disabled = true;
    fileLabel.textContent = '';
    setStatus('');
    backdrop.style.display = 'flex';
  }

  function showReady(result: HandoffResult): void {
    if (destroyed) return;
    currentCommand = result.command;
    commandBox.textContent = result.command;
    copyButton.disabled = false;
    fileLabel.textContent = `File: ${result.file}`;
    setStatus('');
    backdrop.style.display = 'flex';
  }

  function showError(message: string): void {
    if (destroyed) return;
    currentCommand = '';
    commandBox.textContent = `Handoff failed: ${message}`;
    copyButton.disabled = true;
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

  function onCopyClick(): void {
    if (!currentCommand) return;
    void (async (): Promise<void> => {
      try {
        await writeClipboard(currentCommand);
        setStatus('Copied');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Copy failed: ${message}`, 'error');
      }
    })();
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
