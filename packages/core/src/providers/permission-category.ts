/**
 * Single source of truth for collapsing a tool invocation into a permission
 * category. The two transports describe the *same* tool universe in different
 * vocabularies — the ACP runtime receives an ACP `ToolKind` string, while the
 * SDK `canUseTool` callback receives a Claude Code tool *name* — so each needs
 * its own mapping function. But both must agree on the resulting taxonomy, or
 * the same action would be governed by different policy buckets depending on
 * which provider is active. Keeping both maps in this one module (rather than
 * one per provider file) makes that taxonomy reviewable in a single place and
 * lets {@link permission-category.test.ts} pin the two vocabularies together.
 */
import type { PermissionPolicy } from './acp.js';

/**
 * The security bucket a tool invocation collapses into.
 *
 *   - `fileEdit` — workspace mutations.
 *   - `bash`     — shell side-effects.
 *   - `webFetch` — outbound network.
 *   - `mcpTool`  — third-party / unrecognized tools (conservative default).
 *   - `safeRead` — pure-read tools, *outside* {@link PermissionPolicy}: always
 *                  auto-allowed because the agent cannot make progress without
 *                  them and they have no write/network/process side effects.
 */
export type PermissionCategory = keyof PermissionPolicy | 'safeRead';

/**
 * Map an ACP `ToolKind` into a {@link PermissionCategory}. Unknown / null /
 * unrecognized kinds bucket into `mcpTool` so they inherit the conservative
 * MCP default rather than silently running. ACP can extend `ToolKind`, so the
 * default also future-proofs against new kinds added in newer SDK releases.
 */
export function categorizeToolKind(kind: string | null | undefined): PermissionCategory {
  switch (kind) {
    case 'edit':
    case 'delete':
    case 'move':
      return 'fileEdit';
    case 'execute':
      return 'bash';
    case 'fetch':
      return 'webFetch';
    case 'read':
    case 'search':
    case 'think':
    case 'switch_mode':
      return 'safeRead';
    case 'other':
    default:
      return 'mcpTool';
  }
}

/**
 * Map a Claude Code SDK tool *name* into a {@link PermissionCategory}. Built-in
 * tool names are stable enough to enumerate; anything unrecognized falls
 * through to `mcpTool` so third-party MCP tools (which arrive as
 * `mcp__<server>__<tool>`) inherit the conservative MCP default rather than
 * silently running.
 */
export function categorizeSdkToolName(toolName: string): PermissionCategory {
  switch (toolName) {
    case 'Read':
    case 'Glob':
    case 'Grep':
    case 'WebSearch':
    case 'NotebookRead':
    case 'TodoWrite':
      return 'safeRead';
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
    case 'MultiEdit':
      return 'fileEdit';
    case 'Bash':
    case 'BashOutput':
    case 'KillBash':
      return 'bash';
    case 'WebFetch':
      return 'webFetch';
    default:
      return 'mcpTool';
  }
}
