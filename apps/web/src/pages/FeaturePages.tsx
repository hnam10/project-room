import { useEffect } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { BrainstormPanel } from '../features/brainstorm/BrainstormPanel';
import { ChatPanel, type ChatTab } from '../features/chat/ChatPanel';
import { ChatWindowActions } from '../features/dock/ChatWindowActions';
import { useChatWindow } from '../state/chatWindow';

/** Full-page chat. If the chat is open in a separate window or floating, offer to bring it here instead. */
export function ChatPage({ tab = 'chat' }: { tab?: ChatTab }) {
  const { layout, dock } = useChatWindow();
  if (layout.mode !== 'docked') {
    return (
      <div className="placeholder">
        <div>
          <Icon name="window" />
          <h2>Chat is open in another window</h2>
          <p>It stays in sync with this page.</p>
          <button className="btn" onClick={dock}>
            Bring it back here
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <ChatPanel key={tab} initialTab={tab} headerActions={<ChatWindowActions placement="page" />} />
    </div>
  );
}

export function BrainstormPage() {
  return (
    <div className="page">
      <BrainstormPanel />
    </div>
  );
}

export function DecisionsPage() {
  return <ChatPage tab="decisions" />;
}

/** Clearly-labelled stand-in for areas that aren't built yet. */
export function PlaceholderPage({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  useEffect(() => {
    document.title = `${title} · Project Room`;
    return () => {
      document.title = 'Project Room';
    };
  }, [title]);
  return (
    <div className="placeholder">
      <div>
        <Icon name={icon} />
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}
