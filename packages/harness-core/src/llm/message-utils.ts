/**
 * Shared utility functions for LLM providers.
 *
 * Extracted from per-provider duplicated code to eliminate copy-paste.
 */

import type { ChatMessage, ContentPart, ImageContent } from './types.js';

/**
 * Resolve ImageContent to a URL string (data URI for base64).
 */
export function resolveImageUrl(image: ImageContent): string | null {
  if (image.base64) {
    const mimeType = image.mimeType || 'image/png';
    return `data:${mimeType};base64,${image.base64}`;
  }
  return image.url || null;
}

/**
 * Inject an image content part into the messages.
 * If the last user message is a string, convert it to a content array.
 */
export function injectImageIntoMessages(
  messages: ChatMessage[],
  imagePart: ContentPart,
): ChatMessage[] {
  const cloned: ChatMessage[] = messages.map((m) => ({ ...m }));

  let lastUserIdx = -1;
  let lastUser: ChatMessage | undefined;
  for (let i = cloned.length - 1; i >= 0; i--) {
    const m = cloned[i];
    if (m?.role === 'user') {
      lastUserIdx = i;
      lastUser = m;
      break;
    }
  }
  if (lastUserIdx === -1 || !lastUser) {
    cloned.push({ role: 'user', content: [imagePart] });
    return cloned;
  }

  if (typeof lastUser.content === 'string') {
    cloned[lastUserIdx] = {
      ...lastUser,
      role: 'user',
      content: [{ type: 'text', text: lastUser.content }, imagePart],
    };
  } else if (Array.isArray(lastUser.content)) {
    cloned[lastUserIdx] = {
      ...lastUser,
      role: 'user',
      content: [...lastUser.content, imagePart],
    };
  }

  return cloned;
}
