/**
 * Unit matrix for {@link decidePermission}. The widget user is offline,
 * so the runtime must resolve every permission request from a
 * `(permissionMode, ToolKind)` pair. This file pins the 4 × 4 default
 * matrix plus the safe-read auto-allow shortcut + the policy override
 * paths.
 */
import { describe, expect, it } from 'vitest';
import type {
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolKind,
} from '@agentclientprotocol/sdk';
import { DEFAULT_PERMISSION_POLICY, type PermissionPolicy } from './acp.js';
import { decidePermission } from './acp-runtime.js';

const STANDARD_OPTIONS: readonly PermissionOption[] = [
  { kind: 'allow_once', optionId: 'allow_once', name: 'Allow once' },
  { kind: 'allow_always', optionId: 'allow_always', name: 'Allow always' },
  { kind: 'reject_once', optionId: 'reject_once', name: 'Reject once' },
  { kind: 'reject_always', optionId: 'reject_always', name: 'Reject always' },
];

function makeRequest(kind: ToolKind | null, options = STANDARD_OPTIONS): RequestPermissionRequest {
  return {
    sessionId: 'sess_test',
    options: [...options],
    toolCall: {
      toolCallId: 'tool_test',
      ...(kind !== null && { kind }),
    },
  };
}

function outcomeKind(response: RequestPermissionResponse): string {
  if (response.outcome.outcome === 'selected') return response.outcome.optionId;
  return response.outcome.outcome;
}

describe('decidePermission', () => {
  describe('permissionMode is bypassPermissions', () => {
    it.each<ToolKind>(['edit', 'execute', 'fetch', 'other'])(
      'auto-allows every action kind (%s)',
      (kind) => {
        const result = decidePermission(makeRequest(kind), 'bypassPermissions');
        expect(outcomeKind(result)).toBe('allow_once');
      },
    );
  });

  describe('permissionMode is plan or default', () => {
    it.each<['plan' | 'default', ToolKind]>([
      ['plan', 'edit'],
      ['plan', 'execute'],
      ['plan', 'fetch'],
      ['plan', 'other'],
      ['default', 'edit'],
      ['default', 'execute'],
      ['default', 'fetch'],
      ['default', 'other'],
    ])('cancels regardless of action kind (%s + %s)', (mode, kind) => {
      const result = decidePermission(makeRequest(kind), mode);
      expect(outcomeKind(result)).toBe('cancelled');
    });
  });

  describe('default policy under acceptEdits / dontAsk', () => {
    const interactiveModes = ['acceptEdits', 'dontAsk'] as const;
    const matrix: ReadonlyArray<[ToolKind, 'allow_once' | 'cancelled']> = [
      ['edit', 'allow_once'],
      ['delete', 'allow_once'],
      ['move', 'allow_once'],
      ['execute', 'cancelled'],
      ['fetch', 'cancelled'],
      ['other', 'cancelled'],
    ];

    for (const mode of interactiveModes) {
      it.each(matrix)(`${mode} + %s → %s`, (kind, expected) => {
        const result = decidePermission(makeRequest(kind), mode);
        expect(outcomeKind(result)).toBe(expected);
      });
    }
  });

  describe('safe-read kinds auto-allow under any non-bypass mode', () => {
    it.each<ToolKind>(['read', 'search', 'think', 'switch_mode'])(
      '%s is auto-allowed under acceptEdits',
      (kind) => {
        const result = decidePermission(makeRequest(kind), 'acceptEdits');
        expect(outcomeKind(result)).toBe('allow_once');
      },
    );

    it('safe-read is still cancelled under plan mode', () => {
      // Plan mode short-circuits before the safe-read branch; that is
      // intentional because plan is the "look but do nothing" surface.
      const result = decidePermission(makeRequest('read'), 'plan');
      expect(outcomeKind(result)).toBe('cancelled');
    });
  });

  describe('policy overrides', () => {
    it('forces fileEdit to ask when policy.fileEdit is ask', () => {
      const policy: PermissionPolicy = { ...DEFAULT_PERMISSION_POLICY, fileEdit: 'ask' };
      const result = decidePermission(makeRequest('edit'), 'acceptEdits', policy);
      expect(outcomeKind(result)).toBe('cancelled');
    });

    it('forces bash to auto when policy.bash is auto', () => {
      const policy: PermissionPolicy = { ...DEFAULT_PERMISSION_POLICY, bash: 'auto' };
      const result = decidePermission(makeRequest('execute'), 'acceptEdits', policy);
      expect(outcomeKind(result)).toBe('allow_once');
    });

    it('emits reject_once when policy is deny and a reject option is offered', () => {
      const policy: PermissionPolicy = { ...DEFAULT_PERMISSION_POLICY, webFetch: 'deny' };
      const result = decidePermission(makeRequest('fetch'), 'acceptEdits', policy);
      expect(outcomeKind(result)).toBe('reject_once');
    });

    it('falls back to cancelled when policy is deny but no reject option is offered', () => {
      const policy: PermissionPolicy = { ...DEFAULT_PERMISSION_POLICY, webFetch: 'deny' };
      const onlyAllow: readonly PermissionOption[] = [
        { kind: 'allow_once', optionId: 'allow_once', name: 'Allow once' },
      ];
      const result = decidePermission(makeRequest('fetch', onlyAllow), 'acceptEdits', policy);
      expect(outcomeKind(result)).toBe('cancelled');
    });
  });

  describe('unknown / missing kinds', () => {
    it('treats null kind as mcpTool (cancelled by default)', () => {
      const result = decidePermission(makeRequest(null), 'acceptEdits');
      expect(outcomeKind(result)).toBe('cancelled');
    });

    it('treats null kind as mcpTool (auto when policy.mcpTool=auto)', () => {
      const policy: PermissionPolicy = { ...DEFAULT_PERMISSION_POLICY, mcpTool: 'auto' };
      const result = decidePermission(makeRequest(null), 'acceptEdits', policy);
      expect(outcomeKind(result)).toBe('allow_once');
    });
  });
});
