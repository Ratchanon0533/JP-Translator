import { cloudflareGemma } from './cloudflare.js';
import { mymemory } from './mymemory.js';
import { isLocalPage, ollama } from './ollama.js';

export { DEFAULT_OLLAMA_MODEL, isLocalPage, listOllamaModels, ollamaOriginsCommand } from './ollama.js';
export { TranslationError } from './errors.js';

// Every translator has the same shape: { id, label, description, translate() },
// plus optional extras: prepare() to warm up, and `live` when it can translate
// words while they are still being spoken. The rest of the app never cares
// which one is behind translate() — the same idea as Mirai's "vendor strategy"
// (type_a / type_s) that swaps engines.
export const TRANSLATORS = {
  [ollama.id]: ollama,
  [cloudflareGemma.id]: cloudflareGemma,
  [mymemory.id]: mymemory,
};

// What Settings offers: "Auto" plus each engine.
export const ENGINE_CHOICES = [
  {
    id: 'auto',
    label: 'Auto (recommended)',
    description:
      'Uses the best free engine that works here: Ollama when the site runs on this PC, then Gemma on Cloudflare, and MyMemory as a last resort.',
  },
  ...Object.values(TRANSLATORS),
];

// From best to most basic.
const ORDER = [ollama.id, cloudflareGemma.id, mymemory.id];

// The engines to try for a sentence, in order. When one can't be used right
// now (not running, not set up, model unavailable, today's free allowance used
// up), the next one translates instead.
export function engineChain(choice) {
  if (TRANSLATORS[choice]) return ORDER.slice(ORDER.indexOf(choice)).map((id) => TRANSLATORS[id]);
  // Auto: the PC's own Ollama is only worth trying on a page served from this PC.
  const ids = isLocalPage() ? ORDER : ORDER.filter((id) => id !== ollama.id);
  return ids.map((id) => TRANSLATORS[id]);
}
