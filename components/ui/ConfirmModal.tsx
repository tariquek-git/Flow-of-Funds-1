import React, { useEffect } from 'react';

type ConfirmModalProps = {
  isOpen: boolean;
  isDarkMode?: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  isDarkMode = false,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="confirm-modal"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-md rounded-xl border p-5 shadow-xl ${
          isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 data-testid="confirm-modal-title" className="text-base font-semibold">{title}</h2>
        <p
          data-testid="confirm-modal-message"
          className={`mt-2 text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}
        >
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            data-testid="confirm-modal-cancel"
            type="button"
            onClick={onCancel}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              isDarkMode
                ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            Cancel
          </button>
          <button
            data-testid="confirm-modal-confirm"
            type="button"
            onClick={onConfirm}
            className="rounded-md border border-red-700 bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
