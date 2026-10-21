import { NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { useFeedback } from '../components/Feedback';
import { DetachedChat } from '../features/dock/DetachedChat';
import { ChatWindowProvider } from '../state/chatWindow';
import { useSession } from '../state/session';
import { WorkspaceProvider, useWorkspace } from '../state/workspace';

const TOP_TABS: [string, string][] = [
  // ['board', 'Board'],
  // ['chat', 'Chat'],
  // ['brainstorm', 'Brainstorm'],
  // ['decisions', 'Decisions'],
  // ['calendar', 'Calendar'],
  // ['files', 'Files'],
  // ['overview', 'Overview'],
];

const SIDE_NAV: [string, string, IconName][] = [
  ['board', 'Tasks', 'tasks'],
  ['chat', 'Chat', 'message'],
  ['brainstorm', 'Brainstorm', 'bulb'],
  ['decisions', 'Decisions', 'flag'],
  ['calendar', 'Calendar', 'calendar'],
  ['files', 'Files', 'file'],
  ['team', 'Team', 'users'],
  ['settings', 'Settings', 'settings'],
];

/** App shell for one project: top bar, sidebar, the routed page, and the chat when it's detached. */
export function WorkspaceLayout() {
  const { projectId = '' } = useParams();
  return (
    <WorkspaceProvider projectId={projectId}>
      <ChatWindowProvider projectId={projectId}>
        <Shell />
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
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const project = snapshot!.project;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
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
      <button className="icon-btn round invite-button" aria-label="Invite member" onClick={() => toast('Invitations aren’t built yet.')}>
        <Icon name="plus" />
      </button>
      <button className="btn primary share-button" onClick={() => toast('Sharing isn’t built yet.')}>
        <Icon name="plus" />
        Share
      </button>
    </header>
  );
}

function Sidebar() {
  const { snapshot, activeChannelId, setActiveChannelId, connection } = useWorkspace();
  const { me, memberId, switchMember } = useSession();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const { project, channels, members } = snapshot!;

  return (
    <aside className="sidebar">
      <button className="workspace-switch" onClick={() => toast('Switching workspaces isn’t built yet.')}>
        <span className="workspace-icon">P</span>
        <strong>Project Room</strong>
        <Icon name="chevron" />
      </button>
      {(me?.projects ?? [project]).map((p) => (
        <NavLink key={p.id} to={`/p/${p.id}/board`} className={() => `side-link${p.id === project.id ? ' active' : ''}`}>
          <span className="project-dot" style={{ background: p.color }} />
          {p.name}
        </NavLink>
      ))}
      <button className="side-link muted" onClick={() => toast('Creating projects isn’t built yet.')}>
        <Icon name="plus" />
        New Project
      </button>

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
        <button className="icon-btn small" aria-label="Add channel" onClick={() => toast('Creating channels isn’t built yet.')}>
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

      <label className="dev-member" title="Development only: there is no login yet">
        <span className={`conn-dot${connection === 'online' ? ' online' : ''}`} title={`Realtime: ${connection}`} />
        Acting as
        <select value={memberId} onChange={(e) => switchMember(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}
