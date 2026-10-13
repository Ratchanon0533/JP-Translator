// Runs on Cloudflare Pages ("advanced mode": a _worker.js at the root of the
// uploaded folder). It serves the site as usual, plus one endpoint,
// POST /api/translate, that translates with an AI model on Workers AI:
// Qwen3 30B, or Google's Gemma 4 26B as the second choice.
//
// Workers AI's free plan includes 10,000 Neurons a day, shared by both models
// (one sentence costs about 2–3). When they are used up, requests fail until
// 00:00 UTC (07:00 in Thailand); the free plan has no paid usage, so it can't
// cost anything.
//
// Setup (once): Pages project → Settings → Bindings → Add → Workers AI,
// variable name `AI`, then deploy again.

const MODELS = {
  qwen: {
    name: 'Qwen',
    id: '@cf/qwen/qwen3-30b-a3b-fp8',
    // "/no_think" turns off Qwen3's step-by-step reasoning: faster, and fewer Neurons.
    userSuffix: ' /no_think',
    options: { max_tokens: 400 },
  },
  gemma: {
    name: 'Gemma',
    id: '@cf/google/gemma-4-26b-a4b-it',
    userSuffix: '',
    // Ask for no reasoning; the extra room keeps the answer whole if the model reasons anyway.
    options: { max_completion_tokens: 800, chat_template_kwargs: { enable_thinking: false } },
  },
};
const LANGUAGES = { en: 'English', ja: 'Japanese', th: 'Thai' };
// Limits so the endpoint can only be used for short translations, not as a general free AI.
const MAX_TEXT = 500;
const MAX_CONTEXT = 3;

// Same instructions as src/services/translators/prompt.js (this file is uploaded as-is, so it can't import it).
const systemPrompt = (from, to) => `You are the translation engine of a live speech translator.
Translate the text inside <utterance> from ${from} into ${to}.
The text comes from speech recognition, so punctuation may be missing and a word may be misheard. Translate what the speaker most likely meant, in natural spoken ${to}.
<context> holds the speaker's previous sentences. Use it only to understand names, pronouns and the topic; do not translate it.
Reply with the translation only: no quotes, notes, or romanization.`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/translate') return translate(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

async function translate(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  // Browsers send an Origin header; only pages of this site may use the free allowance.
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'Not allowed from other sites.' }, 403);

  if (!env.AI) {
    return json(
      {
        error: "AI on Cloudflare isn't set up yet: add a Workers AI binding named AI to the Pages project.",
        code: 'not-configured',
      },
      503,
    );
  }

  const body = await request.json().catch(() => null);
  const { text, from, to } = body ?? {};
  const model = MODELS[body?.model ?? 'qwen'];
  if (!model) return json({ error: 'Unknown model.' }, 400);
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
    return json({ error: `Text must be 1–${MAX_TEXT} characters.` }, 400);
  }
  if (!LANGUAGES[from] || !LANGUAGES[to] || from === to) return json({ error: 'Unsupported languages.' }, 400);
  const context = (Array.isArray(body.context) ? body.context : [])
    .filter((line) => typeof line === 'string')
    .slice(-MAX_CONTEXT)
    .map((line) => line.slice(0, MAX_TEXT));

  const contextBlock = context.length ? `<context>\n${context.join('\n')}\n</context>\n\n` : '';
  try {
    const result = await env.AI.run(model.id, {
      messages: [
        { role: 'system', content: systemPrompt(LANGUAGES[from], LANGUAGES[to]) },
        { role: 'user', content: `${contextBlock}<utterance>\n${text}\n</utterance>${model.userSuffix}` },
      ],
      temperature: 0.2,
      ...model.options,
    });
    // Chat models answer in the OpenAI shape; older Workers AI models use `response`.
    const raw = result?.choices?.[0]?.message?.content ?? result?.response ?? '';
    const translation = String(raw)
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();
    if (!translation) return json({ error: `${model.name} returned an empty translation.` }, 502);
    return json({ translation });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/neuron|daily|limit|quota|4006/i.test(message)) {
      return json(
        { error: "Today's free AI allowance on Cloudflare is used up (it resets at 07:00 Thai time).", code: 'quota' },
        429,
      );
    }
    // e.g. the model was retired or moved to the paid plan: let the next engine try.
    return json({ error: `${model.name} on Cloudflare failed: ${message}`, code: 'model-unavailable' }, 502);
  }
}
