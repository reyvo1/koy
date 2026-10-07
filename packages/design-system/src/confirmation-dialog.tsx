'use client';

import { useEffect, useId, useRef } from 'react';

/** Native modal focus containment, Escape handling and focus restoration. */
export function ConfirmationDialog({
  open,
  title,
  description,
  busy = false,
  confirmLabel = 'Konfirmasi',
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  busy?: boolean;
  confirmLabel?: string;
  error?: string | null;
  onCancel(): void;
  onConfirm(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="w-[min(92vw,460px)] rounded-2xl border border-slate-700 bg-[#131722] p-6 text-slate-100 backdrop:bg-black/70"
    >
      <h2 id={id} className="m-0 text-lg font-bold">
        {title}
      </h2>
      <p
        id={`${id}-description`}
        className="my-4 text-sm leading-relaxed text-slate-400"
      >
        {description}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3">
        <button
          autoFocus
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Memproses…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
