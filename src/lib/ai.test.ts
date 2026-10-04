import { describe, expect, it } from 'vitest';
import { AiError, azureBase, chatRequest, describeBody, parseDescription } from './ai';
import { sanitizeDescription } from './storage';

describe('chatRequest', () => {
  it('calls OpenAI with a bearer token', () => {
    const { url, init } = chatRequest({ provider: 'openai', apiKey: ' sk-test ', model: 'gpt-4.1-mini' }, { messages: [] });
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toEqual({ model: 'gpt-4.1-mini', messages: [] });
  });

  it('calls Azure at the resource address with an api-key header', () => {
    const { url, init } = chatRequest(
      { provider: 'azure', endpoint: 'https://me.openai.azure.com/openai/deployments/x/chat/completions?api-version=1', apiKey: 'k', model: 'my-deploy' },
      {},
    );
    expect(url).toBe('https://me.openai.azure.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>)['api-key']).toBe('k');
    expect(JSON.parse(init.body as string).model).toBe('my-deploy');
  });
});

describe('azureBase', () => {
  it('accepts a bare host name', () => {
    expect(azureBase('me.services.ai.azure.com')).toBe('https://me.services.ai.azure.com');
  });
  it('rejects plain http', () => {
    expect(() => azureBase('http://me.openai.azure.com')).toThrow(AiError);
  });
});

describe('describeBody', () => {
  it('sends a low-detail image with the place and time as hints', () => {
    const body = describeBody('data:image/jpeg;base64,AAA', { place: 'Lisbon, Portugal', when: '3 Jul 2026, 14:00' }) as {
      messages: { content: unknown }[];
    };
    const user = body.messages[1].content as { type: string; text?: string; image_url?: { detail: string } }[];
    expect(user[0].text).toContain('Lisbon, Portugal');
    expect(user[1].image_url?.detail).toBe('low');
  });
});

describe('parseDescription', () => {
  it('reads JSON, even inside a code fence', () => {
    expect(parseDescription('```json\n{"caption":"A tram on a hill.","tags":["Tram","tram","street"]}\n```')).toEqual({
      caption: 'A tram on a hill.',
      tags: ['tram', 'street'],
      kind: 'other',
    });
  });
  it('keeps a known category and drops unknown ones', () => {
    expect(parseDescription('{"caption":"Pizza.","tags":[],"kind":"food"}').kind).toBe('food');
    expect(parseDescription('{"caption":"Pizza.","tags":[],"kind":"spaceship"}').kind).toBe('other');
  });
  it('rejects anything else', () => {
    expect(() => parseDescription('Sorry, I cannot help.')).toThrow(AiError);
    expect(() => parseDescription('{"caption":1}')).toThrow(AiError);
  });
});

describe('sanitizeDescription', () => {
  it('keeps captions and tags short', () => {
    const d = sanitizeDescription({ caption: 'x'.repeat(500), tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'.repeat(50), 3] });
    expect(d?.caption.length).toBeLessThanOrEqual(200);
    expect(d?.tags).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('drops empty captions', () => {
    expect(sanitizeDescription({ caption: '  ', tags: [] })).toBeUndefined();
  });
});
