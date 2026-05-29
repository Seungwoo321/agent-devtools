import { describe, expect, it } from 'vitest';
import { redactRecord, redactText, redactUrl } from './redact.js';
import type { ErrorRecord } from './types.js';

describe('redactUrl', () => {
  it('leaves a plain URL untouched', () => {
    expect(redactUrl('https://example.com/v1/users')).toBe('https://example.com/v1/users');
  });

  it('strips userinfo', () => {
    expect(redactUrl('https://user:pass@example.com/x')).toBe('https://example.com/x');
  });

  it('masks sensitive query parameter values, preserves others', () => {
    const out = redactUrl('https://api.example.com/v1/users?page=2&token=abc&format=json');
    const parsed = new URL(out);
    expect(parsed.searchParams.get('page')).toBe('2');
    expect(parsed.searchParams.get('token')).toBe('REDACTED');
    expect(parsed.searchParams.get('format')).toBe('json');
    expect(out).not.toContain('abc');
  });

  it.each([
    ['api_key'],
    ['accessToken'],
    ['refresh_token'],
    ['x-bearer-id'],
    ['password'],
    ['signature'],
    ['SessionId'],
    ['credentials'],
  ])('treats %s as sensitive', (paramName) => {
    const url = `https://api.example.com/x?${paramName}=secretvalue`;
    const out = redactUrl(url);
    expect(out).not.toContain('secretvalue');
    expect(new URL(out).searchParams.get(paramName)).toBe('REDACTED');
  });

  it('returns the input unchanged when the string is not a valid URL', () => {
    expect(redactUrl('not a url at all')).toBe('not a url at all');
  });
});

describe('redactText', () => {
  it('redacts a URL embedded in a longer message', () => {
    const text = 'fetch GET https://api.example.com/v1/users?token=abc → 401';
    const out = redactText(text);
    expect(out).not.toContain('token=abc');
    expect(out).toContain('token=REDACTED');
  });

  it('preserves trailing sentence punctuation outside the URL', () => {
    const text = 'failed at https://api.example.com/x?key=abc, retrying.';
    const out = redactText(text);
    // The comma after the URL must stay outside the redacted URL.
    expect(out).toContain(', retrying.');
    expect(out).not.toContain('key=abc');
  });

  it('redacts multiple URLs in one string independently', () => {
    const text =
      'tried https://a.example.com/?token=x then https://b.example.com/?token=y both 500';
    const out = redactText(text);
    expect(out).not.toContain('token=x');
    expect(out).not.toContain('token=y');
    expect(out.match(/token=REDACTED/g)?.length).toBe(2);
  });

  it('leaves text without URLs untouched', () => {
    expect(redactText('TypeError: foo is not a function')).toBe('TypeError: foo is not a function');
  });
});

describe('redactRecord', () => {
  it('redacts url, message, and stack together', () => {
    const record: ErrorRecord = {
      kind: 'fetch-non-ok',
      timestamp: 1,
      message: 'fetch GET https://api.example.com/v1/x?token=secret → 401',
      url: 'https://api.example.com/v1/x?token=secret',
      method: 'GET',
      status: 401,
      stack: 'Error: fetch failed\n    at https://api.example.com/v1/x?token=secret',
    };
    const out = redactRecord(record);
    expect(out.url).toBe('https://api.example.com/v1/x?token=REDACTED');
    expect(out.message).toContain('token=REDACTED');
    expect(out.stack).toContain('token=REDACTED');
    expect(out.message).not.toContain('secret');
    expect(out.stack).not.toContain('secret');
    // Other fields pass through unchanged.
    expect(out.kind).toBe('fetch-non-ok');
    expect(out.method).toBe('GET');
    expect(out.status).toBe(401);
  });

  it('omits stack when input has no stack', () => {
    const record: ErrorRecord = {
      kind: 'console-error',
      timestamp: 1,
      message: 'oops',
    };
    const out = redactRecord(record);
    expect(out.stack).toBeUndefined();
  });
});
