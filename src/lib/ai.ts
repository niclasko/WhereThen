import { useSyncExternalStore } from 'react';
import type { PhotoDescription, PhotoRecord } from '../types';
import { getSetting, putSetting, sanitizeDescription } from './storage';
import { KIND_IDS, PHOTO_KINDS } from './kinds';

/** The user's own AI service. Saved only in this browser, and never included in exported trip files. */
export type AiSettings =
  | { provider: 'openai'; apiKey: string; model: string }
  | { provider: 'azure'; endpoint: string; apiKey: string; model: string };

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const SETTINGS_KEY = 'ai';

// --- Settings store ------------------------------------------------------------------------------------

let current: AiSettings | null = null;
const listeners = new Set<() => void>();

export async function loadAiSettings(): Promise<void> {
  try {
    const saved = await getSetting(SETTINGS_KEY);
    current = isAiSettings(saved) ? saved : null;
    listeners.forEach((l) => l());
  } catch {
    /* storage unavailable: AI stays off */
  }
}

export async function saveAiSettings(settings: AiSettings | null): Promise<void> {
  await putSetting(SETTINGS_KEY, settings);
  current = settings;
  listeners.forEach((l) => l());
}

export function useAiSettings(): AiSettings | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

function isAiSettings(v: unknown): v is AiSettings {
  const s = v as AiSettings | null;
  if (!s || typeof s.apiKey !== 'string' || typeof s.model !== 'string' || !s.apiKey || !s.model) return false;
  return s.provider === 'openai' || (s.provider === 'azure' && typeof s.endpoint === 'string' && !!s.endpoint);
}

// --- Requests ------------------------------------------------------------------------------------------

export class AiError extends Error {
  /**
   * `fatal`: retrying won't help until the settings change (wrong key, model, endpoint, no credit).
   * `photoOnly`: just this photo failed (e.g. an odd answer); carry on with the others.
   */
  constructor(message: string, readonly fatal: boolean, readonly photoOnly = false) {
    super(message);
  }
}

/** Accepts the endpoint as copied from Azure (any path) and returns the resource's base address. */
export function azureBase(endpoint: string): string {
  const url = new URL(endpoint.trim().includes('://') ? endpoint.trim() : `https://${endpoint.trim()}`);
  if (url.protocol !== 'https:') throw new AiError('The endpoint must start with https://', true);
  return url.origin;
}

export function chatRequest(settings: AiSettings, body: Record<string, unknown>): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url: string;
  if (settings.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  } else {
    url = `${azureBase(settings.endpoint)}/openai/v1/chat/completions`;
    headers['api-key'] = settings.apiKey.trim();
  }
  return { url, init: { method: 'POST', headers, body: JSON.stringify({ model: settings.model.trim(), ...body }) } };
}

async function send(settings: AiSettings, body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const { url, init } = chatRequest(settings, body);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new AiError('Couldn’t reach the AI service. Check the endpoint and your connection.', false);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      /* no details */
    }
    if (res.status === 401 || res.status === 403) throw new AiError('The API key wasn’t accepted.', true);
    if (res.status === 404) throw new AiError(`Model or deployment “${settings.model}” wasn’t found.`, true);
    if (res.status === 429) throw new AiError(detail.includes('quota') ? 'The AI account is out of credit.' : 'The AI service is busy. Try again in a moment.', detail.includes('quota'));
    throw new AiError(detail || `The AI service returned an error (${res.status}).`, res.status === 400);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

/** A tiny request to check the settings before saving them. */
export async function testAiSettings(settings: AiSettings): Promise<void> {
  await send(settings, { messages: [{ role: 'user', content: 'Reply with OK.' }], max_completion_tokens: 200 });
}

const SCHEMA = {
  type: 'object',
  properties: {
    caption: { type: 'string', description: 'One short, natural sentence describing the photo (max 15 words).' },
    tags: { type: 'array', items: { type: 'string' }, description: '3 to 5 short lowercase tags, e.g. beach, dinner, museum.' },
    kind: {
      type: 'string',
      enum: KIND_IDS,
      description: `The photo's main category: ${PHOTO_KINDS.map((k) => `${k.id} (${k.hint})`).join('; ')}.`,
    },
  },
  required: ['caption', 'tags', 'kind'],
  additionalProperties: false,
};

export interface PhotoContext {
  place?: string;
  when?: string;
  language?: string;
}

export function describeBody(image: string, context: PhotoContext): Record<string, unknown> {
  const facts = [context.place && `Taken at: ${context.place}`, context.when && `Time: ${context.when}`].filter(Boolean).join('\n');
  return {
    messages: [
      {
        role: 'system',
        content:
          'You caption holiday photos for a personal travel map. Describe what is visible: the scene, activity, food or landmark. ' +
          'Use the place only as a hint; do not guess names you cannot see. Never describe or identify people beyond e.g. "two friends". ' +
          `Write the caption and tags in ${context.language ?? 'English'}; the kind is always one of the given ids.`,
      },
      {
        role: 'user',
        content: [
          ...(facts ? [{ type: 'text', text: facts }] : []),
          { type: 'image_url', image_url: { url: image, detail: 'low' } },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'photo_description', strict: true, schema: SCHEMA } },
    max_completion_tokens: 1000,
  };
}

/** Reads the model's answer, keeping only a short caption, a few short tags and a known category. */
export function parseDescription(text: string): PhotoDescription {
  let data: unknown;
  try {
    data = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('The AI service gave an unexpected answer.', false, true);
  }
  const d = sanitizeDescription(data);
  if (!d) throw new AiError('The AI service gave an unexpected answer.', false, true);
  return { ...d, kind: d.kind ?? 'other' };
}

/** Photos with a preview that have no description yet, or one from before categories existed. */
export function needsDescription(photo: PhotoRecord): boolean {
  return !!photo.thumbnail && !photo.ai?.kind;
}

export async function describePhoto(settings: AiSettings, image: string, context: PhotoContext, signal?: AbortSignal): Promise<PhotoDescription> {
  return parseDescription(await send(settings, describeBody(image, context), signal));
}

export function browserLanguage(): string {
  try {
    const code = navigator.language || 'en';
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? 'English';
  } catch {
    return 'English';
  }
}
