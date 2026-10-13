import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const normalize = (text) => text.trim().replace(/\s+/g, ' ');

export const sameText = (a, b) => normalize(a) === normalize(b);

// Translates the words while they are still being spoken, so a translation
// appears before the sentence is finished. Only one request runs at a time:
// while it runs, newer words wait, and in-between versions are skipped.
//
// `translate(text)` resolves to an object with at least { translation }.
// `lastRef` always holds the most recent { text, translation, … }. When the
// sentence is finished with exactly that text, the caller can reuse the
// translation instead of waiting for a new one.
// `minGapMs` is the pause between two requests (short for a local GPU,
// longer for an online engine with a daily allowance).
export function useLiveTranslation({ enabled, text, translate, lastRef, minGapMs = 250 }) {
  const [result, setResult] = useState(null);
  const wantedRef = useRef('');
  const busyRef = useRef(false);
  // Bumped whenever the current sentence ends, so late answers for it are ignored.
  const sentenceRef = useRef(0);
  const translateRef = useRef(translate);
  const gapRef = useRef(minGapMs);

  useLayoutEffect(() => {
    translateRef.current = translate;
    gapRef.current = minGapMs;
  });

  const pump = useCallback(
    async function run() {
      const wanted = wantedRef.current;
      if (busyRef.current || !wanted) return;
      busyRef.current = true;
      const sentence = sentenceRef.current;
      try {
        const answer = await translateRef.current(wanted);
        if (sentence === sentenceRef.current) {
          const latest = { text: wanted, ...answer };
          lastRef.current = latest;
          setResult(latest);
        }
      } catch {
        // Not shown: the finished sentence is still translated the normal way.
      } finally {
        busyRef.current = false;
      }
      if (wantedRef.current && wantedRef.current !== wanted) setTimeout(run, gapRef.current);
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
