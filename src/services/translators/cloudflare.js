import { TranslationError } from './errors.js';

// The site's own endpoint (public/_worker.js), which runs AI models on Cloudflare
// Workers AI. Works on any device, and the free plan can't cost anything.
const ENDPOINT = '/api/translate';

// Codes from _worker.js after which the next engine should translate instead.
const HAND_OVER = new Set(['not-configured', 'quota', 'model-unavailable']);

function cloudflareEngine({ id, model, name, ...details }) {
  return {
    id,
    ...details,
    live: true,
    // Live translation spends the daily allowance, so it runs less often than with Ollama.
    liveGapMs: 1200,

    async translate({ text, from, to, context = [], signal }) {
      let response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, from: from.id, to: to.id, context, model }),
          signal,
        });
      } catch (cause) {
        if (cause?.name === 'AbortError') throw cause;
        throw new TranslationError(`Can't reach ${name} on Cloudflare.`, { code: 'unavailable', cause });
      }

      const data = await response.json().catch(() => null);
      // No JSON: the page isn't running on Cloudflare (e.g. `npm run dev`), or an older upload without _worker.js.
      if (!data) {
        throw new TranslationError(`${name} on Cloudflare isn't available on this copy of the site.`, { code: 'unavailable' });
      }
      if (HAND_OVER.has(data.code)) throw new TranslationError(data.error, { code: 'unavailable' });
      if (!response.ok) {
        throw new TranslationError(data.error ?? `HTTP ${response.status}`, { retryable: response.status >= 500 });
      }
      return data.translation;
    },
  };
}

export const cloudflareQwen = cloudflareEngine({
  id: 'cloudflare',
  model: 'qwen',
  name: 'Qwen',
  label: 'Qwen on Cloudflare',
  description:
    'Free Qwen3 30B on Cloudflare, so it works on any device, including phones. Free daily allowance of thousands of sentences, reset at 07:00 Thai time.',
});

export const cloudflareGemma = cloudflareEngine({
  id: 'gemma',
  model: 'gemma',
  name: 'Gemma',
  label: 'Gemma on Cloudflare',
  description:
    "Free Gemma 4 26B (Google) on Cloudflare: the second choice after Qwen, on any device. Shares Qwen's free daily allowance.",
});
