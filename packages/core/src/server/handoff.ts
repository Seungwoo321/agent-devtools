/**
 * Terminal handoff — bridges the in-browser widget conversation to a
 * full-fidelity terminal `claude` session.
 *
 * The widget is fine for quick "fix this button" loops, but deep work
 * (multi-file refactors, long debugging arcs) is better served by the
 * terminal CLI: native tooling, no transport hops, no permission UX
 * gymnastics. Switching usually means losing context — the picked
 * element's evidence, the page state, the prior turns. P4 closes that
 * gap.
 *
 * Approach: `claude --append-system-prompt-file <md>`
 *
 *   - Honest about the boundary. The terminal session is a *new*
 *     conversation that *knows about* the prior widget exchange,
 *     not a resume of the same conversation. The two runtimes don't
 *     share session storage (ACP / SDK provider vs. Claude CLI's own
 *     `~/.claude/projects/` session JSONL), and reverse-engineering
 *     the CLI's JSONL schema couples us to undocumented internals
 *     that evolve per release.
 *   - Uses a hidden but stable CLI flag (`--append-system-prompt-file`)
 *     surfaced by `claude --bare`'s help text. The file path argument
 *     means we never have to shell-quote multi-line markdown.
 *   - The markdown is appended (not replaced) so the CLI's normal
 *     system prompt and `--add-dir` / CLAUDE.md autoloads still apply;
 *     our content is supplementary context, not a replacement.
 *
 * Lifecycle of the temp file
 *
 *   The handoff markdown is written to a per-request file under
 *   `os.tmpdir()` and never cleaned up by us — the OS reaps `/tmp` on
 *   reboot, and a few KB of orphan files between reboots is cheap
 *   relative to the alternative (deleting before the user has actually
 *   pasted the command into their terminal). The filename is
 *   randomized so concurrent handoffs don't collide.
 */
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatContextPreamble } from '../providers/context-preamble.js';
import type { FileTools } from '../files/index.js';
import type { PermissionMode } from './app.js';

/** One conversational turn the widget reproduced into the handoff payload. */
export interface HandoffTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface HandoffRequestPayload {
  /**
   * Full widget conversation in chronological order. The widget's
   * MessageStore is the source of truth — tool calls / tool results are
   * intentionally NOT included; the terminal CLI has its own tools and
   * can re-run anything it needs. We carry the conversational signal,
   * not the trace.
   */
  readonly conversation: readonly HandoffTurn[];
  /** Picked element evidence the widget sent on the last turn. */
  readonly picked?: unknown;
  /** Page context the widget sent on the last turn. */
  readonly pageContext?: unknown;
  /** The widget's resolved permissionMode at handoff time. Informational. */
  readonly permissionMode?: PermissionMode;
}

export interface BuildHandoffMarkdownOptions {
  /**
   * Workspace root displayed in the markdown so the agent knows the
   * project context (the terminal session's own `cwd` is authoritative;
   * this just helps the model orient when `cwd` differs from the path
   * the widget was operating on).
   */
  readonly workspaceRoot?: string;
  /**
   * Workspace-bound file reader used by `formatContextPreamble` to
   * inline source slices around picked-element source positions.
   * Omitted when no workspace is configured — the picked block still
   * renders path-only.
   */
  readonly files?: FileTools;
}

/**
 * Build the markdown body that becomes the appended system prompt.
 *
 * Layout:
 *
 *   # agent-devtools handoff
 *
 *   <intro paragraph>
 *
 *   ## Prior conversation
 *
 *   [user] …
 *   [assistant] …
 *
 *   ## Page context / Picked element / Source slices
 *
 *   <existing context-preamble output, with the section headers
 *   reframed from `[Picked Element]` etc. to markdown `##` headings>
 *
 *   ## Widget permission mode
 *
 *   <mode>
 *
 *   ## Workspace
 *
 *   <root>
 */
