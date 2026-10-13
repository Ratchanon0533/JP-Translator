import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './App.module.css';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { ControlDock } from './components/ControlDock.jsx';
import { Header } from './components/Header.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { TranscriptList } from './components/TranscriptList.jsx';
import { getLanguage, isLanguage, LANGUAGES } from './config/languages.js';
import { sameText, useLiveTranslation } from './hooks/useLiveTranslation.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { usePrefersDark } from './hooks/usePrefersDark.js';
import { useSpeechRecognition } from './hooks/useSpeechRecognition.js';
import { withRetry } from './services/retry.js';
import { DEFAULT_OLLAMA_MODEL, ENGINE_CHOICES, engineChain, TRANSLATORS } from './services/translators/index.js';
import { downloadCsv } from './utils/csv.js';

// Bump when a changed default should also reach settings saved in the browser.
const SETTINGS_VERSION = 6;

const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  mode: 'listening', // 'listening' = one-way translation, 'talk' = two people take turns
  lang1: 'ja', // spoken language (Talk mode: person A)
  lang2: 'th', // translated into (Talk mode: person B)
  translator: 'auto', // 'auto' | 'ollama' | 'cloudflare' (Qwen) | 'gemma' | 'mymemory'
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  display: 'both', // 'both' | 'translation' | 'original'
  textSize: 'm',
  theme: 'system',
};

const TEXT_SIZES = { s: '1.05rem', m: '1.25rem', l: '1.5rem', xl: '1.9rem' };
const MAX_HISTORY = 300;
// How many earlier sentences go along as context (the Qwen engines use them; MyMemory ignores them).
const CONTEXT_SIZE = 3;

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function withDefaults(stored) {
  const saved = { ...(stored && typeof stored === 'object' ? stored : {}) };
  const version = saved.version ?? 1;
  // v2 made Ollama the default: settings still on the old default (MyMemory) move over once.
  if (version < 2 && saved.translator === 'mymemory') saved.translator = 'ollama';
  // v4 made Japanese → Thai the default: settings still on the old default pair move over once.
  if (version < 4 && saved.lang1 === 'en' && saved.lang2 === 'ja') {
    saved.lang1 = 'ja';
    saved.lang2 = 'th';
  }
  // v3 removed the Claude engine; also drop its saved API key from the browser.
  delete saved.claudeApiKey;
  delete saved.claudeModel;
  // v5 added "Auto": settings still on the old default (Ollama) move over once.
  // On this PC Auto still uses Ollama first; on other devices it uses Qwen on Cloudflare.
  if (version < 5 && saved.translator === 'ollama') saved.translator = 'auto';
  // v6 put Gemma before Qwen on Cloudflare (Qwen got simple Thai wrong): anyone who had
  // picked Qwen on Cloudflare moves to Auto once, which now uses Gemma first.
  if (version < 6 && saved.translator === 'cloudflare') saved.translator = 'auto';
  if (!ENGINE_CHOICES.some((choice) => choice.id === saved.translator)) delete saved.translator;
  const settings = { ...DEFAULT_SETTINGS, ...saved, version: SETTINGS_VERSION };

  // Only English, Japanese and Thai are offered; a saved language that was
  // removed (e.g. Chinese) is replaced, keeping the two sides different.
  if (!isLanguage(settings.lang1)) settings.lang1 = LANGUAGES.find((l) => l.id !== settings.lang2)?.id;
  if (!isLanguage(settings.lang2) || settings.lang2 === settings.lang1) {
    settings.lang2 = LANGUAGES.find((l) => l.id !== settings.lang1)?.id;
  }
  return settings;
}

// Earlier versions kept the transcript in localStorage under this key.
const OLD_HISTORY_KEY = 'jpt:history';

