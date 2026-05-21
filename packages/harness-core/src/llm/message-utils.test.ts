import { describe, it, expect } from 'vitest';
import { resolveImageUrl, injectImageIntoMessages } from './message-utils.js';
import type { ChatMessage, ContentPart } from './types.js';

describe('resolveImageUrl', () => {
  it('builds a data URI when base64 + mime type are provided', () => {
    expect(resolveImageUrl({ base64: 'AAA', mimeType: 'image/jpeg' })).toBe(
      'data:image/jpeg;base64,AAA',
    );
  });

  it('defaults to image/png when mime type is missing', () => {
    expect(resolveImageUrl({ base64: 'AAA' })).toBe('data:image/png;base64,AAA');
  });

  it('returns the URL when no base64 is provided', () => {
    expect(resolveImageUrl({ url: 'https://example.com/i.png' })).toBe('https://example.com/i.png');
  });

  it('returns null when neither field is present', () => {
    expect(resolveImageUrl({})).toBeNull();
  });
});

describe('injectImageIntoMessages', () => {
  const imagePart: ContentPart = {
    type: 'image_url',
    image_url: { url: 'data:image/png;base64,AAA' },
  };

  it('appends a user message when no user message exists', () => {
    const result = injectImageIntoMessages([{ role: 'system', content: 'hi' }], imagePart);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ role: 'user', content: [imagePart] });
  });

  it('promotes a string user message into a content array with the image appended', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'hi' },
      { role: 'user', content: 'describe this' },
    ];
    const result = injectImageIntoMessages(messages, imagePart);
    expect(result[1]!.content).toEqual([{ type: 'text', text: 'describe this' }, imagePart]);
  });

  it('appends to an existing array-form user message', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'a' }],
      },
    ];
    const result = injectImageIntoMessages(messages, imagePart);
    expect(result[0]!.content).toEqual([{ type: 'text', text: 'a' }, imagePart]);
  });

  it('only mutates the last user message, not earlier ones', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'second' },
    ];
    const result = injectImageIntoMessages(messages, imagePart);
    expect(result[0]!.content).toBe('first');
    expect(result[2]!.content).toEqual([{ type: 'text', text: 'second' }, imagePart]);
  });
});
