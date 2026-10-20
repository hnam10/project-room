import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { AssistantTab } from './AssistantTab';
import { Composer } from './Composer';
import { DecisionsTab } from './DecisionsTab';
import { MessageList } from './MessageList';

export type ChatTab = 'chat' | 'assistant' | 'decisions';

/**
 * Chat, AI Assistant and Decisions in one panel. The same component renders in the dock,
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
  const { activeChannelId, setActiveChannelId } = useWorkspace();
  const { channels, suggestions } = useSnapshot();
  const [tab, setTab] = useState<ChatTab>(props.initialTab ?? 'chat');
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const pendingInsights = suggestions.filter((s) => s.status === 'pending' && s.kind !== 'action_items').length;

  const tabButton = (id: ChatTab, label: ReactNode) => (
    <button role="tab" aria-selected={tab === id} className={`panel-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <div ref={panel} className={`panel chat-panel ${props.className ?? ''}`} style={props.style}>
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
        {tabButton('decisions', 'Decisions')}
        <div className="panel-actions window-actions">{props.headerActions}</div>
      </div>

      <div className="panel-body" ref={body}>
        {tab === 'chat' && activeChannelId && (
          <>
            <div className="channel-title">
              <Icon name="hash" />
              <select className="channel-select" value={activeChannelId} onChange={(e) => setActiveChannelId(e.target.value)} aria-label="Channel">
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
        {tab === 'assistant' && <AssistantTab onOpenDecisions={() => setTab('decisions')} />}
        {tab === 'decisions' && <DecisionsTab />}
      </div>
      {tab === 'chat' && activeChannelId && <Composer channelId={activeChannelId} />}
      {props.children}
    </div>
  );
}