export default function App() {
  const [settings, setSettings] = useLocalStorage('jpt:settings', DEFAULT_SETTINGS, withDefaults);
  // The transcript lives only in memory, so every page load starts empty
  // (like Mirai, which deletes conversation data). Settings are still saved.
  const [entries, setEntries] = useState([]);
  const prefersDark = usePrefersDark();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [notice, setNotice] = useState(null);
  // The engine that translated the last sentence; live translation follows it.
  const [workingEngine, setWorkingEngine] = useState(null);

  // Async work (speech callbacks, retries) reads the latest values through refs.
  const settingsRef = useRef(settings);
  const entriesRef = useRef(entries);
  useLayoutEffect(() => {
    settingsRef.current = settings;
    entriesRef.current = entries;
  });

  // The latest live translation of the sentence being spoken (see useLiveTranslation).
  const liveLastRef = useRef(null);
  // The "X translated instead" message is shown once per visit, not for every sentence.
  const fallbackNoticeShownRef = useRef(false);

  // Remove any transcript an earlier version left in storage.
  useEffect(() => {
    try {
      localStorage.removeItem(OLD_HISTORY_KEY);
    } catch {
      // Storage blocked: nothing was saved there anyway.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);

  // Let the first engine warm up (Ollama loads its model into the GPU), and
  // forget which engine worked last when the choice changes.
  useEffect(() => {
    engineChain(settings.translator)[0].prepare?.(settings);
    setWorkingEngine(null);
    // Only re-run when the engine or its model changes, not on every setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.translator, settings.ollamaModel]);

  const updateSettings = useCallback((patch) => setSettings((current) => ({ ...current, ...patch })), [setSettings]);

  const updateEntry = useCallback(
    (id, patch) => setEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))),
    [setEntries],
  );

  // Step 2 of the cascade: text → translation (Mirai: `text_processing`).
  // The translation is shown word by word as the engine writes it.
  const translateEntry = useCallback(
    async (entry, context) => {
      const current = settingsRef.current;
      updateEntry(entry.id, { state: 'translating', translation: '', error: null });

      const run = (translator) =>
        withRetry(
          () =>
            translator.translate({
              text: entry.source,
              from: getLanguage(entry.from),
              to: getLanguage(entry.to),
              context,
              settings: current,
              onPartial: (partial) => updateEntry(entry.id, { translation: partial }),
            }),
          {
            onRetry: ({ attempt, error }) =>
              updateEntry(entry.id, { state: 'retrying', attempt, translation: '', error: error.message }),
          },
        );

      // Try the engines in order; one that can't be used right now (Ollama on
      // another device, Cloudflare not set up, a used-up daily allowance) hands
      // the sentence to the next one.
      let firstProblem = null;
      let lastError = null;
      for (const translator of engineChain(current.translator)) {
        try {
          const translation = await run(translator);
          updateEntry(entry.id, { state: 'done', translation, engine: translator.id, error: null });
          setWorkingEngine(translator.id);
          if (firstProblem && !fallbackNoticeShownRef.current) {
            fallbackNoticeShownRef.current = true;
            const problem = firstProblem.message.replace(/([^.!?])$/, '$1.');
            setNotice(`${problem} ${translator.label} translated instead.`);
          }
          return;
        } catch (error) {
          lastError = error;
          if (error?.code !== 'unavailable') break;
          firstProblem ??= error;
        }
      }
      updateEntry(entry.id, { state: 'error', error: lastError?.message ?? String(lastError) });
    },
    [updateEntry],
  );

  const addUtterance = useCallback(
    (text, from, to, side) => {
      const context = entriesRef.current.slice(-CONTEXT_SIZE).map((entry) => entry.source);
      const entry = {
        id: makeId(),
        createdAt: Date.now(),
        source: text,
        from,
        to,
        side,
        translation: '',
        state: 'translating',
        error: null,
      };

      // The words were already translated while being spoken: use that at once.
      const live = liveLastRef.current;
      liveLastRef.current = null;
      if (live && sameText(live.text, text)) {
        setEntries((list) =>
          [...list, { ...entry, state: 'done', translation: live.translation, engine: live.engine }].slice(-MAX_HISTORY),
        );
        return;
      }

      setEntries((list) => [...list, entry].slice(-MAX_HISTORY));
      translateEntry(entry, context);
    },
    [setEntries, translateEntry],
  );

  // Also used for "Translate again" — e.g. after switching engines.
  const retranslateEntry = useCallback(
    (id) => {
      const list = entriesRef.current;
      const index = list.findIndex((entry) => entry.id === id);
      if (index === -1) return;
      const context = list.slice(Math.max(0, index - CONTEXT_SIZE), index).map((entry) => entry.source);
      translateEntry(list[index], context);
    },
    [translateEntry],
  );

  // Step 1 of the cascade: speech → text.
  const { supported, active, interim, start, stop } = useSpeechRecognition({
    onFinal: (text, { from, to, side }) => addUtterance(text, from, to, side),
    onError: setNotice,
  });

  // While someone is still talking, translate their words as they come in —
  // with the engine that handled the last sentence, or else the first choice.
  // (MyMemory never does this: its small daily limit is kept for finished sentences.)
  const liveEngine = TRANSLATORS[workingEngine] ?? engineChain(settings.translator)[0];
  const liveMeta = active?.meta;
  const liveTranslation = useLiveTranslation({
    enabled: Boolean(liveEngine.live && liveMeta),
    text: interim,
    lastRef: liveLastRef,
    minGapMs: liveEngine.liveGapMs,
    translate: async (text) => ({
      engine: liveEngine.id,
      translation: await liveEngine.translate({
        text,
        from: getLanguage(liveMeta.from),
        to: getLanguage(liveMeta.to),
        context: entriesRef.current.slice(-CONTEXT_SIZE).map((entry) => entry.source),
        settings: settingsRef.current,
      }),
    }),
  });

  // Side 'a' speaks language 1; in Talk mode side 'b' speaks language 2.
  const startListening = useCallback(
    (side) => {
      const current = settingsRef.current;
      const [from, to] = side === 'b' ? [current.lang2, current.lang1] : [current.lang1, current.lang2];
      setNotice(null);
      liveLastRef.current = null;
      // Make sure the model is loaded before the first sentence arrives.
      engineChain(current.translator)[0].prepare?.(current);
      start(getLanguage(from).speech, { from, to, side });
    },
    [start],
  );

  const lang1 = getLanguage(settings.lang1);
  const lang2 = getLanguage(settings.lang2);
  const listening = active !== null;
  const talk = settings.mode === 'talk';

  return (
    <div className={styles.app} style={{ '--result-size': TEXT_SIZES[settings.textSize] ?? TEXT_SIZES.m }}>
      <Header
        settings={settings}
        onChange={updateSettings}
        locked={listening}
        isDark={isDark}
        onToggleTheme={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <TranscriptList
        entries={entries}
        display={settings.display}
        talk={talk}
        emptyText={
          !supported
            ? 'Type a sentence to translate it.'
            : talk
              ? 'Tap your language and speak.'
              : 'Tap the mic and speak.'
        }
        onRetranslate={retranslateEntry}
      />
      <ControlDock
        mode={settings.mode}
        lang1={lang1}
        lang2={lang2}
        supported={supported}
        activeSide={liveMeta?.side ?? null}
        interim={interim}
        liveTranslation={liveTranslation?.translation ?? ''}
        liveLang={liveMeta ? getLanguage(liveMeta.to).speech : undefined}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        onStart={startListening}
        onStop={stop}
        onSubmitText={(text) => addUtterance(text, settings.lang1, settings.lang2, 'a')}
      />
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        locked={listening}
        hasHistory={entries.length > 0}
        onExport={() => downloadCsv(entries)}
        onClear={() => setConfirmingClear(true)}
      />
      <ConfirmDialog
        open={confirmingClear}
        title="Clear history?"
        message="This removes every sentence and translation on screen. Download the CSV first if you want to keep them."
        confirmLabel="Clear history"
        onConfirm={() => {
          setEntries([]);
          setConfirmingClear(false);
        }}
        onCancel={() => setConfirmingClear(false)}
      />
    </div>
  );
}
