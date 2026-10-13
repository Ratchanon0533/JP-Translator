import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './App.module.css';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { ControlDock } from './components/ControlDock.jsx';
import { Header } from './components/Header.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { TranscriptList } from './components/TranscriptList.jsx';
import { getLanguage } from './config/languages.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { useSpeechRecognition } from './hooks/useSpeechRecognition.js';
import { withRetry } from './services/retry.js';
import { DEFAULT_OLLAMA_MODEL, getTranslator } from './services/translators/index.js';
import { downloadCsv } from './utils/csv.js';

// Bump when a changed default should also reach settings saved in the browser.
const SETTINGS_VERSION = 2;

const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  mode: 'listening', // 'listening' = one-way translation, 'talk' = two people take turns
  lang1: 'en',
  lang2: 'ja',
  translator: 'ollama', // 'ollama' | 'mymemory' | 'claude'
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  claudeApiKey: '',
  claudeModel: 'claude-opus-5-5',
  display: 'both', // 'both' | 'translation' | 'original'
  textSize: 'm',
  theme: 'system',
};

const TEXT_SIZES = { s: '1.05rem', m: '1.25rem', l: '1.5rem', xl: '1.9rem' };
const MAX_HISTORY = 300;
// How many earlier sentences go along as context (the AI engines use them; MyMemory ignores them).
const CONTEXT_SIZE = 3;

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function withDefaults(stored) {
  const saved = stored && typeof stored === 'object' ? stored : {};
  const settings = { ...DEFAULT_SETTINGS, ...saved, version: SETTINGS_VERSION };
  // v2 made Ollama the default. Settings saved before still hold the old
  // default (MyMemory), so move those over once; a deliberate Claude choice stays.
  if ((saved.version ?? 1) < 2 && saved.translator === 'mymemory') settings.translator = 'ollama';
  return settings;
}

// A translation that was still running when the page closed can't finish; offer a retry instead.
const restoreHistory = (stored) =>
  Array.isArray(stored)
    ? stored.map((entry) =>
        entry.state === 'translating' || entry.state === 'retrying'
          ? { ...entry, state: 'error', error: 'Interrupted when the page closed.' }
          : entry,
      )
    : [];

export default function App() {
  const [settings, setSettings] = useLocalStorage('jpt:settings', DEFAULT_SETTINGS, withDefaults);
  const [entries, setEntries] = useLocalStorage('jpt:history', [], restoreHistory);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [notice, setNotice] = useState(null);

  // Async work (speech callbacks, retries) reads the latest values through refs.
  const settingsRef = useRef(settings);
  const entriesRef = useRef(entries);
  useLayoutEffect(() => {
    settingsRef.current = settings;
    entriesRef.current = entries;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Let the chosen engine warm up (Ollama loads its model into the GPU).
  useEffect(() => {
    getTranslator(settings.translator).prepare?.(settings);
    // Only re-run when the engine or its model changes, not on every setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.translator, settings.ollamaModel]);

  const updateSettings = useCallback((patch) => setSettings((current) => ({ ...current, ...patch })), [setSettings]);

  const updateEntry = useCallback(
    (id, patch) => setEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))),
    [setEntries],
  );

  // Step 2 of the cascade: text → translation (Mirai: `text_processing`).
  const translateEntry = useCallback(
    async (entry, context) => {
      const current = settingsRef.current;
      const translator = getTranslator(current.translator);
      updateEntry(entry.id, { state: 'translating', error: null });
      try {
        const translation = await withRetry(
          () =>
            translator.translate({
              text: entry.source,
              from: getLanguage(entry.from),
              to: getLanguage(entry.to),
              context,
              settings: current,
            }),
          { onRetry: ({ attempt, error }) => updateEntry(entry.id, { state: 'retrying', attempt, error: error.message }) },
        );
        updateEntry(entry.id, { state: 'done', translation, engine: translator.id, error: null });
      } catch (error) {
        updateEntry(entry.id, { state: 'error', error: error?.message ?? String(error) });
      }
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

  // Side 'a' speaks language 1; in Talk mode side 'b' speaks language 2.
  const startListening = useCallback(
    (side) => {
      const { lang1, lang2 } = settingsRef.current;
      const [from, to] = side === 'b' ? [lang2, lang1] : [lang1, lang2];
      setNotice(null);
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
        activeSide={active?.meta.side ?? null}
        interim={interim}
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
        message="This deletes every saved sentence and translation in this browser. It can't be undone."
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
