import { TranslationError } from './errors.js';
import { systemPrompt, userMessage } from './prompt.js';

// Ollama runs open AI models such as Qwen on this computer and listens here.
const OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen3:8b';
// Keep the model in GPU memory between sentences; loading it takes up to a minute.
const KEEP_ALIVE = '30m';

const post = (path, body) =>
  fetch(`${OLLAMA_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Names of the models installed with `ollama pull …`.
export async function listOllamaModels() {
  const response = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.models ?? []).map((model) => model.name);
}

async function chat(body) {
  let response;
  try {
    response = await post('/api/chat', body);
  } catch (cause) {
    throw new TranslationError("Can't reach Ollama. Make sure the Ollama app is running.", { retryable: true, cause });
  }
  const data = await response.json().catch(() => null);
  return { response, data };
}

export const ollama = {
  id: 'ollama',
  label: 'Ollama',
  description: 'Free AI such as Qwen, running on this computer. Private and far more natural than MyMemory; needs the Ollama app.',

  // Load the model before the first sentence so it doesn't wait a minute.
  prepare(settings) {
    post('/api/generate', { model: settings.ollamaModel || DEFAULT_OLLAMA_MODEL, keep_alive: KEEP_ALIVE }).catch(() => {});
  },

  async translate({ text, from, to, context = [], settings }) {
    const model = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;
    const body = {
      model,
      stream: false,
      // Qwen3 can "think" before answering; a one-line translation doesn't need it and is much faster without.
      think: false,
      keep_alive: KEEP_ALIVE,
      options: { temperature: 0.2 },
      messages: [
        { role: 'system', content: systemPrompt(from, to) },
        { role: 'user', content: userMessage(text, context) },
      ],
    };

    let { response, data } = await chat(body);
    // Models without a thinking mode may reject the `think` option; ask again without it.
    if (response.status === 400 && /think/i.test(data?.error ?? '')) {
      delete body.think;
      ({ response, data } = await chat(body));
    }

    if (response.status === 404) {
      throw new TranslationError(`The model "${model}" isn't installed. Run: ollama pull ${model}`);
    }
    if (!response.ok) {
      throw new TranslationError(`Ollama: ${data?.error ?? `HTTP ${response.status}`}`, { retryable: response.status >= 500 });
    }

    // Remove any reasoning a model printed anyway.
    const translation = String(data?.message?.content ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();
    if (!translation) throw new TranslationError('Ollama returned an empty translation.', { retryable: true });
    return translation;
  },
};
