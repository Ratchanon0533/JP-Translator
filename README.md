# JP Translator

A study project: a live speech translator built with **React + Vite**. Its structure follows
Mirai Translate's *Listening Assistant* (リスニングアシスタント), using the **cascade** method:
speech → text → translation. Everything it uses is free.

## Run it

```bash
npm install
npm run dev
```

(In Windows PowerShell, if `npm` is blocked by the script execution policy, use `npm.cmd run dev`.)

Open <http://localhost:5174> in **Chrome or Edge** (desktop or Android) or **Safari**. Allow the
microphone when asked. Firefox can't recognize speech, but you can still type.

With `npm run dev`, translation uses MyMemory: the AI engines (Gemma and Llama) run in
`_worker.js`, which only exists once the site is deployed on Cloudflare.

## Deploy (Cloudflare Pages)

1. `npm run build`, then upload the `dist` folder in the Pages dashboard (drag and drop works).
   `dist/_worker.js` is the small server part; it comes from `public/_worker.js`.
2. Once: Pages project → **Settings → Bindings → Add → Workers AI**, variable name `AI`,
   then upload again. This turns on Gemma on Cloudflare (the default engine) for every
   device, phones too. No separate Worker is needed: `_worker.js` runs inside the Pages project.
3. Keep the Cloudflare account on the **Workers Free** plan: it has no paid usage, so it can't
   cost anything. When the 10,000 free daily Neurons (≈ thousands of sentences) are used up,
   the app switches to MyMemory until 00:00 UTC (07:00 in Thailand).

## How it works

```
 microphone
     │
     ▼
 Web Speech API (built into the browser)            ← src/hooks/useSpeechRecognition.js
     ├── interim text  → live caption + live translation   (Mirai: voice_recognizing)
     └── final sentence                                     (Mirai: voice_recognized)
             │
             ▼
 translator.translate()                              ← src/services/translators/
     ├── Gemma     – Google's Gemma 4 26B on Cloudflare Workers AI (default, any device) ← public/_worker.js
     ├── Llama     – Meta's Llama 4 Scout on Cloudflare (reserve, if Gemma is retired or broken)
     └── MyMemory  – basic online machine translation (last resort)
             │  "Auto" (default) tries them in that order; an engine that can't be
             │  used right now hands the sentence to the next one
             │  fails? retry 1s → 2s → 4s … (+ jitter) ← src/services/retry.js
             ▼
 transcript (original + translation)                 ← src/components/TranscriptList.jsx
```

- **Languages:** English, Japanese and Thai. The default is Japanese speech → Thai; tap the
  language names at the top to change it (your choice is remembered).
- **Listening mode:** one-way. Speech in language 1 is translated into language 2.
- **Talk mode:** two people take turns, each tapping their own mic button. Lines sit left and
  right like a chat.
- You can also **type** a sentence instead of speaking.
- The transcript **resets every time the page loads** (it is kept only in memory), so download
  it as **CSV** if you want to keep it. Settings (languages, engine, theme…) are saved.
- The ☀/☾ button at the top switches between light and dark; *Settings → Theme → Auto*
  follows the system again.

## Why it feels fast in conversation

Translating a sentence takes about 0.5–1 s with Gemma. Most of the delay used to be **waiting
for the browser to decide a sentence was finished**, which Chrome does only after a pause of a
second or more. So, like Mirai (which splits speech instead of waiting for the speaker to stop):

1. **Live translation** (`hooks/useLiveTranslation.js`): while you are still talking, the words
   so far appear above the input as they are heard (new words fade in), and are translated and
   shown under them, about once a second (to save the daily allowance); never with MyMemory.
2. **No waiting for Chrome** (`hooks/useSpeechRecognition.js`): when the words haven't changed for
   0.8 s, the app asks Chrome to finish the sentence and keeps listening. If the live translation
   already matches the finished sentence, it is used immediately; otherwise it is shown faded in
   the transcript until the final translation arrives.

3. **Sentences carry on across short pauses** (`utils/sentence.js`): finishing early also ends a
   sentence at a thinking pause ("Japan and Thailand is" … "should never …"). So when the speaker
   goes on soon after, the new words join the same line, which is translated again as a whole.
   How soon depends on the last words: up to 4 s after an ending that leaves the sentence open
   ("is", "and", "in"; は, て, から; ที่, จะ, และ), up to 2 s after other endings, and never after
   one that closes it (? ; です, ますか; ครับ, ค่ะ). A line stops growing at about 200 characters
   (90 in Japanese).

