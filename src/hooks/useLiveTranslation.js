import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Wait at least this long between two live translations, to leave the GPU some room.
const MIN_GAP_MS = 250;

const normalize = (text) => text.trim().replace(/\s+/g, ' ');

export const sameText = (a, b) => normalize(a) === normalize(b);

// Translates the words while they are still being spoken, so a translation
// appears before the sentence is finished. Only one request runs at a time:
// while it runs, newer words wait, and in-between versions are skipped.
//
// `lastRef` always holds the most recent { text, translation }. When the
// sentence is finished with exactly that text, the caller can reuse the
// translation instead of waiting for a new one.
export function useLiveTranslation({ enabled, text, translate, lastRef }) {
  const [result, setResult] = useState(null);
  const wantedRef = useRef('');
  const busyRef = useRef(false);
  // Bumped whenever the current sentence ends, so late answers for it are ignored.
  const sentenceRef = useRef(0);
  const translateRef = useRef(translate);

  useLayoutEffect(() => {
    translateRef.current = translate;
  });

  const pump = useCallback(
    async function run() {
      const wanted = wantedRef.current;
      if (busyRef.current || !wanted) return;
      busyRef.current = true;
      const sentence = sentenceRef.current;
      try {
        const translation = await translateRef.current(wanted);
        if (sentence === sentenceRef.current) {
          const latest = { text: wanted, translation };
          lastRef.current = latest;
          setResult(latest);
        }
      } catch {
        // Not shown: the finished sentence is still translated the normal way.
      } finally {
        busyRef.current = false;
      }
      if (wantedRef.current && wantedRef.current !== wanted) setTimeout(run, MIN_GAP_MS);
    },
    [lastRef],
  );

  useEffect(() => {
    const wanted = enabled ? normalize(text) : '';
    if (!wanted) {
      if (wantedRef.current) sentenceRef.current += 1;
      wantedRef.current = '';
      setResult(null);
      return;
    }
    wantedRef.current = wanted;
    pump();
  }, [enabled, text, pump]);

  return result;
}
