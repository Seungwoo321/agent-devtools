import { describe, expect, it } from 'vitest';
import { buildHandoffMarkdown, writeHandoffArtifact } from './handoff.js';

describe('buildHandoffMarkdown', () => {
  it('renders the title + intro even when nothing else is supplied', async () => {
    const md = await buildHandoffMarkdown({ conversation: [] });
    expect(md).toContain('# agent-devtools handoff');
    expect(md).toContain('continue this conversation in their terminal');
  });

  it('renders prior conversation turns in order with role markers', async () => {
    const md = await buildHandoffMarkdown({
      conversation: [
        { role: 'user', text: 'fix the button' },
        { role: 'assistant', text: "I'll check the click handler." },
        { role: 'user', text: 'thanks' },
      ],
    });
    const userIdx = md.indexOf('**[user]**\n\nfix the button');
    const assistantIdx = md.indexOf("**[assistant]**\n\nI'll check the click handler.");
    const userIdx2 = md.indexOf('**[user]**\n\nthanks');
    expect(userIdx).toBeGreaterThan(-1);
    expect(assistantIdx).toBeGreaterThan(userIdx);
    expect(userIdx2).toBeGreaterThan(assistantIdx);
  });

  it('drops empty / whitespace-only turns to avoid empty role blocks', async () => {
    const md = await buildHandoffMarkdown({
      conversation: [
        { role: 'user', text: 'real prompt' },
        { role: 'assistant', text: '   ' },
        { role: 'user', text: '' },
      ],
    });
    expect(md).toContain('real prompt');
    // No empty assistant block — the marker should only appear once.
    expect(md.match(/\*\*\[assistant\]\*\*/g)).toBeNull();
  });

  it('omits the conversation section entirely when no turns survive trimming', async () => {
    const md = await buildHandoffMarkdown({
      conversation: [{ role: 'user', text: '   ' }],
    });
    expect(md).not.toContain('## Prior conversation');
  });

  it('rewrites the context-preamble bracket markers into markdown headings', async () => {
    const md = await buildHandoffMarkdown({
      conversation: [],
      pageContext: { url: 'http://localhost:5173/checkout' },
      picked: { tagName: 'BUTTON', componentName: 'SubmitButton' },
    });
    expect(md).toContain('## Page context');
    expect(md).toContain('URL: http://localhost:5173/checkout');
    expect(md).toContain('## Picked element');
    expect(md).toContain('Component: SubmitButton');
    expect(md).not.toContain('[Page Context]');
    expect(md).not.toContain('[Picked Element]');
  });

  it('omits the permission mode section when the field is missing', async () => {
    const md = await buildHandoffMarkdown({ conversation: [] });
    expect(md).not.toContain('## Widget permission mode');
  });

  it('renders the permission mode as informational, not authoritative', async () => {
    const md = await buildHandoffMarkdown({
      conversation: [],
      permissionMode: 'bypassPermissions',
    });
    expect(md).toContain('## Widget permission mode');
    expect(md).toContain('`bypassPermissions`');
    expect(md).toContain('informational');
  });

  it('includes the workspace root when one is supplied', async () => {
    const md = await buildHandoffMarkdown(
      { conversation: [] },
      { workspaceRoot: '/Users/dev/project' },
    );
    expect(md).toContain('## Workspace');
    expect(md).toContain('/Users/dev/project');
  });

  it('terminates the output with a single trailing newline', async () => {
    const md = await buildHandoffMarkdown({ conversation: [] });
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
  });
});

describe('writeHandoffArtifact', () => {
  it('writes the markdown under the configured tmpDir with the expected filename', async () => {
    const writes: Array<{ path: string; contents: string }> = [];
    const result = await writeHandoffArtifact(
      { conversation: [{ role: 'user', text: 'hi' }] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async (path, contents) => {
          writes.push({ path, contents });
        },
      },
    );
    expect(result.file).toBe('/var/tmp/test/agent-devtools-handoff-fixed-id.md');
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe(result.file);
    expect(writes[0]!.contents).toContain('# agent-devtools handoff');
    expect(writes[0]!.contents).toContain('hi');
  });

  it('returns a shell command that single-quotes the file path', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async () => undefined,
      },
    );
    expect(result.command).toBe(
      "claude --append-system-prompt-file '/var/tmp/test/agent-devtools-handoff-fixed-id.md'",
    );
  });

  it('POSIX-escapes embedded apostrophes in the path (defensive — tmpDir is server-controlled)', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: "/var/tmp/it's weird",
        generateId: () => 'x',
        writeFile: async () => undefined,
      },
    );
    expect(result.command).toContain("'/var/tmp/it'\\''s weird/agent-devtools-handoff-x.md'");
  });

  it('prefixes the command with cd to the workspace root when one is configured', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async () => undefined,
        workspaceRoot: '/Users/dev/project',
      },
    );
    expect(result.command).toBe(
      "cd '/Users/dev/project' && claude --append-system-prompt-file '/var/tmp/test/agent-devtools-handoff-fixed-id.md'",
    );
  });

  it('omits the cd prefix when no workspace root is configured', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async () => undefined,
      },
    );
    expect(result.command.startsWith('cd ')).toBe(false);
    expect(result.command).toBe(
      "claude --append-system-prompt-file '/var/tmp/test/agent-devtools-handoff-fixed-id.md'",
    );
  });

  it('POSIX-escapes embedded apostrophes in the workspace root', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async () => undefined,
        workspaceRoot: "/Users/dev/it's project",
      },
    );
    expect(result.command).toContain("cd '/Users/dev/it'\\''s project' && ");
  });

  it('omits resumeCommand when no acpSessionId is provided', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async () => undefined,
        workspaceRoot: '/Users/dev/project',
      },
    );
    expect(result.resumeCommand).toBeUndefined();
  });

  it('emits a cd-prefixed resumeCommand when both workspaceRoot and acpSessionId are present', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async () => undefined,
        workspaceRoot: '/Users/dev/project',
        acpSessionId: 'acp-session-abc123',
      },
    );
    expect(result.resumeCommand).toBe(
      "cd '/Users/dev/project' && claude --resume 'acp-session-abc123'",
    );
  });

  it('emits a bare resumeCommand when only acpSessionId is present', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async () => undefined,
        acpSessionId: 'acp-session-abc123',
      },
    );
    expect(result.resumeCommand).toBe("claude --resume 'acp-session-abc123'");
  });

  it('POSIX-escapes embedded apostrophes in the acpSessionId', async () => {
    const result = await writeHandoffArtifact(
      { conversation: [] },
      {
        tmpDir: '/var/tmp/test',
        generateId: () => 'fixed-id',
        writeFile: async () => undefined,
        acpSessionId: "weird'id",
      },
    );
    expect(result.resumeCommand).toBe("claude --resume 'weird'\\''id'");
  });
});
