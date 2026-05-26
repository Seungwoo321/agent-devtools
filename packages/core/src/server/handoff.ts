/**
 * Terminal handoff — bridges the in-browser widget conversation to a
 * full-fidelity terminal `claude` session.
 *
 * The widget is fine for quick "fix this button" loops, but deep work
 * (multi-file refactors, long debugging arcs) is better served by the
 * terminal CLI: native tooling, no transport hops, no permission UX
 * gymnastics. Switching usually means losing context — the picked
 * element's evidence, the page state, the prior turns. P4 closes that
 * gap by emitting up to two paste-ready commands the user can choose
 * between.
 *
 * Two continuation paths (the widget shows whichever the server emits):
 *
 *   1. `claude --resume <acpSessionId>` — when the widget conversation
 *      ran against the ACP provider, the same session ID the runtime
 *      handed the spawned `@agentclientprotocol/claude-agent-acp` is
 *      also a first-class Claude CLI `--resume` target (CLI / ACP share
 *      the on-disk `~/.claude/projects/<cwd>/<sessionId>.jsonl` store).
 *      Preserves the message structure and the prompt cache, so the
 *      terminal turn that follows is a true resumption rather than a
 *      fresh conversation that happens to know the prior context. The
 *      `AcpSessionStore` keeps the `(cwd, clientSessionId) →
 *      acpSessionId` mapping the route looks up.
 *
 *   2. `claude --append-system-prompt-file <md>` — always emitted.
 *      Starts a fresh CLI conversation seeded with the widget exchange
 *      as appended system context. Works regardless of which provider
 *      ran the widget (SDK, future custom providers), survives session
 *      storage rotation, and is what the user gets when no ACP session
 *      ID was recorded for this tab. The markdown is appended (not
 *      replaced) so the CLI's normal system prompt + `--add-dir` /
 *      CLAUDE.md autoloads still apply.
 *
 * The `--append-system-prompt-file` flag is hidden from the main help
 * but documented in `claude --bare`'s description and accepted by the
 * CLI's flag parser. The file argument means we never have to
 * shell-quote multi-line markdown.
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
  /**
   * `claude --append-system-prompt-file <md>` paste-ready command.
   * Always present — starts a fresh CLI conversation seeded with the
   * widget exchange. Works regardless of which provider ran.
   */
  readonly command: string;
  /**
   * `claude --resume <acpSessionId>` paste-ready command. Present only
   * when the route resolved an ACP session for the widget's current
   * `clientSessionId` — preserves the message structure and prompt
   * cache, so the terminal turn that follows is a true resumption.
   * Omitted when no ACP session was recorded (SDK provider, fresh tab,
   * pruned session store).
   */
  readonly resumeCommand?: string;
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
  /**
   * ACP session id resolved for the widget's current `clientSessionId`.
   * When set, the artifact carries a sibling `resumeCommand` of the
   * form `cd <ws> && claude --resume <id>` (or the bare `claude
   * --resume <id>` when `workspaceRoot` is absent).
   */
  readonly acpSessionId?: string;
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
  // Prefix `cd <workspace>` when the server was started with a workspace so
  // the pasted command runs against the project the widget was acting on,
  // not whichever directory the user's terminal happened to be in. The
  // command remains a bare `claude …` invocation when no workspace is
  // configured (e.g. running against the raw CWD).
  const baseCommand = `claude --append-system-prompt-file ${shellQuote(file)}`;
  const command = options.workspaceRoot
    ? `cd ${shellQuote(options.workspaceRoot)} && ${baseCommand}`
    : baseCommand;
  if (!options.acpSessionId) return { file, command };
  const baseResume = `claude --resume ${shellQuote(options.acpSessionId)}`;
  const resumeCommand = options.workspaceRoot
    ? `cd ${shellQuote(options.workspaceRoot)} && ${baseResume}`
    : baseResume;
  return { file, command, resumeCommand };
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
