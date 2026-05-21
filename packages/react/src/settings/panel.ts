/**
 * Settings panel that swaps into the composer body when the gear icon is
 * clicked. Lets the user pick a provider runtime and a permission mode and
 * shows the active workspace root (read-only). Closely mirrors React
 * DevTools / TanStack Query DevTools settings UX: an in-panel detail view
 * rather than a separate floating dialog.
 *
 * `bypassPermissions` deserves a visible warning because it disables every
 * permission prompt for the rest of the session — we render it with a
 * caution colour and a one-line explanation. The user must opt in here
 * explicitly; the chat composer has no surface for it by design.
 */
import {
  PERMISSION_MODES,
  PROVIDER_IDS,
  type AgentServerInfo,
  type PermissionMode,
  type ProviderId,
  type Settings,
} from './types.js';
import type { SettingsStore } from './store.js';

const PANEL_ATTR = 'data-agent-devtools-settings';
const PROVIDER_RADIO_ATTR = 'data-agent-devtools-settings-provider';
const PERMISSION_RADIO_ATTR = 'data-agent-devtools-settings-permission';
const WORKSPACE_ATTR = 'data-agent-devtools-settings-workspace';
const CLOSE_ATTR = 'data-agent-devtools-settings-close';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  acp: 'ACP (Claude Code, subprocess)',
  sdk: 'SDK (Claude Agent SDK, in-process)',
};

const PERMISSION_LABELS: Record<PermissionMode, string> = {
  default: 'Default — reject every permission request',
  acceptEdits: 'Accept edits — auto-allow routine file edits (recommended)',
  bypassPermissions: 'Bypass permissions — allow EVERYTHING, no prompts',
  plan: 'Plan — read-only planning mode',
  dontAsk: "Don't ask — same as Accept edits, never surface prompts",
};

export interface CreateSettingsPanelOptions {
  /** Shadow-root container to mount inside. */
  readonly container: HTMLElement;
  /** Document override. Defaults to `container.ownerDocument`. */
  readonly document?: Document;
  /** Settings store this panel reads/writes. */
  readonly store: SettingsStore;
  /** Initial server snapshot (workspace root + registered providers). */
  readonly serverInfo?: AgentServerInfo | null;
  /** Initial visibility. Defaults to false. */
  readonly visible?: boolean;
  /** Called when the user closes the settings view (back to chat). */
  readonly onClose?: () => void;
}

export interface SettingsPanelHandle {
  /** Root panel element. */
  readonly element: HTMLElement;
  /** Update the server snapshot (workspace root display + provider availability). */
  setServerInfo(info: AgentServerInfo | null): void;
  /** Show / hide the panel. */
  setVisible(visible: boolean): void;
  /** Remove the panel and detach listeners. */
  destroy(): void;
}

