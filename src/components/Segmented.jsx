import { useId } from 'react';
import styles from './Segmented.module.css';

// A row of mutually exclusive choices built from real radio buttons, so
// keyboard arrows and screen readers work without extra code.
export function Segmented({ label, hideLabel = false, options, value, onChange, disabled = false }) {
  const name = useId();
  const labelId = `${name}-label`;

  return (
    <div className={styles.group}>
      <span id={labelId} className={hideLabel ? 'visually-hidden' : styles.label}>
        {label}
      </span>
      <div className={styles.options} role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
