import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ChatPanel } from '../features/chat/ChatPanel';
import { POPUP_CHANNEL } from '../state/chatWindow';
import { WorkspaceProvider, useWorkspace } from '../state/workspace';

/**
 * The chat in its own browser window (fallback for browsers without Document Picture-in-Picture).
 * It's a separate page with its own connection; realtime events keep it in sync with the main window.
 */
export function ChatPopoutPage() {
  const { projectId = '' } = useParams();
  useEffect(() => {
    document.documentElement.classList.add('chat-window');
    document.title = 'Project Room chat';
  }, []);
  return (
    <WorkspaceProvider projectId={projectId}>
      <PopoutChat />
    </WorkspaceProvider>
  );
}

function PopoutChat() {
  const { snapshot, error } = useWorkspace();
  if (error) return <div className="boot">{error}</div>;
  if (!snapshot) return <div className="boot">Loading chat…</div>;

  const dockBack = () => {
    const channel = new BroadcastChannel(POPUP_CHANNEL);
    channel.postMessage('dock');
    channel.close();
    window.close();
  };

  return (
    <ChatPanel
      className="window"
      headerActions={
        <button className="icon-btn" title="Dock chat" aria-label="Dock chat back into the main window" onClick={dockBack}>
          <Icon name="dockIn" />
        </button>
      }
    />
  );
}