export function createSettingsPanel(options: CreateSettingsPanelOptions): SettingsPanelHandle {
  const container = options.container;
  const doc = options.document ?? container.ownerDocument;
  if (!doc) throw new Error('createSettingsPanel: container must be in a document');

  let serverInfo: AgentServerInfo | null = options.serverInfo ?? null;
  let visible = options.visible ?? false;
  let destroyed = false;

  const panel = doc.createElement('div');
  panel.setAttribute(PANEL_ATTR, '');
  applyPanelStyles(panel);

  // Header
  const header = doc.createElement('header');
  applyHeaderStyles(header);
  const title = doc.createElement('span');
  title.textContent = 'Settings';
  applyTitleStyles(title);
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute(CLOSE_ATTR, '');
  closeButton.setAttribute('aria-label', 'Close settings');
  closeButton.textContent = '✕';
  applyHeaderCloseStyles(closeButton);
  header.appendChild(title);
  header.appendChild(closeButton);
  panel.appendChild(header);

  // Provider section
  const providerSection = buildSection(doc, 'Provider');
  const providerFieldset = doc.createElement('fieldset');
  applyFieldsetStyles(providerFieldset);
  const providerRadios: Record<ProviderId, HTMLInputElement> = createRadioGroup(
    doc,
    'provider',
    PROVIDER_IDS,
    PROVIDER_LABELS,
    PROVIDER_RADIO_ATTR,
  );
  for (const id of PROVIDER_IDS) {
    providerFieldset.appendChild(providerRadios[id].parentElement as HTMLElement);
  }
  providerSection.body.appendChild(providerFieldset);
  panel.appendChild(providerSection.root);

  // Permission section
  const permissionSection = buildSection(doc, 'Permission Mode');
  const permissionFieldset = doc.createElement('fieldset');
  applyFieldsetStyles(permissionFieldset);
  const permissionRadios: Record<PermissionMode, HTMLInputElement> = createRadioGroup(
    doc,
    'permission',
    PERMISSION_MODES,
    PERMISSION_LABELS,
    PERMISSION_RADIO_ATTR,
  );
  for (const mode of PERMISSION_MODES) {
    const row = permissionRadios[mode].parentElement as HTMLElement;
    if (mode === 'bypassPermissions') applyDangerRowStyles(row);
    permissionFieldset.appendChild(row);
  }
  permissionSection.body.appendChild(permissionFieldset);
  panel.appendChild(permissionSection.root);

  // Workspace section (read-only)
  const workspaceSection = buildSection(doc, 'Workspace Root');
  const workspaceValue = doc.createElement('code');
  workspaceValue.setAttribute(WORKSPACE_ATTR, '');
  applyWorkspaceValueStyles(workspaceValue);
  workspaceSection.body.appendChild(workspaceValue);
  panel.appendChild(workspaceSection.root);

  container.appendChild(panel);

  function renderFromState(settings: Settings): void {
    for (const id of PROVIDER_IDS) {
      providerRadios[id].checked = settings.provider === id;
    }
    for (const mode of PERMISSION_MODES) {
      permissionRadios[mode].checked = settings.permissionMode === mode;
    }
  }

  function renderServerInfo(): void {
    workspaceValue.textContent = serverInfo?.workspaceRoot ?? '(not configured)';
    // Grey out (and disable) provider radios that aren't registered on
    // the server so the user doesn't pick a runtime that would 422 every
    // request.
    if (serverInfo) {
      const available = new Set(serverInfo.providers);
      for (const id of PROVIDER_IDS) {
        const input = providerRadios[id];
        const row = input.parentElement as HTMLElement;
        const isAvailable = available.has(id);
        input.disabled = !isAvailable;
        row.style.opacity = isAvailable ? '1' : '0.5';
      }
    }
  }

  function renderVisibility(): void {
    panel.style.display = visible ? 'flex' : 'none';
  }

  renderFromState(options.store.get());
  renderServerInfo();
  renderVisibility();

  // Live updates from external mutations (orchestrator, tests).
  const unsubscribe = options.store.subscribe(renderFromState);

  // Local mutation handlers.
  function onProviderChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (!target.checked) return;
    const value = target.value as ProviderId;
    options.store.set({ provider: value });
  }
  function onPermissionChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (!target.checked) return;
    const value = target.value as PermissionMode;
    options.store.set({ permissionMode: value });
  }
  function onCloseClick(): void {
    options.onClose?.();
  }

  for (const id of PROVIDER_IDS) {
    providerRadios[id].addEventListener('change', onProviderChange);
  }
  for (const mode of PERMISSION_MODES) {
    permissionRadios[mode].addEventListener('change', onPermissionChange);
  }
  closeButton.addEventListener('click', onCloseClick);

  return {
    element: panel,
    setServerInfo(info): void {
      if (destroyed) return;
      serverInfo = info;
      renderServerInfo();
    },
    setVisible(next): void {
      if (destroyed) return;
      visible = next;
      renderVisibility();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      for (const id of PROVIDER_IDS) {
        providerRadios[id].removeEventListener('change', onProviderChange);
      }
      for (const mode of PERMISSION_MODES) {
        permissionRadios[mode].removeEventListener('change', onPermissionChange);
      }
      closeButton.removeEventListener('click', onCloseClick);
      panel.remove();
    },
  };
}

function buildSection(doc: Document, titleText: string): { root: HTMLElement; body: HTMLElement } {
  const root = doc.createElement('section');
  applySectionStyles(root);
  const heading = doc.createElement('h3');
  heading.textContent = titleText;
  applySectionHeadingStyles(heading);
  const body = doc.createElement('div');
  applySectionBodyStyles(body);
  root.appendChild(heading);
  root.appendChild(body);
  return { root, body };
}

