import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Native <dialog> modal. Rendered in place (no portal), so a modal opened from the chat
 * in a Picture-in-Picture window shows up in that window.
 */
export function Modal(props: {
  open: boolean;
  title: string;
  eyebrow?: string;
  wide?: boolean;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  return (
    <dialog ref={ref} className={`modal${props.wide ? ' wide' : ''}`} onClose={props.onClose} onCancel={props.onClose}>
      {props.open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit?.(e);
          }}
        >
          <div className="modal-head">
            <div>
              {props.eyebrow && <span className="eyebrow">{props.eyebrow}</span>}
              <h2>{props.title}</h2>
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>
              <Icon name="x" />
            </button>
          </div>
          {props.children}
          <div className="modal-actions">{props.footer}</div>
        </form>
      )}
    </dialog>
  );
}
