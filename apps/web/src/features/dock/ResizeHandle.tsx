/**
 * A draggable divider. Reports the pointer position while dragging; arrow keys nudge by
 * `step` (Shift for 4x); double-click resets.
 */
export function ResizeHandle(props: {
  orientation: 'horizontal' | 'vertical';
  label: string;
  onDrag: (clientX: number, clientY: number) => void;
  onNudge: (delta: number) => void;
  onReset: () => void;
}) {
  const horizontal = props.orientation === 'horizontal';
  return (
    <div
      className={horizontal ? 'resizer' : 'split-resizer'}
      role="separator"
      aria-orientation={props.orientation}
      aria-label={props.label}
      tabIndex={0}
      onPointerDown={(e) => {
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('dragging');
        document.body.classList.add(horizontal ? 'resizing' : 'col-resizing');
        const move = (ev: PointerEvent) => props.onDrag(ev.clientX, ev.clientY);
        const stop = () => {
          handle.classList.remove('dragging');
          document.body.classList.remove('resizing', 'col-resizing');
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', stop);
          handle.removeEventListener('pointercancel', stop);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 80 : 20;
        const keys: Record<string, number> = horizontal ? { ArrowUp: step, ArrowDown: -step } : { ArrowLeft: -step, ArrowRight: step };
        const delta = keys[e.key];
        if (delta === undefined) return;
        e.preventDefault();
        props.onNudge(delta);
      }}
      onDoubleClick={props.onReset}
    />
  );
}