function createRadioGroup<K extends string>(
  doc: Document,
  groupName: string,
  values: readonly K[],
  labels: Record<K, string>,
  inputAttr: string,
): Record<K, HTMLInputElement> {
  // Fresh per-instance name so multiple panels (e.g. tests with two mounts
  // sharing a single document) don't link their radio groups.
  const fullName = `agent-devtools-${groupName}-${randomShortId()}`;
  const out: Partial<Record<K, HTMLInputElement>> = {};
  for (const value of values) {
    const row = doc.createElement('label');
    applyRadioRowStyles(row);
    const input = doc.createElement('input');
    input.type = 'radio';
    input.name = fullName;
    input.value = value;
    input.setAttribute(inputAttr, value);
    const text = doc.createElement('span');
    text.textContent = labels[value];
    applyRadioLabelStyles(text);
    row.appendChild(input);
    row.appendChild(text);
    out[value] = input;
  }
  return out as Record<K, HTMLInputElement>;
}

function randomShortId(): string {
  // Math.random is sufficient — this is purely a uniqueness nonce for DOM
  // `name` attributes, never used for security.
  return Math.random().toString(36).slice(2, 10);
}

function applyPanelStyles(panel: HTMLElement): void {
  const s = panel.style;
  s.position = 'absolute';
  s.inset = '0';
  s.display = 'none';
  s.flexDirection = 'column';
  s.background = '#ffffff';
  s.color = '#1a1a1a';
  s.overflowY = 'auto';
  s.fontFamily = 'inherit';
  s.fontSize = '13px';
}

function applyHeaderStyles(header: HTMLElement): void {
  const s = header.style;
  s.display = 'flex';
  s.alignItems = 'center';
  s.gap = '8px';
  s.padding = '10px 12px';
  s.borderBottom = '1px solid rgba(0, 0, 0, 0.06)';
}

function applyTitleStyles(el: HTMLElement): void {
  const s = el.style;
  s.flex = '1';
  s.fontWeight = '600';
  s.fontSize = '13px';
}

function applyHeaderCloseStyles(button: HTMLButtonElement): void {
  const s = button.style;
  s.width = '24px';
  s.height = '24px';
  s.padding = '0';
  s.borderRadius = '6px';
  s.border = '0';
  s.background = 'transparent';
  s.color = '#666';
  s.cursor = 'pointer';
  s.fontSize = '14px';
  s.lineHeight = '1';
}

function applySectionStyles(section: HTMLElement): void {
  const s = section.style;
  s.padding = '12px';
  s.borderBottom = '1px solid rgba(0, 0, 0, 0.06)';
}

function applySectionHeadingStyles(heading: HTMLElement): void {
  const s = heading.style;
  s.margin = '0 0 8px 0';
  s.fontSize = '12px';
  s.fontWeight = '600';
  s.textTransform = 'uppercase';
  s.letterSpacing = '0.04em';
  s.color = '#666';
}

function applySectionBodyStyles(body: HTMLElement): void {
  const s = body.style;
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '6px';
}

function applyFieldsetStyles(fieldset: HTMLElement): void {
  const s = fieldset.style;
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '6px';
  s.padding = '0';
  s.margin = '0';
  s.border = '0';
}

function applyRadioRowStyles(row: HTMLElement): void {
  const s = row.style;
  s.display = 'flex';
  s.alignItems = 'flex-start';
  s.gap = '8px';
  s.padding = '6px 8px';
  s.borderRadius = '6px';
  s.cursor = 'pointer';
  s.fontSize = '13px';
  s.lineHeight = '1.4';
}

function applyRadioLabelStyles(label: HTMLElement): void {
  const s = label.style;
  s.flex = '1';
}

function applyDangerRowStyles(row: HTMLElement): void {
  const s = row.style;
  s.color = '#a33';
  s.background = 'rgba(255, 0, 0, 0.04)';
}

function applyWorkspaceValueStyles(value: HTMLElement): void {
  const s = value.style;
  s.display = 'block';
  s.padding = '8px 10px';
  s.background = 'rgba(0, 0, 0, 0.04)';
  s.borderRadius = '6px';
  s.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  s.fontSize = '12px';
  s.wordBreak = 'break-all';
}
