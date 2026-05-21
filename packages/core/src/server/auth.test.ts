import { describe, expect, it } from 'vitest';
import { generatePairingToken, verifyAuthorization } from './auth.js';

describe('generatePairingToken', () => {
  it('returns a 43-character base64url string (32 random bytes, no padding)', () => {
    const token = generatePairingToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rotates on every call (vanishingly unlikely collision)', () => {
    const a = generatePairingToken();
    const b = generatePairingToken();
    expect(a).not.toBe(b);
  });
});

describe('verifyAuthorization', () => {
  const token = 'abcdef0123456789'; // arbitrary equal-length fixture

  it('rejects undefined header', () => {
    expect(verifyAuthorization(undefined, token)).toBe(false);
  });

  it('rejects empty header', () => {
    expect(verifyAuthorization('', token)).toBe(false);
  });

  it('rejects wrong scheme', () => {
    expect(verifyAuthorization(`Basic ${token}`, token)).toBe(false);
    expect(verifyAuthorization(`Token ${token}`, token)).toBe(false);
  });

  it('rejects Bearer with no token', () => {
    expect(verifyAuthorization('Bearer ', token)).toBe(false);
  });

  it('rejects different-length token without throwing', () => {
    expect(verifyAuthorization('Bearer short', token)).toBe(false);
    expect(verifyAuthorization(`Bearer ${token}extra`, token)).toBe(false);
  });

  it('rejects same-length but different token', () => {
    const wrong = 'fedcba9876543210';
    expect(wrong.length).toBe(token.length);
    expect(verifyAuthorization(`Bearer ${wrong}`, token)).toBe(false);
  });

  it('accepts an exact Bearer match', () => {
    expect(verifyAuthorization(`Bearer ${token}`, token)).toBe(true);
  });

  it('is case-sensitive on the scheme literal', () => {
    // Per RFC 7235 schemes are case-insensitive, but our minimal check is strict.
    // Documenting current behavior; can be relaxed if the widget needs it.
    expect(verifyAuthorization(`bearer ${token}`, token)).toBe(false);
  });
});
