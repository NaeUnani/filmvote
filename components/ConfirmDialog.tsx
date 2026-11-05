import { useEffect, useId, useRef } from "react";

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  busy = false,
  error,
  onConfirm,
  onDismiss,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dismissButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dismissButton.current?.focus();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="playlist-sheet confirm-sheet"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" disabled={busy} onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button
        ref={dismissButton}
        className="logout-button"
        disabled={busy}
        onClick={onDismiss}
      >
        {cancelLabel}
      </button>
    </dialog>
  );
}
