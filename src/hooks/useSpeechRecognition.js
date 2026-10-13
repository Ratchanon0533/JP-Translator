import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const Recognition =
  typeof window === 'undefined' ? undefined : window.SpeechRecognition ?? window.webkitSpeechRecognition;

const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for this site, then press Start again.',
  'service-not-allowed': 'This browser does not allow speech recognition here. Try Chrome or Edge.',
  'audio-capture': 'No microphone was found.',
  network: 'Could not reach the speech recognition service. Check your internet connection.',
  'language-not-supported': 'This browser cannot recognize speech in that language.',
};

// Browsers end a recognition session after a pause or about a minute, and we
// restart it. If that happens too often in a short time, something is wrong.
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 10_000;

// Wraps the browser's Web Speech API. This replaces Mirai's whole audio
// pipeline (AudioWorklet → 16 kHz PCM → WebSocket → speech server): the
// browser records the mic, sends it to its own speech service and hands back
//   - interim text while someone is still talking (Mirai: `voice_recognizing`)
//   - final text once they pause                    (Mirai: `voice_recognized`)
//
// `meta` is any object passed to start(); it comes back with each final
// sentence so the caller knows which speaker/direction it belongs to.
export function useSpeechRecognition({ onFinal, onError }) {
  const [active, setActive] = useState(null); // { lang, meta } while listening
  const [interim, setInterim] = useState('');
  const sessionRef = useRef(null);
  const interimRef = useRef('');
  const handlersRef = useRef({ onFinal, onError });

  useLayoutEffect(() => {
    handlersRef.current = { onFinal, onError };
  });

  const setPending = useCallback((text) => {
    interimRef.current = text;
    setInterim(text);
  }, []);

  const clear = useCallback(() => {
    sessionRef.current = null;
    setActive(null);
    setPending('');
  }, [setPending]);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    clear();
    // stop() (unlike abort()) still delivers the sentence that was in progress.
    session?.rec.stop();
  }, [clear]);

  const start = useCallback(
    (lang, meta) => {
      if (!Recognition) return;

      const previous = sessionRef.current;
      if (previous) {
        // Switching speakers mid-sentence: keep what was heard so far.
        const pending = interimRef.current.trim();
        if (pending) handlersRef.current.onFinal(pending, previous.meta);
        clear();
        previous.rec.abort();
      }

      const rec = new Recognition();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      const session = { rec, meta, restarts: [] };
      const isCurrent = () => sessionRef.current === session;

      rec.onresult = (event) => {
        let pending = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            if (text.trim()) handlersRef.current.onFinal(text.trim(), meta);
          } else {
            pending += text;
          }
        }
        if (isCurrent()) setPending(pending);
      };

      rec.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (isCurrent()) clear();
        handlersRef.current.onError?.(ERROR_MESSAGES[event.error] ?? `Speech recognition error: ${event.error}`);
      };

      rec.onend = () => {
        if (!isCurrent()) return;
        const now = Date.now();
        session.restarts = session.restarts.filter((time) => now - time < RESTART_WINDOW_MS);
        session.restarts.push(now);
        if (session.restarts.length > MAX_RESTARTS) {
          clear();
          handlersRef.current.onError?.('Speech recognition keeps stopping. Press Start to try again.');
          return;
        }
        setPending('');
        try {
          rec.start();
        } catch {
          clear();
        }
      };

      sessionRef.current = session;
      setActive({ lang, meta });
      try {
        rec.start();
      } catch (error) {
        clear();
        handlersRef.current.onError?.(`Could not start speech recognition: ${error.message}`);
      }
    },
    [clear, setPending],
  );

  useEffect(() => () => sessionRef.current?.rec.abort(), []);

  return { supported: Boolean(Recognition), active, interim, start, stop };
}
