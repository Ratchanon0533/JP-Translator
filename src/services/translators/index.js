import { cloudflareGemma, cloudflareLlama } from './cloudflare.js';
import { mymemory } from './mymemory.js';

export { TranslationError } from './errors.js';

// Every translator has the same shape: { id, label, description, translate() },
// plus `live` when it can translate words while they are still being spoken.
// The rest of the app never cares which one is behind translate() — the same
// idea as Mirai's "vendor strategy" (type_a / type_s) that swaps engines.
export const TRANSLATORS = {
  [cloudflareGemma.id]: cloudflareGemma,
  [cloudflareLlama.id]: cloudflareLlama,
  [mymemory.id]: mymemory,
};

// What Settings offers: "Auto" plus each engine.
export const ENGINE_CHOICES = [
  {
    id: 'auto',
    label: 'Auto (recommended)',
    description:
      'Gemma on Cloudflare first. If it is unavailable: Llama on Cloudflare (reserve), then MyMemory as a last resort.',
  },
  ...Object.values(TRANSLATORS),
];

// Auto's order: Gemma gave the most natural Thai and Japanese in tests; Llama (a
// different company's model) stands in if Gemma is retired or broken; MyMemory
// covers days when the free Cloudflare allowance is used up.
const AUTO_ORDER = [cloudflareGemma.id, cloudflareLlama.id, mymemory.id];

// The engines to try for a sentence, in order. When one can't be used right
// now (not set up, model unavailable, today's free allowance used up), the next
// one translates instead. A specific choice goes first, with the others as backups.
export function engineChain(choice) {
  const ids = TRANSLATORS[choice] ? [choice, ...AUTO_ORDER.filter((id) => id !== choice)] : AUTO_ORDER;
  return ids.map((id) => TRANSLATORS[id]);
}
