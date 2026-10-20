import { useState, type ReactNode } from 'react';
import { IDEA_THEMES, type IdeaTheme } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSession } from '../../state/session';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { IdeaCard } from './IdeaCard';
import { IdeaDialog } from './IdeaDialog';

type IdeaTab = 'ideas' | 'mindmap' | 'notes';

export function BrainstormPanel({ className = '', headerActions }: { className?: string; headerActions?: ReactNode }) {
  const { projectId, members, applyRecord } = useWorkspace();
  const { ideas } = useSnapshot();
  const { memberId } = useSession();
  const { toast, toastError } = useFeedback();
  const [tab, setTab] = useState<IdeaTab>('ideas');
  const [theme, setTheme] = useState<IdeaTheme | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const visible = ideas.filter((i) => theme === 'all' || i.theme === theme);

  const vote = (ideaId: string) => api.voteIdea(projectId, ideaId).then((idea) => applyRecord('idea', idea), toastError);
  const convert = async (ideaId: string) => {
    try {
      const { idea, task } = await api.convertIdea(projectId, ideaId);
      applyRecord('idea', idea);
      applyRecord('task', task);
      toast(`“${idea.title}” is now task #${task.num}`);
    } catch (error) {
      toastError(error);
    }
  };

  const tabButton = (id: IdeaTab, label: string) => (
    <button className={`panel-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <div className={`panel brainstorm-panel ${className}`}>
      <div className="panel-tabs">
        {tabButton('ideas', 'Brainstorm')}
        {tabButton('mindmap', 'Mind Map')}
        {tabButton('notes', 'Notes')}
        <div className="panel-actions">{headerActions}</div>
      </div>
      <div className="panel-body">
        {tab !== 'ideas' ? (
          <div className="empty-state">{tab === 'mindmap' ? 'Mind map' : 'Notes'} isn’t built yet — planned for a later iteration.</div>
        ) : (
          <>
            <div className="idea-head">
              <div>
                <h2>
                  <Icon name="sparkle" />
                  AI Brainstorming
                </h2>
                <p>Turn your ideas into structured plans.</p>
              </div>
              <label className="select-btn">
                <select value={theme} onChange={(e) => setTheme(e.target.value as IdeaTheme | 'all')} aria-label="Filter ideas">
                  <option value="all">All ideas</option>
                  {IDEA_THEMES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <button className="btn primary" onClick={() => setAdding(true)}>
                <Icon name="plus" />
                Add Idea
              </button>
            </div>
            <div className="idea-grid">
              {visible.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  author={members.get(idea.authorId)}
                  voted={idea.voterIds.includes(memberId)}
                  onVote={() => vote(idea.id)}
                  onConvert={() => convert(idea.id)}
                />
              ))}
              <button className="idea-add" onClick={() => setAdding(true)}>
                <span>
                  <Icon name="plus" />
                  Add Idea
                </span>
              </button>
            </div>
          </>
        )}
      </div>
      <IdeaDialog open={adding} defaultTheme={theme === 'all' ? 'Product' : theme} onClose={() => setAdding(false)} />
    </div>
  );
}
