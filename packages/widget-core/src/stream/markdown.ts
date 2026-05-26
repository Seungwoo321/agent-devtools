/**
 * Sanitised markdown renderer for assistant message bubbles.
 *
 * Why a parser at all: the agent emits standard markdown — fenced code
 * blocks, lists, links, **bold**, inline `code` — and rendering the raw
 * source as `textContent` shows literal backticks and asterisks in the UI.
 * That's not polish; it's a functional gap (code suggestions become
 * unreadable). Parsing brings the widget to the bar users expect from any
 * agent chat surface (Claude.ai, ChatGPT, Cursor).
 *
 * Safety: assistant output is untrusted by design — the model can be
 * prompt-injected into emitting `<script>`, `<iframe>`, `onerror=` etc.
 * We run every parse through `DOMPurify` with the default conservative
 * allowlist. `marked` is configured with `breaks: true` (newline → <br>)
 * so the model's natural line breaks survive without forcing the user to
 * type two trailing spaces.
 *
 * Rendering is INTO an existing element so callers can append the
 * streaming cursor as a sibling — we don't return a fragment because
 * cursor placement is the renderer's concern, not ours.
 */
import createDOMPurify, { type DOMPurify } from 'dompurify';
import { marked } from 'marked';

let cachedSanitizer: DOMPurify | null = null;

function getSanitizer(doc: Document): DOMPurify {
  if (cachedSanitizer) return cachedSanitizer;
  // DOMPurify needs a Window for its own DOMParser. In a real browser
  // we can pass `globalThis` — in test environments (happy-dom / jsdom)
  // `doc.defaultView` is the synthetic window. Either way we cache the
  // instance: DOMPurify creation is non-trivial and the renderer reuses
  // it on every delta.
  // `createDOMPurify` accepts a `WindowLike` which is a structural subset of
  // `Window` — TypeScript can't see the overlap, so we cast through `unknown`.
  const view = (doc.defaultView ?? globalThis) as unknown as Parameters<typeof createDOMPurify>[0];
  cachedSanitizer = createDOMPurify(view);
  return cachedSanitizer;
}

/** Reset the cached sanitizer. Only used in tests that swap documents. */
export function resetMarkdownSanitizerCache(): void {
  cachedSanitizer = null;
}

/**
 * Parse `text` as markdown, sanitise the resulting HTML, and append the
 * sanitised nodes into `target`. The target's existing children are
 * preserved (caller can clear beforehand if needed). Returns the number
 * of top-level nodes appended — useful for assertions in tests.
 */
export function renderAssistantMarkdown(target: HTMLElement, text: string): number {
  const doc = target.ownerDocument;
  if (!doc) {
    target.textContent = text;
    return 1;
  }
  let rawHtml: string;
  try {
    // `async: false` forces a synchronous return type. We don't await.
    rawHtml = marked.parse(text, { gfm: true, breaks: true, async: false }) as string;
  } catch {
    target.textContent = text;
    return 1;
  }
  const sanitizer = getSanitizer(doc);
  // Two-pass sanitisation. DOMPurify's default policy already strips
  // <script>, inline event handlers, `javascript:` URLs, and similar XSS
  // vectors — but under happy-dom we've observed an edge case where the
  // attribute-scrub pass is short-circuited after a sibling <script> is
  // removed, leaving `onerror` on a following <img>. Running DOMPurify a
  // second time on the already-script-free output reliably catches those
  // residual attributes. The extra cost is O(html-size) per parse, which
  // is well within the streaming budget. We also keep explicit FORBID_TAGS
  // (style/iframe/object/embed/form) as redundancy against future profile
  // drift, and deliberately do NOT pass USE_PROFILES — it would override
  // the default ALLOWED_ATTR set in a way that re-allowed event-handler
  // attributes in some versions.
  const forbidden = { FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'] };
  const pass1 = sanitizer.sanitize(rawHtml, forbidden);
  const clean = sanitizer.sanitize(pass1, forbidden);
  const tpl = doc.createElement('template');
  tpl.innerHTML = clean;
  const count = tpl.content.childNodes.length;
  target.appendChild(tpl.content);
  return count;
}
