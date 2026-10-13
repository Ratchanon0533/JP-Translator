import { useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_OLLAMA_MODEL,
  isLocalPage,
  listOllamaModels,
  ollamaOriginsCommand,
  TRANSLATORS,
} from '../services/translators/index.js';
import { Icon } from './Icon.jsx';
import { Segmented } from './Segmented.jsx';
import styles from './SettingsPanel.module.css';

const MODE_OPTIONS = [
  { value: 'listening', label: 'Listening' },
  { value: 'talk', label: 'Talk' },
];

const ENGINE_OPTIONS = Object.values(TRANSLATORS).map((t) => ({ value: t.id, label: t.label }));

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
  const engine = TRANSLATORS[settings.translator];

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
          <Segmented
            label="Translation engine"
            options={ENGINE_OPTIONS}
            value={settings.translator}
            onChange={(translator) => onChange({ translator })}
          />
          <p className={styles.note}>{engine?.description}</p>

          {settings.translator === 'ollama' && (
            <OllamaModelPicker
              id={`${id}-ollama`}
              open={open}
              value={settings.ollamaModel}
              onChange={(ollamaModel) => onChange({ ollamaModel })}
            />
          )}

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

// Lists the models installed in Ollama each time Settings opens.
function OllamaModelPicker({ id, open, value, onChange }) {
  const [models, setModels] = useState(null); // null = checking, 'offline', or a list of names

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setModels(null);
    listOllamaModels()
      .then((names) => !cancelled && setModels(names))
      .catch(() => !cancelled && setModels('offline'));
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (models === null) return <p className={styles.note}>Looking for Ollama…</p>;
  if (models === 'offline') {
    if (isLocalPage()) {
      return (
        <p className={styles.warning}>
          Ollama isn&apos;t running on this computer. Start the Ollama app, then reopen Settings. Until then,
          MyMemory translates instead.
        </p>
      );
    }
    // A deployed copy (e.g. on Cloudflare Pages): Ollama refuses pages it doesn't trust.
    return (
      <div className={styles.warning}>
        <p>
          This page can&apos;t reach Ollama, so MyMemory translates instead. Ollama only works on the PC it&apos;s
          installed on, and only for sites it trusts. To use it here, on that PC:
        </p>
        <ol className={styles.steps}>
          <li>
            Run <code className={styles.command}>{ollamaOriginsCommand()}</code>
          </li>
          <li>Quit Ollama from the taskbar tray and start it again.</li>
          <li>Reload this page, and choose Allow if the browser asks about apps on this device.</li>
        </ol>
      </div>
    );
  }
  if (models.length === 0) {
    return (
      <p className={styles.warning}>
        No models installed yet. Run <code>ollama pull {DEFAULT_OLLAMA_MODEL}</code>, then reopen Settings.
      </p>
    );
  }

  const options = models.includes(value) ? models : [value, ...models];
  return (
    <div className={styles.field}>
      <label htmlFor={id}>Model</label>
      <select id={id} className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((name) => (
          <option key={name} value={name}>
            {models.includes(name) ? name : `${name} (not installed)`}
          </option>
        ))}
      </select>
    </div>
  );
}
