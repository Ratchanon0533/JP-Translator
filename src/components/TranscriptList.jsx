import { useLayoutEffect, useRef, useState } from 'react';
import { getLanguage } from '../config/languages.js';
import { formatTime } from '../utils/format.js';
import { Icon } from './Icon.jsx';
import styles from './TranscriptList.module.css';

export function TranscriptList({ entries, display, talk, emptyText, onRetranslate }) {
  const scrollerRef = useRef(null);
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);

  // Keep the newest sentence in view, unless the user scrolled up to read.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && followRef.current) scroller.scrollTop = scroller.scrollHeight;
  }, [entries]);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
    followRef.current = atBottom;
    setFollowing(atBottom);
  };

  const jumpToLatest = () => {
    const scroller = scrollerRef.current;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  };

  return (
    <main className={styles.wrap}>
      <div ref={scrollerRef} className={styles.scroller} onScroll={handleScroll}>
        {entries.length === 0 ? (
          <p className={styles.empty}>{emptyText}</p>
        ) : (
          <ol className={`${styles.list} ${talk ? styles.talk : ''}`} aria-label="Transcript">
            {entries.map((entry) => (
              <Row key={entry.id} entry={entry} display={display} onRetranslate={onRetranslate} />
            ))}
          </ol>
        )}
      </div>

      {/* Mirai's "最新へ" (jump to latest) button */}
      {!following && entries.length > 0 && (
        <button type="button" className={styles.latest} onClick={jumpToLatest} aria-label="Jump to latest">
          <Icon name="arrowDown" size={18} />
        </button>
      )}
    </main>
  );
}

function Row({ entry, display, onRetranslate }) {
  const from = getLanguage(entry.from);
  const to = getLanguage(entry.to);
  const showOriginal = display !== 'translation';
  const showTranslation = display !== 'original';
  const busy = entry.state === 'translating' || entry.state === 'retrying';
  const failed = entry.state === 'error' || (entry.state === 'done' && !entry.translation?.trim());

  return (
    <li className={`${styles.row} ${entry.side === 'b' ? styles.sideB : ''}`} title={formatTime(entry.createdAt)}>
      {showOriginal && (
        <p className={showTranslation ? styles.original : styles.main} lang={from.speech}>
          {entry.source}
        </p>
      )}

      {/* While the engine is still writing, show the words it has so far. */}
      {showTranslation && busy && entry.translation && (
        <p className={styles.main} lang={to.speech}>
          {entry.translation}
        </p>
      )}
      {showTranslation && busy && !entry.translation && (
        <p className={styles.pending}>{entry.state === 'retrying' ? 'Retrying…' : 'Translating…'}</p>
      )}
      {showTranslation && failed && (
        <p className={styles.error}>
          {entry.error ?? 'No translation came back.'}{' '}
          <button type="button" className={styles.link} onClick={() => onRetranslate(entry.id)}>
            Try again
          </button>
        </p>
      )}
      {showTranslation && !busy && !failed && (
        <p className={styles.main} lang={to.speech}>
          {entry.translation}
        </p>
      )}

      {!busy && !failed && (
        <button
          type="button"
          className={styles.again}
          onClick={() => onRetranslate(entry.id)}
          aria-label="Translate again"
          title="Translate again"
        >
          <Icon name="retry" size={14} />
        </button>
      )}
    </li>
  );
}
