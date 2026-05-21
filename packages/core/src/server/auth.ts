import { randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
const BEARER_PREFIX = 'Bearer ';

/**
 * Pairing token contract:
 *   - 32 random bytes → base64url (43 chars, no padding).
 *   - Generated in memory at CLI startup; never written to disk.
 *   - Rotates on every CLI restart (new process = new token).
 *   - Delivered to the widget out-of-band (CLI stdout → operator → widget config).
 *     Never embedded in a URL — only via the `Authorization: Bearer …` header.
 */
export function generatePairingToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Constant-time check of `Authorization: Bearer <token>` against the expected
 * value. Rejects missing / wrong-scheme / wrong-length / mismatched tokens.
 *
 * `timingSafeEqual` requires equal-length buffers, so the length pre-check is
 * intentional (the goal is "no early exit within equal-length comparison",
 * not "hide whether the token length matched at all").
 */
export function verifyAuthorization(headerValue: string | undefined, expected: string): boolean {
  if (!headerValue) return false;
  if (!headerValue.startsWith(BEARER_PREFIX)) return false;
  const provided = headerValue.slice(BEARER_PREFIX.length);
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
