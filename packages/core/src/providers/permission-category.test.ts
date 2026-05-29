/**
 * Cross-vocabulary parity matrix for the permission category taxonomy.
 *
 * The ACP runtime and the SDK provider describe the same tool universe in two
 * different vocabularies — an ACP `ToolKind` string vs a Claude Code tool
 * *name*. They must collapse into the *same* category, or the same action
 * would be governed by a different policy bucket depending on which provider
 * is active. This file pins both maps together: each row asserts that a
 * representative ToolKind and tool name resolve to one shared category, plus
 * the full per-vocabulary enumerations so a future edit to one map without the
 * other fails the build.
 */
import { describe, expect, it } from 'vitest';
import type { ToolKind } from '@agentclientprotocol/sdk';
import {
  categorizeSdkToolName,
  categorizeToolKind,
  type PermissionCategory,
} from './permission-category.js';

describe('permission category parity (ACP kind ↔ SDK name)', () => {
  // [concept, ACP ToolKind, SDK tool name, shared category]
  const parity: ReadonlyArray<[string, ToolKind, string, PermissionCategory]> = [
    ['file mutation', 'edit', 'Edit', 'fileEdit'],
    ['shell', 'execute', 'Bash', 'bash'],
    ['outbound network', 'fetch', 'WebFetch', 'webFetch'],
    ['pure read', 'read', 'Read', 'safeRead'],
    ['unknown / third-party', 'other', 'mcp__server__tool', 'mcpTool'],
  ];

  it.each(parity)(
    '%s: kind %s and name %s both resolve to %s',
    (_concept, kind, name, expected) => {
      expect(categorizeToolKind(kind)).toBe(expected);
      expect(categorizeSdkToolName(name)).toBe(expected);
    },
  );
});

describe('categorizeToolKind', () => {
  const matrix: ReadonlyArray<[ToolKind, PermissionCategory]> = [
    ['edit', 'fileEdit'],
    ['delete', 'fileEdit'],
    ['move', 'fileEdit'],
    ['execute', 'bash'],
    ['fetch', 'webFetch'],
    ['read', 'safeRead'],
    ['search', 'safeRead'],
    ['think', 'safeRead'],
    ['switch_mode', 'safeRead'],
    ['other', 'mcpTool'],
  ];

  it.each(matrix)('%s → %s', (kind, expected) => {
    expect(categorizeToolKind(kind)).toBe(expected);
  });

  it('buckets null / undefined / unrecognized kinds into mcpTool', () => {
    expect(categorizeToolKind(null)).toBe('mcpTool');
    expect(categorizeToolKind(undefined)).toBe('mcpTool');
    expect(categorizeToolKind('some_future_kind')).toBe('mcpTool');
  });
});

describe('categorizeSdkToolName', () => {
  const matrix: ReadonlyArray<[string, PermissionCategory]> = [
    ['Read', 'safeRead'],
    ['Glob', 'safeRead'],
    ['Grep', 'safeRead'],
    ['WebSearch', 'safeRead'],
    ['NotebookRead', 'safeRead'],
    ['TodoWrite', 'safeRead'],
    ['Edit', 'fileEdit'],
    ['Write', 'fileEdit'],
    ['NotebookEdit', 'fileEdit'],
    ['MultiEdit', 'fileEdit'],
    ['Bash', 'bash'],
    ['BashOutput', 'bash'],
    ['KillBash', 'bash'],
    ['WebFetch', 'webFetch'],
  ];

  it.each(matrix)('%s → %s', (name, expected) => {
    expect(categorizeSdkToolName(name)).toBe(expected);
  });

  it('buckets MCP-served and unrecognized tool names into mcpTool', () => {
    expect(categorizeSdkToolName('mcp__supabase__execute_sql')).toBe('mcpTool');
    expect(categorizeSdkToolName('SomeFutureTool')).toBe('mcpTool');
    expect(categorizeSdkToolName('')).toBe('mcpTool');
  });
});
