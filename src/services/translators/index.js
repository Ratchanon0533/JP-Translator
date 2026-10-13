import { mymemory } from './mymemory.js';
import { ollama } from './ollama.js';

export { DEFAULT_OLLAMA_MODEL, isLocalPage, listOllamaModels, ollamaOriginsCommand } from './ollama.js';
export { TranslationError } from './errors.js';

// Every translator has the same shape: { id, label, description, translate() },
// plus optional extras: prepare() to warm up, and `live` when it is fast and
// free enough to translate words while they are still being spoken.
// The rest of the app never cares which one is behind translate() — the same
// idea as Mirai's "vendor strategy" (type_a / type_s) that swaps engines.
export const TRANSLATORS = {
  [ollama.id]: ollama,
  [mymemory.id]: mymemory,
};

export const getTranslator = (id) => TRANSLATORS[id] ?? ollama;
