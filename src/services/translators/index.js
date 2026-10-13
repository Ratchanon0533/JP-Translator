import { cloudflareGemma, cloudflareLlama } from './cloudflare.js';
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
  [cloudflareGemma.id]: cloudflareGemma,
  [cloudflareLlama.id]: cloudflareLlama,
  [ollama.id]: ollama,
  [mymemory.id]: mymemory,
};

// What Settings offers: "Auto" plus each engine.
export const ENGINE_CHOICES = [
  {
    id: 'auto',
    label: 'Auto (recommended)',
    description:
      'Gemma on Cloudflare first. If it is unavailable: Llama on Cloudflare (reserve), then Qwen on this PC (Ollama) when the site runs on this PC, then MyMemory as a last resort.',
  },
  ...Object.values(TRANSLATORS),
];

// Auto's order: Gemma gave the most natural Thai and Japanese in tests; Llama (a
// different company's model) stands in if Gemma is retired or broken; the PC's
// own Ollama is only worth trying on a page served from this PC.
const autoOrder = () => [
  cloudflareGemma.id,
  cloudflareLlama.id,
  ...(isLocalPage() ? [ollama.id] : []),
  mymemory.id,
];

// The engines to try for a sentence, in order. When one can't be used right
// now (not running, not set up, model unavailable, today's free allowance used
// up), the next one translates instead. A specific choice goes first, with
// Auto's engines as its backups.
export function engineChain(choice) {
  const auto = autoOrder();
  const ids = TRANSLATORS[choice] ? [choice, ...auto.filter((id) => id !== choice)] : auto;
  return ids.map((id) => TRANSLATORS[id]);
}
