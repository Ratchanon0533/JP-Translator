# JP Translator

A study project: a live speech translator built with **React + Vite**. Its structure follows
Mirai Translate's *Listening Assistant* (リスニングアシスタント), using the **cascade** method:
speech → text → translation.

## Run it

```bash
npm install
npm run dev
```

(In Windows PowerShell, if `npm` is blocked by the script execution policy, use `npm.cmd run dev`.)

Open <http://localhost:5174> in **Chrome or Edge** (desktop or Android) or **Safari**. Allow the
microphone when asked. Firefox can't recognize speech, but you can still type.

## How it works

```
 microphone
     │
     ▼
 Web Speech API (built into the browser)            ← src/hooks/useSpeechRecognition.js
     ├── interim text  → live caption at the bottom    (Mirai: voice_recognizing)
     └── final sentence                                 (Mirai: voice_recognized)
             │
             ▼
 translator.translate()                              ← src/services/translators/
     ├── Ollama    – free AI (Qwen) running on this PC (default)
     ├── MyMemory  – free machine translation, no key
     └── Claude    – context-aware, needs your API key
             │  fails? retry 1s → 2s → 4s … (+ jitter) ← src/services/retry.js
             ▼
 transcript card (original + translation)            ← src/components/TranscriptList.jsx
```

- **Listening mode:** one-way. Speech in language 1 is translated into language 2.
- **Talk mode:** two people take turns, each tapping their own mic button. Cards line up
  left and right like a chat.
- You can also **type** a sentence instead of speaking.
- History is saved in the browser (localStorage) and can be exported as **CSV**.

## Compared with Mirai's Listening Assistant

| Mirai Listening Assistant | This project |
|---|---|
| Next.js static export on S3 + CloudFront | Vite + React single-page app |
| AudioWorklet → 16 kHz PCM → WebSocket → Mirai's servers | Web Speech API. The browser sends audio to its own speech service (Google, in Chrome) |
| Server-side translation (cascade, now End2End) | `translators/`: Ollama (local Qwen), MyMemory or Claude |
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
    useSpeechRecognition.js     Web Speech API wrapper (interim/final, auto-restart)
    useLocalStorage.js          state saved in localStorage
  services/
    retry.js                    exponential backoff
    translators/                Ollama, MyMemory, Claude, shared prompt and error type
  components/                   Header (language switch), TranscriptList, ControlDock,
                                SettingsPanel, ConfirmDialog, Segmented, Icon
  utils/                        CSV export, time formatting
```

## Things to know

- **Privacy:** in Chrome, speech recognition runs on Google's servers. With Ollama, translation
  stays on your PC; with MyMemory or Claude, the text goes to them.
- **MyMemory** allows roughly 5,000 characters a day for free. Its own "best" answer is often a
  junk crowd-sourced entry (e.g. "hello" → empty, "こんばんは" → a Wikipedia title), so
  `mymemory.js` picks from all candidates itself: right script, exact phrase, majority vote,
  then the machine translation.
- Hover a line and press ↻ to translate it again (e.g. after switching engines).
- **Ollama** (the default) runs an open model such as Qwen on your own GPU: free, private, and
  much more natural than MyMemory. Install Ollama and run `ollama pull qwen3:8b`. The first
  sentence after a restart can take up to a minute while the model loads; after that it's about a
  second. It only works on the PC running Ollama, so on other devices switch to MyMemory or
  Claude in Settings.
- **Claude** needs an Anthropic API key (Settings → Translation engine). The key is stored in
  this browser's localStorage and sent directly to Anthropic, which is fine for personal use.
  A public site should keep the key on a server.
- Speech recognition usually has no punctuation, and Chrome restarts it after pauses. The app
  restarts it automatically.

## Ideas to extend

- Furigana / romaji under Japanese results (e.g. `kuroshiro` + `kuromoji`)
- A word list: save words from translations to review later
- Read translations aloud with `speechSynthesis`
- A volume meter using `AudioContext` + `AnalyserNode` (like Mirai's VolumeBar)
- A phrase list that is passed to Claude as hints for names and jargon
