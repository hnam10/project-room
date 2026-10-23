import { Navigate, Route, Routes } from 'react-router-dom';
import { ChooseTeam } from './features/account/ClerkAccount';
import { CalendarPage } from './features/calendar/CalendarPage';
import { WorkspaceLayout } from './layouts/WorkspaceLayout';
import { BoardPage } from './pages/BoardPage';
import { ChatPopoutPage } from './pages/ChatPopoutPage';
import { BrainstormPage, ChatPage, DecisionsPage, PlaceholderPage } from './pages/FeaturePages';
import { MeetingPage } from './pages/MeetingPage';
import { useSession } from './state/session';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/p/:projectId/popout/chat" element={<ChatPopoutPage />} />
      <Route path="/p/:projectId" element={<WorkspaceLayout />}>
        <Route index element={<Navigate to="board" replace />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="brainstorm" element={<BrainstormPage />} />
        <Route path="decisions" element={<DecisionsPage />} />
        <Route path="meeting" element={<MeetingPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route
          path="files"
          element={<PlaceholderPage icon="file" title="Files" text="Shared project files will live here. Uploads aren’t built yet." />}
        />
        <Route
          path="overview"
          element={<PlaceholderPage icon="tasks" title="Overview" text="A project summary dashboard is planned for a later iteration." />}
        />
        <Route
          path="team"
          element={<PlaceholderPage icon="users" title="Team" text="Member roles and workload will live here. Not built yet." />}
        />
        <Route path="settings" element={<PlaceholderPage icon="settings" title="Settings" text="Project settings aren’t built yet." />} />
        <Route path="*" element={<PlaceholderPage icon="alert" title="Page not found" text="That page doesn’t exist in this project." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Sends the member to their active team's project, or shows the team picker. */
function Home() {
  const { me, error } = useSession();
  if (error) {
    return (
      <div className="boot">
        <div>
          <h1>Can’t reach Project Room</h1>
          <p>{error}</p>
          <p>
            Start everything with <code>npm run dev</code> from the repository root.
          </p>
        </div>
      </div>
    );
  }
  if (!me) return <div className="boot">Loading…</div>;
  const first = me.projects[0];
  if (!first) return <ChooseTeam />;
  return <Navigate to={`/p/${first.id}/board`} replace />;
}
