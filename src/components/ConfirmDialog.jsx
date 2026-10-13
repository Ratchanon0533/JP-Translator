import { useEffect, useId, useRef } from 'react';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} onClose={onCancel}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button type="button" className="button" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className="button buttonDanger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
