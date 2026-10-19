import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Looked up each time rather than once, so a test can stand in a fake recognizer.
const getRecognition = () =>
  typeof window === 'undefined' ? undefined : (window.SpeechRecognition ?? window.webkitSpeechRecognition);

// Safari (iPhone, iPad and Mac) needs its own instructions: its speech
// recognition runs on Apple's Dictation, and without Dictation (or Siri) turned
// on it fails without ever showing a microphone popup.
const isSafari = () => /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(navigator.userAgent);
const isAppleMobile = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Chrome on Android has its own quirks: in continuous mode it sends the same
// sentence two or three times (and again with more words), and it marks words
// that are still changing as "final", with a confidence of 0.
const isAndroid = () => /android/i.test(navigator.userAgent);

const normalize = (text) => text.trim().replace(/\s+/g, ' ');

const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for this site, then press Start again.',
  'service-not-allowed': 'This browser does not allow speech recognition here. Try Chrome or Edge.',
  'audio-capture': 'No microphone was found.',
  network: 'Could not reach the speech recognition service. Check your internet connection.',
  'language-not-supported': 'This browser cannot recognize speech in that language.',
};

// Safari reports 'service-not-allowed' before it ever asks for the microphone, when
// (WebKit's SpeechRecognitionPermissionManager): Safari may not use Apple's speech
// recognition (Privacy & Security setting, or Siri & Dictation off/restricted), or
// the recognizer isn't available for the spoken language.
const SAFARI_MESSAGES = {
  phone: {
    'service-not-allowed': (language) =>
      `Safari couldn't start speech recognition for ${language}. Check that Settings → Privacy & Security → Speech Recognition → Safari is on, and that Settings → General → Keyboard → Enable Dictation is on, then reload. If another spoken language works, ${language} recognition isn't available on this device.`,
    'not-allowed': () =>
      'Safari blocked the microphone for this site: tap the page menu (aA) in the address bar → Website Settings → Microphone → Allow, then reload.',
  },
  mac: {
    'service-not-allowed': (language) =>
      `Safari couldn't start speech recognition for ${language}. Check that System Settings → Privacy & Security → Speech Recognition → Safari is on, and that System Settings → Keyboard → Dictation is on, then reload.`,
    'not-allowed': () =>
      'Safari blocked the microphone for this site: Safari → Settings → Websites → Microphone → set this site to Allow, then reload.',
  },
};

// "th-TH" → "Thai", for messages.
const languageName = (lang) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(lang.split('-')[0]) ?? lang;
  } catch {
    return lang;
  }
};

function errorMessage(code, lang) {
  if (isSafari()) {
    const message = SAFARI_MESSAGES[isAppleMobile() ? 'phone' : 'mac'][code];
    if (message) return message(languageName(lang));
  }
  return ERROR_MESSAGES[code] ?? `Speech recognition error: ${code}`;
}

// Shown when the microphone never starts: no popup, no error, nothing.
function noStartHint() {
  if (isSafari()) {
    return isAppleMobile()
      ? 'No microphone popup? Check that Dictation is on (Settings → General → Keyboard → Enable Dictation), that this site is allowed in Website Settings → Microphone, and that the page is open in Safari itself, not from the Home Screen.'
      : 'No microphone popup? Check that Dictation is on (System Settings → Keyboard → Dictation) and that this site is allowed in Safari → Settings → Websites → Microphone.';
  }
  return "The microphone hasn't started. If no permission popup appeared, allow the microphone in the browser's site settings and press Start again.";
}

// How long to wait for the microphone to start before showing what to check.
const START_TIMEOUT_MS = 6000;

// Browsers end a recognition session after a pause or about a minute, and we
// restart it. A session that ends almost at once without hearing anything,
// again and again in a short time, means something is wrong.
const QUICK_END_MS = 2000;
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 10_000;

// A sentence that repeats the one just finished (or part of it) this soon is a
// duplicate from the browser, not something said twice.
const REPEAT_WINDOW_MS = 3000;

