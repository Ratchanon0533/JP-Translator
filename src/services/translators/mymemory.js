import { TranslationError } from './errors.js';

const ENDPOINT = 'https://api.mymemory.translated.net/get';

// MyMemory rejects a query longer than 500 bytes, so long text is sent in pieces.
// Japanese/Thai characters take 3 bytes each in UTF-8, so the limit is in bytes.
const MAX_BYTES = 450;
const encoder = new TextEncoder();
const byteLength = (text) => encoder.encode(text).length;

// Japanese and Thai are written without spaces between words.
const NO_SPACES = new Set(['ja', 'th']);

// The writing system each language uses. A "Japanese translation" with no
// Japanese characters in it (like "hi" or "konnichiwa") is junk.
const SCRIPTS = {
  en: /\p{Script=Latin}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  th: /\p{Script=Thai}/u,
};
const scriptOf = (language) => SCRIPTS[language.id] ?? SCRIPTS.en;

// For comparing phrases: ignore case, extra spaces and a closing full stop / ! / ?.
const ENDING = /[.!?。！？]+$/u;
const normalize = (text) => text.trim().replace(/\s+/g, ' ').replace(ENDING, '').toLowerCase();

function splitText(text) {
  if (byteLength(text) <= MAX_BYTES) return [text];

  const sentences = text.match(/[^。．.!?！？\n]+[。．.!?！？\n]*/g) ?? [text];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (byteLength(current + sentence) <= MAX_BYTES) {
      current += sentence;
      continue;
    }
    if (current) chunks.push(current);
    // A sentence that is too long on its own is cut character by character.
    let piece = '';
    for (const char of sentence) {
      if (byteLength(piece + char) > MAX_BYTES) {
        chunks.push(piece);
        piece = '';
      }
      piece += char;
    }
    current = piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

// MyMemory sometimes returns HTML entities such as &#39; inside the text.
function decodeEntities(text) {
  return new DOMParser().parseFromString(text, 'text/html').documentElement.textContent ?? text;
}

// MyMemory answers with several candidates: crowd-sourced "translation memory"
// entries plus, sometimes, one machine translation (created by "MT!"). Its own
// pick is just the top memory entry, which can be empty, untranslated, misspelt
// or a Wikipedia title for a similar phrase. So we choose ourselves:
//   1. a memory entry for this exact phrase (the answer most entries agree on), else
//   2. the machine translation, else
//   3. any other close, valid entry.
function pickTranslation(data, query, from, to) {
  const target = scriptOf(to);
  const wanted = normalize(query);
  const differentScripts = scriptOf(from) !== target;

  const isValid = (text) =>
    Boolean(text) && target.test(text) && !(differentScripts && normalize(text) === wanted);

  const candidates = (data.matches ?? [])
    .map((match) => ({
      text: decodeEntities(String(match.translation ?? '')).trim(),
      segment: normalize(String(match.segment ?? '')),
      by: match['created-by'],
      score: Number(match.match) || 0,
      quality: Number(match.quality) || 0,
    }))
    .filter((candidate) => candidate.by !== 'Wikipedia' && isValid(candidate.text));

  const votes = new Map();
  for (const { text } of candidates) votes.set(normalize(text), (votes.get(normalize(text)) ?? 0) + 1);
  const support = (candidate) => votes.get(normalize(candidate.text));
  candidates.sort((a, b) => support(b) - support(a) || b.score - a.score || b.quality - a.quality);

  const best =
    candidates.find((c) => c.by !== 'MT!' && c.segment === wanted) ??
    candidates.find((c) => c.by === 'MT!') ??
    candidates.find((c) => c.score >= 0.9);
  return best?.text ?? null;
}

async function translateChunk(query, from, to) {
  const translation = pickTranslation(await lookUp(query, from, to), query, from, to);
  if (translation || ENDING.test(query.trim())) return translation;

  // When MyMemory has a stored entry for the exact phrase it skips its machine
  // translator, so if every stored entry was junk there is nothing left.
  // Adding a full stop makes it a new phrase and the machine translator runs;
  // the full stop is removed from the answer again.
  const stop = from.id === 'ja' ? '。' : '.';
  const retry = pickTranslation(await lookUp(query + stop, from, to), query + stop, from, to);
  return retry?.replace(/[.。]$/u, '') ?? null;
}

async function lookUp(query, from, to) {
  const url = `${ENDPOINT}?${new URLSearchParams({ q: query, langpair: `${from.translate}|${to.translate}` })}`;

  let response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new TranslationError('Network error: could not reach MyMemory.', { retryable: true, cause });
  }
  if (!response.ok) {
    throw new TranslationError(`MyMemory returned HTTP ${response.status}.`, {
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  const data = await response.json().catch(() => null);
  const status = Number(data?.responseStatus);
  if (status === 429 || data?.quotaFinished) {
    // The free daily quota is used up; retrying today won't help.
    throw new TranslationError('MyMemory free daily limit reached. Switch to Ollama in Settings or try tomorrow.');
  }
  if (status !== 200) {
    throw new TranslationError(`MyMemory: ${data?.responseDetails || 'unexpected response'}`, { retryable: status >= 500 });
  }
  return data;
}

export const mymemory = {
  id: 'mymemory',
  label: 'MyMemory',
  description: 'Free, no sign-up. Basic machine translation, about 5,000 characters a day.',

  async translate({ text, from, to }) {
    const results = [];
    for (const chunk of splitText(text)) {
      const translation = await translateChunk(chunk, from, to);
      if (!translation) {
        throw new TranslationError('MyMemory has no reliable translation for this. Try Ollama in Settings.');
      }
      results.push(translation);
    }
    return results.join(NO_SPACES.has(to.id) ? '' : ' ');
  },
};
