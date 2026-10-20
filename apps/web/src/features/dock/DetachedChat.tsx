import { createPortal } from 'react-dom';
import { clampFloat, useChatWindow } from '../../state/chatWindow';
import { ChatPanel } from '../chat/ChatPanel';
import { ChatWindowActions } from './ChatWindowActions';

/** Renders the chat when it isn't docked: as a floating window in the page, or inside a PiP window. */
export function DetachedChat() {
  const { layout, pipWindow } = useChatWindow();
  if (layout.mode === 'floating') return <FloatingChat />;
  if (layout.mode === 'pip' && pipWindow) {
    // Same React tree, different OS window: state is shared, so nothing needs syncing.
    return createPortal(<ChatPanel className="window" headerActions={<ChatWindowActions placement="pip" />} />, pipWindow.document.body);
  }
  return null;
}

function FloatingChat() {
  const { layout, update, beginHeaderDrag } = useChatWindow();
  const f = clampFloat(layout.float);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, w: f.w, h: f.h };
    document.body.classList.add('moving-panel');
    const move = (ev: PointerEvent) =>
      update({
        float: {
          ...f,
          w: Math.min(start.w + ev.clientX - start.x, innerWidth - f.x - 8),
          h: Math.min(start.h + ev.clientY - start.y, innerHeight - f.y - 8),
        },
      });
    const stop = () => {
      document.body.classList.remove('moving-panel');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  return (
    <ChatPanel
      className="floating"
      style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
      headerActions={<ChatWindowActions placement="floating" />}
      onHeaderPointerDown={beginHeaderDrag}
    >
      <span className="float-resize" aria-hidden="true" onPointerDown={startResize} />
    </ChatPanel>
  );
}