// Chrome only marks a sentence "final" after a pause of a second or more, and
// in quick conversation it can hold it much longer. When the words haven't
// changed for this long, we ask Chrome to finish the sentence right away
// (Mirai likewise splits speech instead of waiting for the speaker to stop).
const COMMIT_AFTER_MS = 800;

// Wraps the browser's Web Speech API. This replaces Mirai's whole audio
// pipeline (AudioWorklet → 16 kHz PCM → WebSocket → speech server): the
// browser records the mic, sends it to its own speech service and hands back
//   - interim text while someone is still talking (Mirai: `voice_recognizing`)
//   - final text once they pause                    (Mirai: `voice_recognized`)
//
// `meta` is any object passed to start(); it comes back with each final
// sentence so the caller knows which speaker/direction it belongs to.
// onFinal(text, meta) returns an id for the sentence; when the browser sends the
// same sentence again with more words, onRevise(id, text, meta) replaces it.
export function useSpeechRecognition({ onFinal, onRevise, onError }) {
  // { lang, meta, ready } while listening; `ready` turns true once the microphone has started.
  const [active, setActive] = useState(null);
  const [interim, setInterim] = useState('');
  const sessionRef = useRef(null);
  const interimRef = useRef('');
  const handlersRef = useRef({ onFinal, onRevise, onError });

  useLayoutEffect(() => {
    handlersRef.current = { onFinal, onRevise, onError };
  });

  const setPending = useCallback((text) => {
    interimRef.current = text;
    setInterim(text);
  }, []);

  const clear = useCallback(() => {
    clearTimeout(sessionRef.current?.commitTimer);
    clearTimeout(sessionRef.current?.startTimer);
    sessionRef.current = null;
    setActive(null);
    setPending('');
  }, [setPending]);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    // stop() (unlike abort()) still delivers the sentence that was in progress;
    // these words are kept in case it doesn't (see onend).
    if (session) session.stoppedWith = interimRef.current;
    clear();
    session?.rec.stop();
  }, [clear]);

  const start = useCallback(
    (lang, meta) => {
      const Recognition = getRecognition();
      if (!Recognition) return;

      const previous = sessionRef.current;
      if (previous) {
        // Switching speakers mid-sentence: keep what was heard so far.
        const pending = interimRef.current.trim();
        if (pending) handlersRef.current.onFinal(pending, previous.meta);
        clear();
        previous.rec.abort();
      }

      const android = isAndroid();
      const rec = new Recognition();
      rec.lang = lang;
      // Android: one sentence per recognition session (its continuous mode repeats
      // results); onend starts the next one straight away, so listening goes on.
      rec.continuous = !android;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      const session = {
        rec,
        meta,
        restarts: [],
        commitTimer: null,
        committing: false,
        started: false,
        startTimer: null,
        // One recognition session, from start() to onend: how many of its results
        // were already used, whether it heard anything, when it began.
        run: null,
        // The last sentence handed over: { id, text, at }.
        last: null,
        // Words still unfinished when the user pressed Stop.
        stoppedWith: '',
      };
      const isCurrent = () => sessionRef.current === session;
      const beginRun = () => {
        session.run = { used: 0, heard: false, startedAt: Date.now() };
      };

      // Hands a finished sentence over once. The browser may send it again (or
      // part of it); if it comes back with more words, the earlier line is replaced.
      const finish = (raw) => {
        const text = normalize(raw);
        session.stoppedWith = '';
        if (!text) return;
        const last = session.last;
        if (last && Date.now() - last.at < REPEAT_WINDOW_MS) {
          if (last.text.includes(text)) return;
          if (text.startsWith(last.text) && handlersRef.current.onRevise) {
            handlersRef.current.onRevise(last.id, text, meta);
            session.last = { ...last, text, at: Date.now() };
            return;
          }
        }
        const id = handlersRef.current.onFinal(text, meta);
        session.last = { id, text, at: Date.now() };
      };

      // The microphone is really listening (after any permission popup was answered).
      // Any sign of life counts, in case a browser skips one of these events.
      const markStarted = () => {
        if (session.started) return;
        session.started = true;
        clearTimeout(session.startTimer);
        if (isCurrent()) setActive((current) => current && { ...current, ready: true });
      };
      rec.onstart = markStarted;
      rec.onaudiostart = markStarted;

      const scheduleCommit = (pending) => {
        clearTimeout(session.commitTimer);
        // Android ends the session by itself at each pause already, and every
        // restart plays its beep, so it isn't stopped any earlier there.
        if (android || !pending.trim()) return;
        session.commitTimer = setTimeout(() => {
          if (!isCurrent() || interimRef.current !== pending) return;
          session.committing = true;
          // Chrome turns the words so far into a final result, then ends; onend restarts it.
          rec.stop();
        }, COMMIT_AFTER_MS);
      };

      rec.onresult = (event) => {
        markStarted();
        const run = session.run;
        run.heard = true;
        // The list holds every result of this session. Results already used are
        // skipped by position: Android's `resultIndex` can't be trusted, and it
        // sends finished results again.
        let pending = '';
        for (let i = run.used; i < event.results.length; i++) {
          const result = event.results[i];
          const { transcript, confidence } = result[0];
          const final = result.isFinal && !(android && confidence === 0);
          if (final && !pending) {
            finish(transcript);
            run.used = i + 1;
          } else {
            pending += transcript;
          }
        }
        // The same words sent again (common in noise) don't count as a change,
        // so they don't hold back finishing the sentence.
        if (isCurrent() && pending !== interimRef.current) {
          setPending(pending);
          scheduleCommit(pending);
        }
      };

      rec.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        console.warn('Speech recognition error:', event.error, event.message);
        if (isCurrent()) clear();
        handlersRef.current.onError?.(errorMessage(event.error, lang));
      };

      rec.onend = () => {
        clearTimeout(session.commitTimer);
        if (!isCurrent()) {
          // Stopped by the user: keep the last words if no final result came for them.
          if (session.stoppedWith) finish(session.stoppedWith);
          return;
        }

        // Ended without ever starting and without an error: the browser refused
        // quietly (e.g. Safari with Dictation off). Restarting would only loop.
        if (!session.started) {
          clear();
          handlersRef.current.onError?.(noStartHint());
          return;
        }

        // Words that never became a final result would otherwise be lost.
        const leftover = interimRef.current;
        setPending('');
        finish(leftover);

        const run = session.run;
        const endedAtOnce = !session.committing && !run.heard && Date.now() - run.startedAt < QUICK_END_MS;
        // Ended by us to finish a sentence, or after hearing something: that's normal.
        session.committing = false;
        if (endedAtOnce) {
          const now = Date.now();
          session.restarts = session.restarts.filter((time) => now - time < RESTART_WINDOW_MS);
          session.restarts.push(now);
          if (session.restarts.length > MAX_RESTARTS) {
            clear();
            handlersRef.current.onError?.('Speech recognition keeps stopping. Press Start to try again.');
            return;
          }
        }
        // Chrome can start again straight away; Safari sometimes needs a moment.
        const restart = (canRetry) => {
          try {
            beginRun();
            rec.start();
          } catch {
            if (canRetry) setTimeout(() => isCurrent() && restart(false), 250);
            else if (isCurrent()) clear();
          }
        };
        restart(true);
      };

      sessionRef.current = session;
      beginRun();
      setActive({ lang, meta, ready: false });
      // If the microphone hasn't started after a while (no popup, no error), say what to check.
      session.startTimer = setTimeout(() => {
        if (isCurrent() && !session.started) handlersRef.current.onError?.(noStartHint());
      }, START_TIMEOUT_MS);
      try {
        rec.start();
      } catch (error) {
        clear();
        handlersRef.current.onError?.(`Could not start speech recognition: ${error.message}`);
      }
    },
    [clear, setPending],
  );

  useEffect(
    () => () => {
      clearTimeout(sessionRef.current?.commitTimer);
      clearTimeout(sessionRef.current?.startTimer);
      sessionRef.current?.rec.abort();
    },
    [],
  );

  return { supported: Boolean(getRecognition()), active, interim, start, stop };
}
