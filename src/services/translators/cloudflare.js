import { TranslationError } from './errors.js';

// The site's own endpoint (public/_worker.js), which runs Google's Gemma 4 on
// Cloudflare Workers AI. Works on any device, and the free plan can't cost anything.
const ENDPOINT = '/api/translate';

// Codes from _worker.js after which the next engine should translate instead.
const HAND_OVER = new Set(['not-configured', 'quota', 'model-unavailable']);

export const cloudflareGemma = {
  id: 'gemma',
  label: 'Gemma on Cloudflare',
  description:
    'Free Gemma 4 26B (Google) on Cloudflare: the most natural Thai and Japanese of the free engines, on any device. Free daily allowance of thousands of sentences, reset at 07:00 Thai time.',
  live: true,
  // Live translation spends the daily allowance, so it runs less often than with Ollama.
  liveGapMs: 1200,

  async translate({ text, from, to, context = [], signal }) {
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: from.id, to: to.id, context }),
        signal,
      });
    } catch (cause) {
      if (cause?.name === 'AbortError') throw cause;
      throw new TranslationError("Can't reach Gemma on Cloudflare.", { code: 'unavailable', cause });
    }

    const data = await response.json().catch(() => null);
    // No JSON: the page isn't running on Cloudflare (e.g. `npm run dev`), or an older upload without _worker.js.
    if (!data) throw new TranslationError("Gemma on Cloudflare isn't available on this copy of the site.", { code: 'unavailable' });
    if (HAND_OVER.has(data.code)) throw new TranslationError(data.error, { code: 'unavailable' });
    if (!response.ok) {
      throw new TranslationError(data.error ?? `HTTP ${response.status}`, { retryable: response.status >= 500 });
    }
    return data.translation;
  },
};
