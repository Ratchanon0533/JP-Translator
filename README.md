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

For the default translation engine, install [Ollama](https://ollama.com) and run
`ollama pull qwen3:8b` once.

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
     ├── Ollama    – free AI (Qwen) running on this PC (default)
     └── MyMemory  – free online machine translation, no install
             │  fails? retry 1s → 2s → 4s … (+ jitter) ← src/services/retry.js
             ▼
 transcript (original + translation)                 ← src/components/TranscriptList.jsx
```

- **Listening mode:** one-way. Speech in language 1 is translated into language 2.
- **Talk mode:** two people take turns, each tapping their own mic button. Lines sit left and
  right like a chat.
- You can also **type** a sentence instead of speaking.
- The transcript **resets every time the page loads** (it is kept only in memory), so download
  it as **CSV** if you want to keep it. Settings (languages, engine, theme…) are saved.
- The ☀/☾ button at the top switches between light and dark; *Settings → Theme → Auto*
  follows the system again.

## Why it feels fast in conversation

Translating only takes Qwen about 0.2–0.7 s. Most of the delay used to be **waiting for the
browser to decide a sentence was finished**, which Chrome does only after a pause of a second or
more. So, like Mirai (which splits speech instead of waiting for the speaker to stop):

1. **Live translation** (`hooks/useLiveTranslation.js`): while you are still talking, the words
   so far are translated and shown under the caption. Only with Ollama, since it is local and free.
2. **No waiting for Chrome** (`hooks/useSpeechRecognition.js`): when the words haven't changed for
   0.8 s, the app asks Chrome to finish the sentence and keeps listening. If the live translation
   already matches the finished sentence, it is used immediately.
3. **Streaming**: translations appear word by word as Qwen writes them.
4. **Warm model**: Qwen is loaded into the GPU when the page opens and when you press the mic,
   and kept there for an hour.

A short pause in the middle of a sentence may split it into two lines; that is the trade-off.

## Compared with Mirai's Listening Assistant

| Mirai Listening Assistant | This project |
|---|---|
| Next.js static export on S3 + CloudFront | Vite + React single-page app |
| AudioWorklet → 16 kHz PCM → WebSocket → Mirai's servers | Web Speech API. The browser sends audio to its own speech service (Google, in Chrome) |
| Server-side translation (cascade, now End2End) | `translators/`: Ollama (local Qwen) or MyMemory |
| Splits speech at readable points instead of waiting | Live translation + finishing a sentence after 0.8 s without change |
| `vendorStrategyAtom` swaps engines (type_a / type_s) | `translators/index.js` registry with the same `translate()` shape |
| REST retry with exponential backoff and jitter | `services/retry.js` |
| jotai `atomWithStorage` settings | `hooks/useLocalStorage.js` |
| CSS Modules | CSS Modules |
| Listening / Talk modes, CSV download, "最新へ" button | Same |
| Phrase list (custom vocabulary) | Not yet (see ideas) |

## Project structure

```
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
    translators/                Ollama, MyMemory, shared prompt and error type
  components/                   Header (language switch), TranscriptList, ControlDock,
                                SettingsPanel, ConfirmDialog, Segmented, Icon
  utils/                        CSV export, time formatting
```

## Things to know

- **Privacy:** in Chrome, speech recognition runs on Google's servers. With Ollama, translation
  stays on your PC; with MyMemory, the text goes to MyMemory.
- **Ollama** (the default) runs an open model such as Qwen on your own GPU: free, private, and
  much more natural than MyMemory. The first sentence after a restart can take up to a minute
  while the model loads; after that it's well under a second. It only works on the PC running
  Ollama, so on other devices switch to MyMemory in Settings.
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
- A phrase list passed to Qwen as hints for names and jargon
