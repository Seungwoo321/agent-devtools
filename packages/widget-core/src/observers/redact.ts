/**
 * Privacy redaction applied to every {@link ErrorRecord} before it lands in
 * the observer's ring buffer or reaches a subscriber. This is the single
 * choke point — sub-observers (console-error, unhandled, network, the early
 * boot trap) all emit raw records and the observer redacts at push.
 *
 * Scope is intentionally narrow: URL-shaped substrings only. For each URL
 * found in `url`, `message`, or `stack`:
 *
 *   - userinfo is stripped (`https://user:pass@host` → `https://host`);
 *   - any query parameter whose *name* matches {@link SENSITIVE_PARAM} has
 *     its value replaced with `REDACTED`, preserving the parameter so the
 *     agent can still reason about query shape. (We use `REDACTED` rather
 *     than `***` because `URLSearchParams.toString()` percent-encodes `*`
 *     to `%2A`, which would render as `token=%2A%2A%2A` in messages — less
 *     readable to both the agent and the human reading the prompt.)
 *   - non-sensitive params are left untouched.
 *
 * Free-text secret scanning (random base64, JWT-looking tokens floating in
 * a `console.error('logged in with', token)` call) is deliberately out of
 * scope: false-positive rate is too high and the caller is responsible for
 * not logging raw secrets. The dominant leak vector this redactor closes is
 * fetch URLs that embed an API key or bearer token in the query string —
 * the network observer captures those automatically and would otherwise
 * surface them to the agent and to any subscriber.
 */
import type { ErrorRecord } from './types.js';

/** Query-parameter names whose values are replaced with `REDACTED`. */
const SENSITIVE_PARAM =
  /(?:token|secret|password|passwd|pwd|auth|session|signature|sig|key|bearer|access|refresh|credential)/i;

/**
 * Greedy-but-bounded URL matcher. Stops at whitespace and a handful of
 * common boundary punctuation; we re-trim trailing punctuation below so a
 * URL at the end of a sentence (`fetch ... failed: …, retrying`) doesn't
 * absorb the comma.
 */
const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]}\\]+/gi;
const URL_TRAILING_PUNCT = /[.,;:)\]]+$/;

export function redactRecord(record: ErrorRecord): ErrorRecord {
  const out: ErrorRecord = {
    ...record,
    message: redactText(record.message),
  };
  if (typeof record.stack === 'string') out.stack = redactText(record.stack);
  if (typeof record.url === 'string') out.url = redactUrl(record.url);
  return out;
}

/** Replace each URL found in free text with its redacted form. */
export function redactText(text: string): string {
  return text.replace(URL_RE, (match) => redactUrl(match));
}

/**
 * Parse a URL and redact userinfo + sensitive query values. If parsing
 * fails (the substring wasn't actually a valid URL — e.g. the greedy match
 * captured trailing chars that confuse the parser even after trimming), we
 * return the original string unchanged rather than corrupt it.
 */
export function redactUrl(raw: string): string {
  const trailingMatch = URL_TRAILING_PUNCT.exec(raw);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const core = trailing ? raw.slice(0, -trailing.length) : raw;
  let parsed: URL;
  try {
    parsed = new URL(core);
  } catch {
    return raw;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    parsed.username = '';
    parsed.password = '';
  }
  // Iterate over a snapshot of keys — mutating searchParams during
  // iteration is undefined per the spec on some engines.
  const keys = Array.from(new Set(parsed.searchParams.keys()));
  for (const key of keys) {
    if (!SENSITIVE_PARAM.test(key)) continue;
    const count = parsed.searchParams.getAll(key).length;
    parsed.searchParams.delete(key);
    for (let i = 0; i < count; i += 1) {
      parsed.searchParams.append(key, 'REDACTED');
    }
  }
  return parsed.toString() + trailing;
}
