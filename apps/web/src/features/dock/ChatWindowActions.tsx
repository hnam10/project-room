import { Icon } from '../../components/Icon';
import { useChatWindow } from '../../state/chatWindow';

/** Window controls in the chat header: float in page, open in a separate window, dock back. */
export function ChatWindowActions({ placement }: { placement: 'dock' | 'floating' | 'pip' | 'page' }) {
  const { layout, update, floatInPage, openSeparateWindow, dock } = useChatWindow();
  return (
    <>
      {placement === 'dock' && layout.brainstormClosed && (
        <button className="panel-tab reopen" onClick={() => update({ brainstormClosed: false })}>
          <Icon name="bulb" />
          Show brainstorm
        </button>
      )}
      {placement !== 'dock' && placement !== 'page' && (
        <button className="icon-btn" title="Dock chat" aria-label="Dock chat" onClick={dock}>
          <Icon name="dockIn" />
        </button>
      )}
      {placement === 'dock' && (
        <button className="icon-btn" title="Float in page" aria-label="Float chat in page" onClick={floatInPage}>
          <Icon name="float" />
        </button>
      )}
      {placement !== 'pip' && (
        <button className="icon-btn" title="Open in separate window" aria-label="Open chat in a separate window" onClick={() => void openSeparateWindow()}>
          <Icon name="window" />
        </button>
      )}
    </>
  );
}
