import { useState } from 'react';
import { Icon } from './Icon.jsx';
import styles from './ControlDock.module.css';

export function ControlDock({
  mode,
  lang1,
  lang2,
  supported,
  activeSide,
  interim,
  micReady,
  liveTranslation,
  liveLang,
  notice,
  onDismissNotice,
  onStart,
  onStop,
  onSubmitText,
}) {
  const [text, setText] = useState('');
  const listening = activeSide !== null;
  const talk = mode === 'talk';
  const hasText = text.trim() !== '';

  const submit = (event) => {
    event.preventDefault();
    if (!hasText) return;
    onSubmitText(text.trim());
    setText('');
  };

  const toggle = (side) => (activeSide === side ? onStop() : onStart(side));

  return (
    <footer className={styles.dock}>
      {notice && (
        <p className={styles.notice} role="alert">
          <span>{notice}</span>
          <button type="button" className="iconButton iconButtonPlain" onClick={onDismissNotice} aria-label="Dismiss message">
            <Icon name="close" size={16} />
          </button>
        </p>
      )}

      {/* Words still being recognized (Mirai: `voice_recognizing`), with a live translation under them. */}
      {listening && (
        <div className={styles.live}>
          <p className={styles.caption} aria-live="polite">
            {interim || (micReady ? 'Listening…' : 'Waiting for the microphone…')}
          </p>
          {interim && liveTranslation && (
            <p className={styles.liveTranslation} lang={liveLang}>
              {liveTranslation}
            </p>
          )}
        </div>
      )}

      {talk && supported && (
        <div className={styles.talk}>
          {[
            ['a', lang1],
            ['b', lang2],
          ].map(([side, language]) => (
            <button
              key={side}
              type="button"
              className={`${styles.pill} ${activeSide === side ? styles.recording : ''}`}
              onClick={() => toggle(side)}
              aria-pressed={activeSide === side}
            >
              <Icon name={activeSide === side ? 'stop' : 'mic'} size={18} />
              {language.label}
            </button>
          ))}
        </div>
      )}

      <form className={styles.bar} onSubmit={submit}>
        <input
          className={styles.input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={supported && !talk ? 'Speak or type…' : 'Type to translate…'}
          lang={lang1.speech}
          aria-label={`Text to translate from ${lang1.english} into ${lang2.english}`}
        />
        {hasText ? (
          <button type="submit" className={styles.round} aria-label="Translate">
            <Icon name="send" />
          </button>
        ) : (
          supported &&
          !talk && (
            <button
              type="button"
              className={`${styles.round} ${listening ? styles.recording : ''}`}
              onClick={() => (listening ? onStop() : onStart('a'))}
              aria-pressed={listening}
              aria-label={listening ? 'Stop listening' : `Start listening in ${lang1.english}`}
            >
              <Icon name={listening ? 'stop' : 'mic'} />
            </button>
          )
        )}
      </form>

      {!supported && <p className={styles.hint}>Voice input needs Chrome, Edge or Safari.</p>}
    </footer>
  );
}
