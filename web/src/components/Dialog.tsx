/**
 * The only dialog in the product.
 *
 * `alert`, `confirm` and `prompt` are banned. They cannot be styled, cannot be
 * made accessible properly, and cannot restate an amount or a recipient count,
 * which is the entire job of the confirmation before an irreversible payout.
 * That confirmation is a control, not a formality.
 *
 * Built on the native `<dialog>` element for correct semantics and a real focus
 * trap, then styled completely.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './dialog.css';

export interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Label for the confirming action. Names the action and its object. */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Requires typing this word before the action enables. For destructive things. */
  requireTyped?: string;
  destructive?: boolean;
  /** Shown under the buttons. Explains the keyboard behaviour. */
  footnote?: string;
}

export function Dialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  requireTyped,
  destructive = false,
  footnote,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (open && !el.open) {
      setTyped('');
      el.showModal();
      // Focus lands on cancel, never on a destructive confirm.
      cancelRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const confirmEnabled = requireTyped === undefined || typed === requireTyped;

  // Portalled to body: as a child of a flex column, an open dialog becomes a
  // flex item and distorts the page behind it.
  return createPortal(
    <dialog
      ref={ref}
      className="dc-dialog"
      aria-labelledby="dc-dialog-title"
      onCancel={(event) => {
        // Escape cancels. Handled here so React state stays in step.
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onCancel();
      }}
    >
      <h2 id="dc-dialog-title">{title}</h2>
      <div className="dc-dialog-body pretty">{children}</div>

      {requireTyped !== undefined && (
        <>
          <label className="label dc-dialog-label" htmlFor="dc-dialog-confirm">
            Type <span className="mono">{requireTyped}</span> to continue
          </label>
          <input
            id="dc-dialog-confirm"
            className="field mono"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
        </>
      )}

      <div className="dc-dialog-actions">
        <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`}
          disabled={!confirmEnabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>

      {footnote !== undefined && <p className="hint dc-dialog-footnote">{footnote}</p>}
    </dialog>,
    document.body,
  );
}
