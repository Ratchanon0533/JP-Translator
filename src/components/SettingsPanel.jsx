import { useEffect, useId, useRef } from 'react';
import { ENGINE_CHOICES } from '../services/translators/index.js';
import { Icon } from './Icon.jsx';
import { Segmented } from './Segmented.jsx';
import styles from './SettingsPanel.module.css';

const MODE_OPTIONS = [
  { value: 'listening', label: 'Listening' },
  { value: 'talk', label: 'Talk' },
];

const DISPLAY_OPTIONS = [
  { value: 'both', label: 'Both' },
  { value: 'translation', label: 'Translation' },
  { value: 'original', label: 'Original' },
];

const SIZE_OPTIONS = [
  { value: 's', label: 'S' },
  { value: 'm', label: 'M' },
  { value: 'l', label: 'L' },
  { value: 'xl', label: 'XL' },
];

const THEME_OPTIONS = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Changes apply immediately and are saved in localStorage.
export function SettingsPanel({ open, settings, onChange, onClose, locked, hasHistory, onExport, onClear }) {
  const dialogRef = useRef(null);
  const id = useId();
  const engine = ENGINE_CHOICES.find((choice) => choice.id === settings.translator);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.drawer}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      // A click on the dimmed backdrop lands on the <dialog> itself.
      onClick={(event) => event.target === dialogRef.current && onClose()}
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          <h2 id={`${id}-title`} className={styles.title}>
            Settings
          </h2>
          <button type="button" className="iconButton iconButtonPlain" onClick={onClose} aria-label="Close settings">
            <Icon name="close" />
          </button>
        </div>

        <section className={styles.section}>
          <Segmented
            label="Mode"
            options={MODE_OPTIONS}
            value={settings.mode}
            onChange={(mode) => onChange({ mode })}
            disabled={locked}
          />
          <p className={styles.note}>
            {locked
              ? 'Stop listening to change the mode.'
              : settings.mode === 'talk'
                ? 'Two people take turns, each with their own mic button.'
                : 'One-way: speech in the first language is translated into the second.'}
          </p>
        </section>

        <section className={styles.section}>
          {/* A dropdown keeps the full engine names readable. */}
          <div className={styles.field}>
            <label htmlFor={`${id}-engine`}>Translation engine</label>
            <select
              id={`${id}-engine`}
              className="select dropdown"
              value={settings.translator}
              onChange={(event) => onChange({ translator: event.target.value })}
            >
              {ENGINE_CHOICES.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          <p className={styles.note}>{engine?.description}</p>
        </section>

        <section className={styles.section}>
          <Segmented label="Show" options={DISPLAY_OPTIONS} value={settings.display} onChange={(display) => onChange({ display })} />
          <Segmented label="Text size" options={SIZE_OPTIONS} value={settings.textSize} onChange={(textSize) => onChange({ textSize })} />
          <Segmented label="Theme" options={THEME_OPTIONS} value={settings.theme} onChange={(theme) => onChange({ theme })} />
        </section>

        <section className={styles.section}>
          <span className={styles.label}>History</span>
          <p className={styles.note}>Cleared every time the page loads. Download the CSV to keep it.</p>
          <div className={styles.actions}>
            <button type="button" className="button" onClick={onExport} disabled={!hasHistory}>
              <Icon name="download" size={16} />
              Download CSV
            </button>
            <button type="button" className="button buttonDanger" onClick={onClear} disabled={!hasHistory}>
              <Icon name="trash" size={16} />
              Clear
            </button>
          </div>
        </section>
      </div>
    </dialog>
  );
}
