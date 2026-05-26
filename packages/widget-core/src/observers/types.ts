/**
 * Structured records emitted by the page observers. The agent context layer
 * (ADT-19) takes these and ships them up to the server alongside the picked
 * element and page files. Keep the shape stable: the server-side prompt
 * formatter and any future report tooling read these fields directly.
 */

export type ErrorRecordKind =
  | 'console-error'
  | 'unhandled-rejection'
  | 'window-error'
  | 'fetch-error'
  | 'fetch-non-ok';

export interface ErrorRecord {
  /** Category of the captured event — see ErrorRecordKind. */
  kind: ErrorRecordKind;
  /** Wall-clock timestamp (Date.now()) at capture. */
  timestamp: number;
  /** Short human message. Always present, even on synthetic records. */
  message: string;
  /** Stack trace if one was attached to the source Error. */
  stack?: string;
  /** Request URL for network records. */
  url?: string;
  /** Request method for network records (uppercased). */
  method?: string;
  /** Response status for non-OK network records. */
  status?: number;
}

export type ErrorRecordListener = (record: ErrorRecord) => void;
