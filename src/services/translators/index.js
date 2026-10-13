import { claude } from './claude.js';
import { mymemory } from './mymemory.js';
import { ollama } from './ollama.js';

export { CLAUDE_MODELS } from './claude.js';
export { DEFAULT_OLLAMA_MODEL, listOllamaModels } from './ollama.js';
export { TranslationError } from './errors.js';

// Every translator has the same shape: { id, label, description, translate() },
// plus an optional prepare() to warm up. The rest of the app never cares which
// one is behind translate() — the same idea as Mirai's "vendor strategy"
// (type_a / type_s) that swaps engines.
export const TRANSLATORS = {
  [ollama.id]: ollama,
  [mymemory.id]: mymemory,
  [claude.id]: claude,
};

export const getTranslator = (id) => TRANSLATORS[id] ?? ollama;
