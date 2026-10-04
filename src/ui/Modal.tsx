/**
 * Native <dialog> as a bottom sheet or a centred dialog. showModal() gives focus
 * trapping, Escape to close and inert background for free (iOS 15.4+).
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { CloseIcon } from './icons.tsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  variant?: 'sheet' | 'dialog';
  /** Hide the visible title (still used as the accessible name). */
  hideTitle?: boolean;
  children: ComponentChildren;
}

export function Modal({
  open,
  onClose,
  title,
  variant = 'sheet',
  hideTitle,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      class={variant}
      aria-labelledby={titleId}
      // Only user actions close it (Escape, backdrop, X). Programmatic close() must not
      // call onClose, or swapping one modal for another would close both.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A tap on the backdrop lands on the <dialog> itself.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div class={variant === 'sheet' ? 'sheet__panel' : 'dialog__panel'}>
          {variant === 'sheet' && <div class="sheet__grabber" aria-hidden="true" />}
          <div class={variant === 'sheet' ? 'sheet__header' : 'dialog__header'}>
            <h2 id={titleId} class={hideTitle ? 'visually-hidden' : 'display'}>
              {title}
            </h2>
            <button class="icon-button" onClick={onClose} aria-label="Zamknij">
              <CloseIcon />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
