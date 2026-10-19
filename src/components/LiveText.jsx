import { useState } from 'react';
import styles from './LiveText.module.css';

// Where two versions of a sentence start to differ, moved back so a Thai vowel
// or tone mark (or half of an emoji) is never split from its letter.
function sharedStart(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  while (i > 0 && /[\p{M}\uDC00-\uDFFF]/u.test(b[i] ?? '')) i--;
  return i;
}

// Text that changes while someone is talking (Mirai: `voice_recognizing`). The
// part that stayed the same is left alone; new or corrected words fade in.
export function GrowingText({ text }) {
  const [shown, setShown] = useState({ text, kept: 0, version: 0 });
  if (shown.text !== text) {
    setShown({ text, kept: sharedStart(shown.text, text), version: shown.version + 1 });
  }
  const kept = Math.min(shown.kept, text.length);

  return (
    <>
      {text.slice(0, kept)}
      <span key={shown.version} className={styles.fresh}>
        {text.slice(kept)}
      </span>
    </>
  );
}

// Three bouncing dots: work in progress.
export function Dots({ label }) {
  return (
    <span className={styles.dots} role="img" aria-label={label}>
      <span />
      <span />
      <span />
    </span>
  );
}

// Small bars that move while someone is speaking, and rest while it is quiet.
export function VoiceBars({ speaking }) {
  return (
    <span className={`${styles.bars} ${speaking ? styles.speaking : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
