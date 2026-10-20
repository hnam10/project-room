import { useRef } from 'react';
import { Icon } from '../../components/Icon';
import { useChatWindow } from '../../state/chatWindow';
import { BrainstormPanel } from '../brainstorm/BrainstormPanel';
import { ChatPanel } from '../chat/ChatPanel';
import { ChatWindowActions } from './ChatWindowActions';
import { ResizeHandle } from './ResizeHandle';

const DOCK_MIN = 180;
const BOARD_MIN = 230; // matches .board min-height
const PANEL_MIN_W = 300;

/**
 * The area under the board: chat (unless it's floating or in its own window) beside the
 * brainstorm board, with a draggable divider above (height) and between them (width).
 */
export function Dock({ boardRef }: { boardRef: React.RefObject<HTMLElement | null> }) {
  const { layout, update, dockRef, dropTarget, beginHeaderDrag } = useChatWindow();
  const self = useRef<HTMLElement | null>(null);
  const chatDocked = layout.mode === 'docked';
  const empty = !chatDocked && layout.brainstormClosed;

  const setHeight = (px: number) => {
    const container = self.current?.parentElement;
    const board = boardRef.current;
    if (!container || !board) return;
    const max = container.getBoundingClientRect().bottom - board.getBoundingClientRect().top - BOARD_MIN;
    update({ dockHeight: Math.round(Math.max(DOCK_MIN, Math.min(px, max))) });
  };

  const setChatWidth = (px: number) => {
    const width = self.current?.getBoundingClientRect().width ?? 0;
    if (!width) return;
    const clamped = Math.max(PANEL_MIN_W, Math.min(px, width - PANEL_MIN_W));
    update({ chatWidth: Math.round((clamped / width) * 1000) / 10 });
  };

  if (empty) return null;

  return (
    <>
      <ResizeHandle
        orientation="horizontal"
        label="Resize panels"
        onDrag={(_x, y) => setHeight((self.current?.parentElement?.getBoundingClientRect().bottom ?? 0) - y)}
        onNudge={(d) => setHeight((self.current?.offsetHeight ?? 0) + d)}
        onReset={() => update({ dockHeight: null })}
      />
      <section
        ref={(el) => {
          self.current = el;
          dockRef.current = el;
        }}
        className={`dock${layout.brainstormClosed ? ' brainstorm-closed' : ''}${chatDocked ? '' : ' chat-detached'}${dropTarget ? ' drop-target' : ''}`}
        style={
          {
            ...(layout.dockHeight ? { '--dock-h': `${layout.dockHeight}px` } : {}),
            ...(layout.chatWidth ? { '--chat-w': `${layout.chatWidth}%` } : {}),
          } as React.CSSProperties
        }
      >
        {chatDocked && <ChatPanel headerActions={<ChatWindowActions placement="dock" />} onHeaderPointerDown={beginHeaderDrag} />}
        {chatDocked && !layout.brainstormClosed && (
          <ResizeHandle
            orientation="vertical"
            label="Resize chat and brainstorm"
            onDrag={(x) => setChatWidth(x - (self.current?.getBoundingClientRect().left ?? 0))}
            onNudge={(d) => setChatWidth((self.current?.querySelector('.chat-panel')?.getBoundingClientRect().width ?? 0) + d)}
            onReset={() => update({ chatWidth: null })}
          />
        )}
        {!layout.brainstormClosed && (
          <BrainstormPanel
            headerActions={
              <button className="icon-btn close-panel" aria-label="Close brainstorm panel" onClick={() => update({ brainstormClosed: true })}>
                <Icon name="x" />
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
