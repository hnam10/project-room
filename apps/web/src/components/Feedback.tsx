import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

// App-wide toasts and confirmation dialogs.

interface Toast {
  id: number;
  text: string;
}

interface ConfirmRequest {
  title: string;
  text: string;
  okLabel?: string;
}

interface FeedbackApi {
  toast: (text: string) => void;
  /** Toasts an error's message. Handy as a `.catch` target for API calls. */
  toastError: (error: unknown) => void;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<(ok: boolean) => void>(() => {});
  const nextId = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++nextId.current;
    setToasts((list) => [...list, { id, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  const toastError = useCallback((error: unknown) => toast(error instanceof Error ? error.message : 'Something went wrong'), [toast]);

  const confirm = useCallback((request: ConfirmRequest) => {
    setPending(request);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current(ok);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, toastError, confirm }}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
      <Modal
        open={!!pending}
        title={pending?.title ?? ''}
        onClose={() => settle(false)}
        onSubmit={() => settle(true)}
        footer={
          <>
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => settle(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              {pending?.okLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        <p className="modal-note">{pending?.text}</p>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}
