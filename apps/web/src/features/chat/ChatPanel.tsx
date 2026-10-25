import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { AssistantTab } from './AssistantTab';
import { pendingAssistantSuggestions } from './assistantSuggestions';
import { Composer } from './Composer';
import { PollsTab } from './PollsTab';
import { MessageList } from './MessageList';
import { useAttachFiles, useFileDrop } from './useAttachFiles';

export type ChatTab = 'chat' | 'assistant' | 'polls';

/**
 * Chat, AI Assistant and Polls in one panel. The same component renders in the dock,
 * as a floating window, in a separate OS window, and as a full page; the container decides
 * which window controls to show (headerActions) and whether the header can be dragged.
 */
export function ChatPanel(props: {
  className?: string;
  style?: CSSProperties;
  headerActions?: ReactNode;
  onHeaderPointerDown?: (event: React.PointerEvent, panel: HTMLElement) => void;
  children?: ReactNode;
  initialTab?: ChatTab;
}) {
  const { projectId, activeChannelId, setActiveChannelId, applyRecord } = useWorkspace();
  const { channels, suggestions, ideas } = useSnapshot();
  const [tab, setTab] = useState<ChatTab>(props.initialTab ?? 'chat');
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const files = useAttachFiles(async (file) =>
    applyRecord('message', await api.sendMessage(projectId, activeChannelId!, file.name, file.id)),
  );
  // Dropping files anywhere on the chat shares them in the open channel, like the composer's + button.
  const { fileOver, dropProps } = useFileDrop(tab === 'chat' && !!activeChannelId, (dropped) => void files.attach(dropped));
  const pendingInsights = pendingAssistantSuggestions(suggestions, ideas).length;

  const tabButton = (id: ChatTab, label: ReactNode) => (
    <button role="tab" aria-selected={tab === id} className={`panel-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <div
      ref={panel}
      className={`panel chat-panel ${props.className ?? ''}${fileOver ? ' file-over' : ''}`}
      style={props.style}
      data-drop-label="Drop files to share them in this channel"
      {...dropProps}
    >
      <div
        className="panel-tabs chat-tabs"
        role="tablist"
        title={props.onHeaderPointerDown ? 'Drag to move' : undefined}
        style={props.onHeaderPointerDown ? undefined : { cursor: 'default' }}
        onPointerDown={(e) => panel.current && props.onHeaderPointerDown?.(e, panel.current)}
      >
        {props.onHeaderPointerDown && (
          <span className="grip" aria-hidden="true">
            <Icon name="grip" />
          </span>
        )}
        {tabButton('chat', 'Chat')}
        {tabButton(
          'assistant',
          <>
            AI Assistant <span className="tab-count">{pendingInsights || ''}</span>
          </>,
        )}
        {tabButton('polls', 'Polls')}
        <div className="panel-actions window-actions">{props.headerActions}</div>
      </div>

      <div className="panel-body" ref={body}>
        {tab === 'chat' && activeChannelId && (
          <>
            <div className="channel-title">
              <Icon name="hash" />
              <select
                className="channel-select"
                value={activeChannelId}
                onChange={(e) => setActiveChannelId(e.target.value)}
                aria-label="Channel"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <MessageList channelId={activeChannelId} scrollRef={body} />
          </>
        )}
        {tab === 'assistant' && <AssistantTab />}
        {tab === 'polls' && <PollsTab />}
      </div>
      {tab === 'chat' && activeChannelId && <Composer channelId={activeChannelId} files={files} />}
      {props.children}
    </div>
  );
}
