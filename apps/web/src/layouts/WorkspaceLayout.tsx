import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { AccountButton, InviteButton, TeamSwitcher } from '../features/account/ClerkAccount';
import { useClerkIdentity } from '../features/account/clerkIdentityContext';
import { DetachedChat } from '../features/dock/DetachedChat';
import { ChannelDialog } from '../features/chat/ChannelDialog';
import { ChatWindowProvider } from '../state/chatWindow';
import { MeetingCallProvider } from '../state/meetingCall';
import { useSession } from '../state/session';
import { WorkspaceProvider, useWorkspace } from '../state/workspace';

// const TOP_TABS: [string, string][] = [
//   ['board', 'Board'],
//   ['chat', 'Chat'],
//   ['brainstorm', 'Brainstorm'],
//   ['polls', 'Polls'],
//   ['calendar', 'Calendar'],
//   ['files', 'Files'],
//   ['overview', 'Overview'],
// ];

const SIDE_NAV: [string, string, IconName][] = [
  ['board', 'Overview', 'tasks'],
  ['chat', 'Chat', 'message'],
  ['meeting', 'Meeting', 'mic'],
  ['brainstorm', 'Brainstorm', 'bulb'],
  ['polls', 'Polls', 'flag'],
  ['calendar', 'Calendar', 'calendar'],
  ['files', 'Files', 'file'],
  ['settings', 'Settings', 'settings'],
];

/** App shell for one project: top bar, sidebar, the routed page, and the chat when it's detached. */
export function WorkspaceLayout() {
  const { projectId = '' } = useParams();
  return (
    <WorkspaceProvider projectId={projectId}>
      <ChatWindowProvider projectId={projectId}>
        <MeetingCallProvider>
          <Shell />
        </MeetingCallProvider>
      </ChatWindowProvider>
    </WorkspaceProvider>
  );
}

function Shell() {
  const { snapshot, error, reload } = useWorkspace();
  if (error) {
    return (
      <div className="boot">
        <div>
          <h1>Couldn’t open this project</h1>
          <p>{error}</p>
          <button className="btn" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!snapshot) return <div className="boot">Loading project…</div>;

  return (
    <div className="app">
      <TopBar />
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
      <DetachedChat />
    </div>
  );
}

function TopBar() {
  const { snapshot } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const project = snapshot!.project;

  return (
    <header className="topbar">
      <div className="brand">
        <strong>Project Room</strong>
        <span className="crumb-sep">/</span>
        <span className="crumb-project">{project.name}</span>
      </div>
      {/* <nav className="top-tabs" aria-label="Workspace views">
        {TOP_TABS.map(([path, label]) => (
          <NavLink key={path} to={path} className={({ isActive }) => `top-tab${isActive ? ' active' : ''}`}>
            {label}
          </NavLink>
        ))}
      </nav> */}
      <label className="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Search tasks…"
          autoComplete="off"
          value={params.get('q') ?? ''}
          onChange={(e) => navigate(`board${e.target.value ? `?q=${encodeURIComponent(e.target.value)}` : ''}`, { replace: true })}
        />
      </label>
      <div className="member-stack" aria-label="Project members">
        {snapshot!.members.map((m) => (
          <Avatar key={m.id} member={m} />
        ))}
      </div>
      <InviteButton>
        <button className="icon-btn round invite-button" aria-label="Invite member">
          <Icon name="plus" />
        </button>
      </InviteButton>
    </header>
  );
}

function Sidebar() {
  const { snapshot, activeChannelId, setActiveChannelId, connection } = useWorkspace();
  const { me } = useSession();
  const identity = useClerkIdentity(me?.member.id);
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const [creatingChannel, setCreatingChannel] = useState(false);
  const { channels } = snapshot!;

  return (
    <aside className="sidebar">
      <TeamSwitcher />

      <nav className="side-nav" aria-label="Main navigation">
        {SIDE_NAV.map(([path, label, icon]) => (
          <NavLink key={path} to={path} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <Icon name={icon} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="side-section">
        <span>Channels</span>
        <button className="icon-btn small" aria-label="Add channel" onClick={() => setCreatingChannel(true)}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="channel-list">
        {channels.map((c) => (
          <button
            key={c.id}
            className={`side-link${c.id === activeChannelId ? ' active' : ''}`}
            onClick={() => {
              setActiveChannelId(c.id);
              if (!location.pathname.endsWith('/board')) navigate('chat');
            }}
          >
            <Icon name="hash" />
            {c.name}
          </button>
        ))}
      </div>

      <div className="dev-member">
        <span className={`conn-dot${connection === 'online' ? ' online' : ''}`} title={`Realtime: ${connection}`} />
        <AccountButton />
        {identity?.name ?? me?.member.name}
      </div>
      <ChannelDialog open={creatingChannel} onClose={() => setCreatingChannel(false)} />
    </aside>
  );
}