export async function buildHandoffMarkdown(
  payload: HandoffRequestPayload,
  options: BuildHandoffMarkdownOptions = {},
): Promise<string> {
  const sections: string[] = [];

  sections.push('# agent-devtools handoff');
  sections.push(
    'The user was working in the in-browser agent-devtools widget and asked to continue this conversation in their terminal. The exchange below is the prior context they saw. Pick up where the last assistant turn left off; the user will type their next message in the terminal.',
  );

  const conversationBlock = renderConversation(payload.conversation);
  if (conversationBlock) {
    sections.push('## Prior conversation');
    sections.push(conversationBlock);
  }

  // Reuse the same picked-element / page-context formatter the agent
  // sees on every turn so the terminal session reads identical evidence.
  // The preamble's section markers (`[Page Context]`, `[Picked Element]`,
  // `[Source Slices]`) get rewritten to markdown headings below — the
  // model parses both fine, but the explicit `## …` form is friendlier
  // when this file is appended verbatim to the system prompt.
  const preamble = await formatContextPreamble(
    {
      ...(payload.pageContext !== undefined && { pageContext: payload.pageContext }),
      ...(payload.picked !== undefined && { picked: payload.picked }),
    },
    {
      ...(options.files !== undefined && { files: options.files }),
    },
  );
  if (preamble.length > 0) {
    sections.push(rewritePreambleHeadings(preamble));
  }

  if (payload.permissionMode) {
    sections.push('## Widget permission mode');
    sections.push(
      `The user had \`${payload.permissionMode}\` selected in the widget. The terminal session's own permission policy applies — this is informational.`,
    );
  }

  if (options.workspaceRoot) {
    sections.push('## Workspace');
    sections.push(options.workspaceRoot);
  }

  return sections.join('\n\n') + '\n';
}

function renderConversation(turns: readonly HandoffTurn[]): string {
  if (turns.length === 0) return '';
  const out: string[] = [];
  for (const turn of turns) {
    const text = turn.text.trim();
    if (text.length === 0) continue;
    out.push(`**[${turn.role}]**`);
    out.push('');
    out.push(text);
    out.push('');
  }
  // Trim trailing blank line so the section flows into the next.
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/**
 * Translate the legacy `[Section]` markers produced by
 * `formatContextPreamble` into markdown `## Section` headings. Keeps
 * the preamble code path stable (it's also used in the streaming
 * preamble where the bracket form is preferred) while rendering
 * this markdown file as proper markdown.
 */
function rewritePreambleHeadings(preamble: string): string {
  return preamble
    .split('\n')
    .map((line) => {
      if (line === '[Page Context]') return '## Page context';
      if (line === '[Picked Element]') return '## Picked element';
      if (line === '[Source Slices]') return '## Source slices';
      return line;
    })
    .join('\n');
}

export interface HandoffArtifact {
  /** Absolute path to the written markdown file. */
  readonly file: string;
  /** Shell command the user pastes into their terminal. */
  readonly command: string;
}

export interface WriteHandoffArtifactOptions extends BuildHandoffMarkdownOptions {
  /**
   * Override the temp directory. Defaults to `os.tmpdir()`. Tests pass
   * an isolated dir so artifacts don't pollute the real `/tmp`.
   */
  readonly tmpDir?: string;
  /**
   * Override the random filename component. Defaults to a v4 UUID.
   * Tests pass a fixed string for deterministic assertions.
   */
  readonly generateId?: () => string;
  /**
   * File write hook. Defaults to `fs.promises.writeFile`. Tests can
   * substitute an in-memory recorder.
   */
  readonly writeFile?: (path: string, contents: string) => Promise<void>;
}

/**
 * Build the markdown, write it under `tmpDir`, and return the file path
 * plus the shell command to run in the terminal.
 */
export async function writeHandoffArtifact(
  payload: HandoffRequestPayload,
  options: WriteHandoffArtifactOptions = {},
): Promise<HandoffArtifact> {
  const markdown = await buildHandoffMarkdown(payload, options);
  const id = (options.generateId ?? randomUUID)();
  const dir = options.tmpDir ?? tmpdir();
  const file = join(dir, `agent-devtools-handoff-${id}.md`);
  const write = options.writeFile ?? defaultWriteFile;
  await write(file, markdown);
  // The `--append-system-prompt-file` flag is not advertised in the
  // main help but is documented in `claude --bare`'s description and
  // accepted by the CLI's flag parser. The shell-quoting of the path
  // is JSON-safe because we control the directory and filename.
  const command = `claude --append-system-prompt-file ${shellQuote(file)}`;
  return { file, command };
}

async function defaultWriteFile(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, 'utf8');
}

/**
 * Minimal POSIX-safe single-quoting: wrap the value in single quotes and
 * escape any literal single quote as `'\''`. Sufficient because our
 * inputs are filenames under a temp dir we control (no embedded quotes
 * expected), but the routine is defensive for safety.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
