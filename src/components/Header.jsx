import { LANGUAGES } from '../config/languages.js';
import { Icon } from './Icon.jsx';
import styles from './Header.module.css';

// One quiet row: mark · language switch · theme switch + settings.
// Like Mirai, languages are locked while listening: changing them
// mid-session would mix two directions in one recognizer.
export function Header({ settings, onChange, locked, isDark, onToggleTheme, onOpenSettings }) {
  const { mode, lang1, lang2 } = settings;
  const talk = mode === 'talk';
  const lockedTitle = locked ? 'Stop listening to change languages' : undefined;

  // Picking the language that is already on the other side swaps the two.
  const pick = (side, value) => {
    if (side === 1) onChange(value === lang2 ? { lang1: value, lang2: lang1 } : { lang1: value });
    else onChange(value === lang1 ? { lang1: lang2, lang2: value } : { lang2: value });
  };

  return (
    <header className={styles.header}>
      <h1 className="visually-hidden">JP Translator</h1>
      <span className={styles.mark} lang="ja" aria-hidden="true">
        訳
      </span>

      <div className={styles.langs} title={lockedTitle}>
        <LanguageSelect
          label={talk ? 'Person A speaks' : 'Spoken language'}
          value={lang1}
          onChange={(value) => pick(1, value)}
          disabled={locked}
        />
        <button
          type="button"
          className="iconButton iconButtonPlain"
          onClick={() => onChange({ lang1: lang2, lang2: lang1 })}
          disabled={locked}
          aria-label="Swap languages"
          title={lockedTitle ?? 'Swap languages'}
        >
          <Icon name="swap" size={18} />
        </button>
        <LanguageSelect
          label={talk ? 'Person B speaks' : 'Translate into'}
          value={lang2}
          onChange={(value) => pick(2, value)}
          disabled={locked}
        />
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`iconButton ${styles.themeToggle}`}
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>
        <button type="button" className="iconButton" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <Icon name="settings" size={18} />
        </button>
      </div>
    </header>
  );
}

function LanguageSelect({ label, value, onChange, disabled }) {
  return (
    <select
      className={styles.select}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={label}
    >
      {LANGUAGES.map((language) => (
        <option key={language.id} value={language.id}>
          {language.label}
        </option>
      ))}
    </select>
  );
}
