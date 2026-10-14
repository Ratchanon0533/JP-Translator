import { TranslationError } from './errors.js';

// The site's own endpoint (public/_worker.js), which runs AI models on Cloudflare
// Workers AI. Works on any device, and the free plan can't cost anything.
const ENDPOINT = '/api/translate';

// Codes from _worker.js after which the next engine should translate instead.
const HAND_OVER = new Set(['not-configured', 'quota', 'model-unavailable']);

// Both models share one daily allowance. Once it is used up, skip Cloudflare
// until it refills at 00:00 UTC (07:00 in Thailand) instead of asking again.
let allowanceUsedUpUntil = 0;
const nextUtcMidnight = () => {
  const date = new Date();
  date.setUTCHours(24, 0, 0, 0);
  return date.getTime();
};

function cloudflareEngine({ id, model, name, ...details }) {
  return {
    id,
    ...details,
    live: true,
    // Live translation spends the daily allowance, so it runs about once a second at most.
    liveGapMs: 1200,

    async translate({ text, from, to, context = [], signal }) {
      if (Date.now() < allowanceUsedUpUntil) {
        throw new TranslationError("Today's free AI allowance on Cloudflare is used up (it resets at 07:00 Thai time).", {
          code: 'unavailable',
        });
      }

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
      if (data.code === 'quota') allowanceUsedUpUntil = nextUtcMidnight();
      if (HAND_OVER.has(data.code)) throw new TranslationError(data.error, { code: 'unavailable' });
      if (!response.ok) {
        throw new TranslationError(data.error ?? `HTTP ${response.status}`, { retryable: response.status >= 500 });
      }
      return data.translation;
    },
  };
}

export const cloudflareGemma = cloudflareEngine({
  id: 'gemma',
  model: 'gemma',
  name: 'Gemma',
  label: 'Gemma on Cloudflare',
  description:
    'Free Gemma 4 26B (Google) on Cloudflare: the most natural Thai and Japanese of the free engines, on any device. Free daily allowance of thousands of sentences, reset at 07:00 Thai time.',
});

export const cloudflareLlama = cloudflareEngine({
  id: 'llama',
  model: 'llama',
  name: 'Llama',
  label: 'Llama on Cloudflare (reserve)',
  description:
    "Free Llama 4 Scout (Meta) on Cloudflare: the reserve, used when Gemma isn't available. Shares Gemma's free daily allowance.",
});
