/**
 * Provider-side error classification.
 *
 * Providers translate upstream HTTP responses into one of these typed
 * errors so strategies and route handlers can map them to user-facing
 * status codes without parsing message strings.
 *
 *   ProviderInputError  → caller can fix by changing input (400/404/422)
 *   plain Error         → everything else (auth, rate limit, 5xx, etc.)
 *
 * Status 401/402/403 (auth / billing) and 429 (rate limit) are intentionally
 * NOT mapped to ProviderInputError — they reflect server-side configuration
 * or transient quota state, not malformed caller input.
 */

export class ProviderInputError extends Error {
  readonly status: number;
  readonly provider: string;

  constructor(message: string, status: number, provider: string) {
    super(message);
    this.name = 'ProviderInputError';
    this.status = status;
    this.provider = provider;
  }
}

export function isProviderInputStatus(status: number): boolean {
  return status === 400 || status === 404 || status === 422;
}
