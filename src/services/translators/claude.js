import Anthropic from '@anthropic-ai/sdk';
import { TranslationError } from './errors.js';
import { systemPrompt, userMessage } from './prompt.js';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — best quality', serverFallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — balanced', serverFallback: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — fastest, cheapest', serverFallback: false },
];

let cached = { apiKey: null, client: null };

function getClient(apiKey) {
  if (cached.apiKey !== apiKey) {
    cached = {
      apiKey,
      // The key stays in this browser and goes straight to Anthropic. That's
      // fine for a personal study app; a public site would call Claude from
      // its own server so visitors never see the key.
      // Retries are handled by withRetry() so the UI can show "Retrying…".
      client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 }),
    };
  }
  return cached.client;
}

function toTranslationError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return new TranslationError('Claude rejected the API key. Check it in Settings.', { cause: error });
  }
  if (error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.NotFoundError) {
    return new TranslationError('This Claude model is not available to your API key. Pick another in Settings.', { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new TranslationError('Claude rate limit reached.', { retryable: true, cause: error });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new TranslationError(`Claude could not handle the request: ${error.message}`, { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new TranslationError('Network error: could not reach Claude.', { retryable: true, cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new TranslationError(`Claude API error ${error.status}.`, { retryable: (error.status ?? 0) >= 500, cause: error });
  }
  return new TranslationError(error?.message ?? 'Unknown error from Claude.', { cause: error });
}

export const claude = {
  id: 'claude',
  label: 'Claude',
  description: 'Natural, context-aware translations using the previous sentences. Needs your Anthropic API key; billed per use.',

  async translate({ text, from, to, context = [], settings }) {
    if (!settings.claudeApiKey) {
      throw new TranslationError('Add your Anthropic API key in Settings to use Claude.');
    }
    const model = CLAUDE_MODELS.find((m) => m.id === settings.claudeModel) ?? CLAUDE_MODELS[0];

    let response;
    try {
      response = await getClient(settings.claudeApiKey).beta.messages.create({
        model: model.id,
        max_tokens: 16000,
        // Short translations don't need deep thinking; low effort keeps it quick.
        output_config: { effort: 'low' },
        // If the model declines, the API retries on a fallback model in the same call.
        ...(model.serverFallback && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
        system: systemPrompt(from, to),
        messages: [{ role: 'user', content: userMessage(text, context) }],
      });
    } catch (error) {
      throw toTranslationError(error);
    }

    if (response.stop_reason === 'refusal') {
      throw new TranslationError('Claude declined to translate this sentence.');
    }
    const translation = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!translation) throw new TranslationError('Claude returned an empty translation.', { retryable: true });
    return translation;
  },
};
