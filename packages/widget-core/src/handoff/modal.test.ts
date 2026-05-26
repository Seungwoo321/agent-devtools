import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHandoffModal, type HandoffModalHandle } from './modal.js';

let active: HandoffModalHandle | null = null;

function mountModal(opts: Parameters<typeof createHandoffModal>[0]): HandoffModalHandle {
  const handle = createHandoffModal(opts);
  active = handle;
  return handle;
}

afterEach(() => {
  active?.destroy();
  active = null;
  document.body.innerHTML = '';
});

function makeContainer(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

describe('createHandoffModal', () => {
  it('mounts in the supplied container and starts hidden', () => {
    const container = makeContainer();
    const handle = mountModal({ container });
    expect(handle.element.parentElement).toBe(container);
    expect(handle.element.style.display).toBe('none');
  });

  it('showLoading reveals the modal and disables the copy button', () => {
    const container = makeContainer();
    const handle = mountModal({ container });
    handle.showLoading();
    expect(handle.element.style.display).toBe('flex');
    const copy = handle.element.querySelector(
      'button[data-agent-devtools-handoff-copy]',
    ) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    const cmd = handle.element.querySelector('pre[data-agent-devtools-handoff-command]');
    expect(cmd?.textContent ?? '').toMatch(/preparing/i);
  });

  it('showReady displays the command, file label and enables Copy', () => {
    const container = makeContainer();
    const handle = mountModal({ container });
    handle.showReady({
      file: '/tmp/agent-devtools-handoff-abc.md',
      command: "claude --append-system-prompt-file '/tmp/agent-devtools-handoff-abc.md'",
    });
    const cmd = handle.element.querySelector('pre[data-agent-devtools-handoff-command]');
    expect(cmd?.textContent ?? '').toContain('--append-system-prompt-file');
    expect(handle.element.textContent ?? '').toContain('/tmp/agent-devtools-handoff-abc.md');
    const copy = handle.element.querySelector(
      'button[data-agent-devtools-handoff-copy]',
    ) as HTMLButtonElement;
    expect(copy.disabled).toBe(false);
  });

  it('showError shows the message and keeps Copy disabled', () => {
    const container = makeContainer();
    const handle = mountModal({ container });
    handle.showError('nope');
    const cmd = handle.element.querySelector('pre[data-agent-devtools-handoff-command]');
    expect(cmd?.textContent ?? '').toContain('nope');
    const copy = handle.element.querySelector(
      'button[data-agent-devtools-handoff-copy]',
    ) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
  });

  it('copy button invokes writeClipboard with the current command and shows "Copied"', async () => {
    const container = makeContainer();
    const writeClipboard = vi.fn(async () => undefined);
    const handle = mountModal({ container, writeClipboard });
    handle.showReady({
      file: '/tmp/x.md',
      command: 'claude --append-system-prompt-file /tmp/x.md',
    });
    const copy = handle.element.querySelector(
      'button[data-agent-devtools-handoff-copy]',
    ) as HTMLButtonElement;
    copy.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writeClipboard).toHaveBeenCalledWith('claude --append-system-prompt-file /tmp/x.md');
    const status = handle.element.querySelector('span[data-agent-devtools-handoff-status]');
    expect(status?.textContent ?? '').toMatch(/copied/i);
  });

  it('copy button surfaces clipboard errors via the status line', async () => {
    const container = makeContainer();
    const writeClipboard = vi.fn(async () => {
      throw new Error('blocked');
    });
    const handle = mountModal({ container, writeClipboard });
    handle.showReady({
      file: '/tmp/x.md',
      command: 'claude --append-system-prompt-file /tmp/x.md',
    });
    (
      handle.element.querySelector('button[data-agent-devtools-handoff-copy]') as HTMLButtonElement
    ).click();
    await new Promise((r) => setTimeout(r, 0));
    const status = handle.element.querySelector('span[data-agent-devtools-handoff-status]');
    expect(status?.textContent ?? '').toMatch(/copy failed: blocked/i);
  });

  it('clicking the close button hides the modal and calls onClose', () => {
    const container = makeContainer();
    const onClose = vi.fn();
    const handle = mountModal({ container, onClose });
    handle.showReady({ file: '/tmp/x.md', command: 'cmd' });
    (
      handle.element.querySelector('button[data-agent-devtools-handoff-close]') as HTMLButtonElement
    ).click();
    expect(handle.element.style.display).toBe('none');
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape on the document hides the modal when open', () => {
    const container = makeContainer();
    const onClose = vi.fn();
    const handle = mountModal({ container, onClose });
    handle.showReady({ file: '/tmp/x.md', command: 'cmd' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handle.element.style.display).toBe('none');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the resume section hidden when the artifact has no resumeCommand', () => {
    const container = makeContainer();
    const handle = mountModal({ container });
    handle.showReady({
      file: '/tmp/x.md',
      command: "claude --append-system-prompt-file '/tmp/x.md'",
    });
    const resumeSection = handle.element.querySelector(
      'pre[data-agent-devtools-handoff-resume-command]',
    )?.parentElement as HTMLElement | null;
    expect(resumeSection).not.toBeNull();
    expect(resumeSection!.style.display).toBe('none');
    const resumeCopy = handle.element.querySelector(
      'button[data-agent-devtools-handoff-resume-copy]',
    ) as HTMLButtonElement;
    expect(resumeCopy.disabled).toBe(true);
  });

  it('reveals the resume section and enables Copy when the artifact includes resumeCommand', () => {
    const container = makeContainer();
    const handle = mountModal({ container });
    handle.showReady({
      file: '/tmp/x.md',
      command: "claude --append-system-prompt-file '/tmp/x.md'",
      resumeCommand: "cd '/Users/dev/project' && claude --resume 'acp-XYZ'",
    });
    const resumeSection = handle.element.querySelector(
      'pre[data-agent-devtools-handoff-resume-command]',
    )?.parentElement as HTMLElement | null;
    expect(resumeSection).not.toBeNull();
    expect(resumeSection!.style.display).not.toBe('none');
    const resumeBox = handle.element.querySelector(
      'pre[data-agent-devtools-handoff-resume-command]',
    );
    expect(resumeBox?.textContent ?? '').toContain('claude --resume');
    const resumeCopy = handle.element.querySelector(
      'button[data-agent-devtools-handoff-resume-copy]',
    ) as HTMLButtonElement;
    expect(resumeCopy.disabled).toBe(false);
  });

  it('resume copy button writes the resume command and shows "Resume command copied"', async () => {
    const container = makeContainer();
    const writeClipboard = vi.fn(async () => undefined);
    const handle = mountModal({ container, writeClipboard });
    handle.showReady({
      file: '/tmp/x.md',
      command: "claude --append-system-prompt-file '/tmp/x.md'",
      resumeCommand: "claude --resume 'acp-XYZ'",
    });
    const resumeCopy = handle.element.querySelector(
      'button[data-agent-devtools-handoff-resume-copy]',
    ) as HTMLButtonElement;
    resumeCopy.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writeClipboard).toHaveBeenCalledWith("claude --resume 'acp-XYZ'");
    const status = handle.element.querySelector('span[data-agent-devtools-handoff-status]');
    expect(status?.textContent ?? '').toMatch(/resume command copied/i);
  });

  it('re-hides the resume section when a subsequent showReady has no resumeCommand', () => {
    const container = makeContainer();
    const handle = mountModal({ container });
    handle.showReady({
      file: '/tmp/x.md',
      command: 'cmd',
      resumeCommand: "claude --resume 'acp-XYZ'",
    });
    const resumeSection = handle.element.querySelector(
      'pre[data-agent-devtools-handoff-resume-command]',
    )?.parentElement as HTMLElement;
    expect(resumeSection.style.display).not.toBe('none');
    // Second handoff (e.g. user opened a new tab, no ACP session yet) — should
    // hide the resume section even though it was previously shown.
    handle.showReady({ file: '/tmp/y.md', command: 'cmd2' });
    expect(resumeSection.style.display).toBe('none');
  });

  it('hides the resume section on showError after a previous resume command was visible', () => {
    const container = makeContainer();
    const handle = mountModal({ container });
    handle.showReady({
      file: '/tmp/x.md',
      command: 'cmd',
      resumeCommand: "claude --resume 'acp-XYZ'",
    });
    handle.showError('boom');
    const resumeSection = handle.element.querySelector(
      'pre[data-agent-devtools-handoff-resume-command]',
    )?.parentElement as HTMLElement;
    expect(resumeSection.style.display).toBe('none');
  });

  it('destroy removes the element and detaches listeners', () => {
    const container = makeContainer();
    const onClose = vi.fn();
    const handle = mountModal({ container, onClose });
    handle.showReady({ file: '/tmp/x.md', command: 'cmd' });
    handle.destroy();
    active = null;
    expect(handle.element.parentElement).toBeNull();
    // After destroy, Escape should not retrigger the close callback.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