**Android:** Chrome there ends speech recognition at every pause by itself, plays a beep each
time it starts listening again (Android's sound: web pages can't turn it off), and sends the same
sentence two or three times. So on Android the app doesn't finish sentences early (that would
only add beeps), uses one recognition session per sentence, and drops repeated sentences; one that
comes back with more words replaces the earlier line.

## Compared with Mirai's Listening Assistant

| Mirai Listening Assistant | This project |
|---|---|
| Next.js static export on S3 + CloudFront | Vite + React single-page app |
| AudioWorklet → 16 kHz PCM → WebSocket → Mirai's servers | Web Speech API. The browser sends audio to its own speech service (Google, in Chrome) |
| Server-side translation (cascade, now End2End) | Gemma on Cloudflare Workers AI (`_worker.js`), Llama and MyMemory as backups |
| Splits speech at readable points instead of waiting | Live translation + finishing a sentence after 0.8 s without change |
| `vendorStrategyAtom` swaps engines (type_a / type_s) | `translators/index.js` registry with the same `translate()` shape |
| REST retry with exponential backoff and jitter | `services/retry.js` |
| jotai `atomWithStorage` settings | `hooks/useLocalStorage.js` |
| CSS Modules | CSS Modules |
| Listening / Talk modes, CSV download, "最新へ" button | Same |
| Phrase list (custom vocabulary) | Not yet (see ideas) |

## Project structure

```
public/
  _worker.js                    Cloudflare server part: POST /api/translate → Gemma (or Llama) on Workers AI
src/
  App.jsx                       wires speech → translation → transcript
  config/languages.js           language codes for speech and translation
  hooks/
    useSpeechRecognition.js     Web Speech API wrapper (interim/final, early finish, auto-restart)
    useLiveTranslation.js       translates words while they are still being spoken
    useLocalStorage.js          settings saved in localStorage
    usePrefersDark.js           follows the system's light/dark mode
  services/
    retry.js                    exponential backoff
    translators/                Gemma + Llama (Cloudflare), MyMemory, engine order ("Auto")
  components/                   Header (language switch), TranscriptList, ControlDock,
                                LiveText (words appearing, dots), SettingsPanel,
                                ConfirmDialog, Segmented, Icon
  utils/                        CSV export, time formatting, sentence endings (carry on a line)
```

## Things to know

- **Privacy:** in Chrome, speech recognition runs on Google's servers, and the text to translate
  goes to Cloudflare (Gemma, Llama) or MyMemory.
- **Gemma on Cloudflare** (Gemma 4 26B, Workers AI free plan) is the default. It works on every
  device and gave the most natural Thai and Japanese in tests (e.g. อรุณสวัสดิ์ →
  おはようございます; Qwen3 30B on Cloudflare answered 朝の挨拶 "morning greeting", so it was
  removed). `_worker.js` only accepts short English/Japanese/Thai translations from the site's
  own pages, so others can't spend the free allowance on something else.
- **Llama on Cloudflare** (Llama 4 Scout, Meta) is the reserve: from a different company than
  Gemma, officially supports Thai, and only used if Gemma is retired or fails. It shares Gemma's
  free daily allowance (≈ 8 Neurons a sentence vs ≈ 3), so when the allowance is used up the app
  skips Cloudflare until 07:00 Thai time instead of asking again. Rejected candidates: GLM-4.7
  Flash (left Japanese → Thai untranslated in a test), gpt-oss (always reasons first: slow).
- **MyMemory** allows roughly 5,000 characters a day for free. Its own "best" answer is often a
  junk crowd-sourced entry (e.g. "hello" → empty, "こんばんは" → a Wikipedia title), so
  `mymemory.js` picks from all candidates itself: right script, exact phrase, majority vote,
  then the machine translation.
- Hover a line and press ↻ to translate it again (e.g. after switching engines).
- Speech recognition usually has no punctuation, and Chrome restarts it after pauses. The app
  restarts it automatically.

## Ideas to extend

- Furigana / romaji under Japanese results (e.g. `kuroshiro` + `kuromoji`)
- A word list: save words from translations to review later
- Read translations aloud with `speechSynthesis`
- A volume meter using `AudioContext` + `AnalyserNode` (like Mirai's VolumeBar)
- A phrase list passed to the AI as hints for names and jargon
