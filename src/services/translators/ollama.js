import { TranslationError } from './errors.js';
import { systemPrompt, userMessage } from './prompt.js';

// Ollama runs open AI models such as Qwen on this computer and listens here.
const OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen3:8b';
// Keep the model in GPU memory between sentences; loading it takes up to a minute.
const KEEP_ALIVE = '1h';

const post = (path, body, signal) =>
  fetch(`${OLLAMA_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

// Names of the models installed with `ollama pull …`.
export async function listOllamaModels() {
  const response = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.models ?? []).map((model) => model.name);
}

async function send(body, signal) {
  try {
    return await post('/api/chat', body, signal);
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new TranslationError("Can't reach Ollama. Make sure the Ollama app is running.", { retryable: true, cause });
  }
}

const errorText = async (response) => (await response.json().catch(() => null))?.error ?? `HTTP ${response.status}`;

// Remove any reasoning a model printed even though it was asked not to.
const clean = (text) => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// With `stream: true` Ollama sends one JSON object per line as words are generated.
async function readStream(response, onText) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      if (chunk.error) throw new TranslationError(`Ollama: ${chunk.error}`, { retryable: true });
      if (chunk.message?.content) {
        text += chunk.message.content;
        onText(clean(text));
      }
    }
  }
  return text;
}

export const ollama = {
  id: 'ollama',
  label: 'Ollama',
  description: 'Free AI such as Qwen, running on this computer. Private, fast and far more natural than MyMemory; needs the Ollama app.',
  // Local and free, so it can also translate words while they are still being spoken.
  live: true,

  // Load the model before the first sentence so it doesn't wait a minute.
  prepare(settings) {
    post('/api/generate', { model: settings.ollamaModel || DEFAULT_OLLAMA_MODEL, keep_alive: KEEP_ALIVE }).catch(() => {});
  },

  // `onPartial` (optional) receives the translation as it is being written.
  // `signal` (optional) cancels the request, e.g. when newer words arrive.
  async translate({ text, from, to, context = [], settings, onPartial, signal }) {
    const model = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;
    const body = {
      model,
      stream: Boolean(onPartial),
      // Qwen3 can "think" before answering; a one-line translation doesn't need it and is much faster without.
      think: false,
      keep_alive: KEEP_ALIVE,
      options: { temperature: 0.2 },
      messages: [
        { role: 'system', content: systemPrompt(from, to) },
        { role: 'user', content: userMessage(text, context) },
      ],
    };

    let response = await send(body, signal);
    if (response.status === 400) {
      const error = await errorText(response);
      // Models without a thinking mode may reject the `think` option; ask again without it.
      if (!/think/i.test(error)) throw new TranslationError(`Ollama: ${error}`);
      delete body.think;
      response = await send(body, signal);
    }
    if (response.status === 404) {
      throw new TranslationError(`The model "${model}" isn't installed. Run: ollama pull ${model}`);
    }
    if (!response.ok) {
      throw new TranslationError(`Ollama: ${await errorText(response)}`, { retryable: response.status >= 500 });
    }

    const raw = body.stream ? await readStream(response, onPartial) : (await response.json()).message?.content ?? '';
    const translation = clean(raw);
    if (!translation) throw new TranslationError('Ollama returned an empty translation.', { retryable: true });
    return translation;
  },
};
