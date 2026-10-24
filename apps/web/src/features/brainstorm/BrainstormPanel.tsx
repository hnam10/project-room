import { useState, type ReactNode } from 'react';
import { IDEA_THEME_CHOICES, type BrainstormActionInput, type Idea, type IdeaTheme } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSession } from '../../state/session';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { IdeaCard } from './IdeaCard';
import { IdeaDialog } from './IdeaDialog';
import { BrainstormSuggestionCard } from './BrainstormSuggestionCard';
import { BrainstormTopicSuggestionCard } from './BrainstormTopicSuggestionCard';
import { BrainstormGuide } from './BrainstormGuide';
import { BrainstormAnalysisCard } from './BrainstormAnalysisCard';
import { isCurrentWebSuggestion, isSimilarWebSuggestion } from './similarWebSuggestion';
import { ActionItemsCard } from '../chat/ActionItemsCard';

type IdeaTab = 'ideas' | 'mindmap' | 'notes';

export function BrainstormPanel({ className = '', headerActions }: { className?: string; headerActions?: ReactNode }) {
  const { projectId, members, applyRecord, reload } = useWorkspace();
  const { ideas, suggestions } = useSnapshot();
  const { memberId } = useSession();
  const { toast, toastError, confirm } = useFeedback();
  const [tab, setTab] = useState<IdeaTab>('ideas');
  const [theme, setTheme] = useState<IdeaTheme | 'all'>('all');
  const [dialog, setDialog] = useState<{ kind: 'problem' | 'idea'; idea?: Idea } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const problem = ideas.find((idea) => idea.kind === 'problem');
  const pendingTopics = suggestions.filter((suggestion) => suggestion.status === 'pending' && suggestion.kind === 'brainstorm_topic');
  const visible = ideas.filter((i) => i.kind !== 'problem' && i.theme !== 'Strategy' && (theme === 'all' || i.theme === theme));
  const strategies = ideas.filter((idea) => idea.kind !== 'problem' && idea.theme === 'Strategy');
  const pendingIdeas = suggestions.filter(
    (suggestion) =>
      suggestion.status === 'pending' &&
      suggestion.kind === 'idea' &&
      (!suggestion.brainstormTrigger ||
        suggestion.researchSources.length > 0 ||
        (suggestion.title.startsWith('Brainstorm direction:') && (!problem || suggestion.createdAt >= problem.updatedAt))),
  );
  const pendingAnalyses = suggestions.filter(
    (suggestion) => suggestion.status === 'pending' && isCurrentWebSuggestion(suggestion, ideas, suggestions),
  );
  const pendingTasks = suggestions.filter(
    (suggestion) => suggestion.status === 'pending' && suggestion.kind === 'action_items' && suggestion.brainstormTrigger,
  );
  const pendingStrategies = pendingIdeas.filter((suggestion) => suggestion.ideaDraft?.theme === 'Strategy');
  const pendingDirectIdeas = pendingIdeas.filter((suggestion) => suggestion.ideaDraft?.theme !== 'Strategy');
  const directThemes: IdeaTheme[] = [
    ...IDEA_THEME_CHOICES.filter((ideaTheme) => ideaTheme !== 'Strategy'),
    ...new Set(
      ideas
        .filter((idea) => idea.kind === 'idea' && idea.theme !== 'Strategy')
        .map((idea) => idea.theme)
        .filter((ideaTheme) => !IDEA_THEME_CHOICES.some((choice) => choice === ideaTheme)),
    ),
  ];

  const runAi = async (input: BrainstormActionInput, automatic = false) => {
    setAiBusy(true);
    try {
      const drafts = await api.runBrainstormAction(projectId, input);
      drafts.forEach((draft) => applyRecord('suggestion', draft));
      reload();
      if (!automatic) {
        const examples = drafts.filter(isSimilarWebSuggestion).length;
        const directions = drafts.filter((draft) => draft.kind === 'idea').length;
        toast(
          directions && examples
            ? `Suggested a direction and found ${examples} related web example${examples === 1 ? '' : 's'}`
            : directions
              ? `${directions} idea or strategy suggestion${directions === 1 ? '' : 's'} ready for review`
              : examples
                ? `Found ${examples} relevant web example${examples === 1 ? '' : 's'} for review`
                : drafts.length
                  ? 'Next-step draft ready for review'
                  : 'No new suggestion was relevant to this brainstorm',
        );
      }
    } catch (error) {
      if (!automatic) toastError(error);
    } finally {
      setAiBusy(false);
    }
  };

  const shortlist = async (idea: Idea) => {
    try {
      applyRecord('idea', await api.shortlistIdea(projectId, idea.id, !idea.shortlisted));
    } catch (error) {
      toastError(error);
    }
  };
  const approve = async (idea: Idea) => {
    if (
      !(await confirm({
        title: idea.theme === 'Option' ? 'Select this option?' : 'Approve this idea?',
        text:
          idea.theme === 'Option'
            ? `Choose “${idea.title}” as the team’s selected option?`
            : `Make “${idea.title}” a selected direction for the project?`,
        okLabel: idea.theme === 'Option' ? 'Select option' : 'Approve idea',
      }))
    )
      return;
    try {
      applyRecord('idea', await api.approveIdea(projectId, idea.id));
      toast(
        idea.theme === 'Option'
          ? 'Option selected'
          : idea.theme === 'Strategy'
            ? 'Strategy approved. AI can now propose next steps.'
            : 'Idea approved. AI can now propose an MVP and tasks.',
      );
    } catch (error) {
      toastError(error);
    }
  };

  const remove = async (idea: Idea) => {
    const detail =
      idea.kind === 'problem'
        ? 'Your other ideas will remain. Related pending AI suggestions will be dismissed.'
        : 'Any linked task will remain on the board. Related pending AI suggestions will be dismissed.';
    if (
      !(await confirm({
        title: idea.kind === 'problem' ? 'Delete central problem?' : 'Delete idea?',
        text: `“${idea.title}” will be permanently deleted. ${detail}`,
        okLabel: 'Delete',
      }))
    )
      return;
    try {
      await api.deleteIdea(projectId, idea.id);
      applyRecord('idea', idea, true);
      reload();
      toast(idea.kind === 'problem' ? 'Central problem deleted' : 'Idea deleted');
    } catch (error) {
      toastError(error);
    }
  };

  const vote = (ideaId: string) => api.voteIdea(projectId, ideaId).then((idea) => applyRecord('idea', idea), toastError);
  const startVote = async (ideaId: string) => {
    const idea = ideas.find((candidate) => candidate.id === ideaId);
    if (!idea) return;
    if (
      !(await confirm({
        title: 'Start voting?',
        text: `Open “${idea.title}” for team votes?`,
        okLabel: 'Start voting',
      }))
    )
      return;
    try {
      applyRecord('idea', await api.startIdeaVote(projectId, ideaId));
      toast('Voting is open');
    } catch (error) {
      toastError(error);
    }
  };
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

  const ideaCard = (idea: Idea) => (
    <IdeaCard
      key={idea.id}
      idea={idea}
      author={members.get(idea.authorId)}
      voted={idea.voterIds.includes(memberId)}
      onVote={() => vote(idea.id)}
      onStartVote={() => void startVote(idea.id)}
      onConvert={() => convert(idea.id)}
      onEdit={() => setDialog({ kind: 'idea', idea })}
      onDelete={() => void remove(idea)}
      onShortlist={() => void shortlist(idea)}
      onApprove={() => void approve(idea)}
    />
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
            <div className="brainstorm-problem">
              {problem ? (
                <>
                  <div>
                    <strong>Brainstorm topic</strong>
                    <h3>{problem.title}</h3>
                    <p>{problem.description}</p>
                  </div>
                  <div className="brainstorm-problem-actions">
                    <button className="btn sm" onClick={() => setDialog({ kind: 'problem', idea: problem })}>
                      Edit topic
                    </button>
                    <button className="btn danger-ghost sm" onClick={() => void remove(problem)}>
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <strong>Start here</strong>
                    <h3>What are you trying to decide or solve?</h3>
                    <p>Add a question or problem so AI can suggest relevant options, plans, or research.</p>
                  </div>
                  <button className="btn primary sm" onClick={() => setDialog({ kind: 'problem' })}>
                    Set topic
                  </button>
                </>
              )}
            </div>
            {pendingTopics.map((suggestion) => (
              <BrainstormTopicSuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))}
            <section className="brainstorm-support" aria-labelledby="brainstorm-support-title">
              <div className="brainstorm-support-head">
                <h2 id="brainstorm-support-title">Guidance, research &amp; strategies</h2>
                <p>Explore the problem, review relevant research, and plan your approach.</p>
              </div>
              <BrainstormGuide ideas={ideas} suggestions={suggestions} onRun={runAi} busy={aiBusy} />
              {pendingAnalyses.length > 0 && (
                <div className="brainstorm-research">
                  <h3>Research</h3>
                  <div className="brainstorm-analysis-list">
                    {pendingAnalyses.map((suggestion) => (
                      <BrainstormAnalysisCard key={suggestion.id} suggestion={suggestion} />
                    ))}
                  </div>
                </div>
              )}
              {(pendingStrategies.length > 0 || strategies.length > 0) && (
                <div className="brainstorm-strategies">
                  <h3>Strategies</h3>
                  <div className="brainstorm-strategy-grid">
                    {pendingStrategies.map((suggestion) => (
                      <BrainstormSuggestionCard key={suggestion.id} suggestion={suggestion} />
                    ))}
                    {strategies.map(ideaCard)}
                  </div>
                </div>
              )}
              {pendingTasks.length > 0 && (
                <div className="brainstorm-analysis-list">
                  {pendingTasks.map((suggestion) => (
                    <article className="brainstorm-analysis" key={suggestion.id}>
                      <h3>{suggestion.title}</h3>
                      <ActionItemsCard suggestion={suggestion} />
                    </article>
                  ))}
                </div>
              )}
            </section>
            <div className="idea-head">
              <div>
                <h2>
                  <Icon name="sparkle" />
                  Brainstorming ideas
                </h2>
                <p>Direct options and ideas for this topic.</p>
              </div>
              <label className="select-btn">
                <select value={theme} onChange={(e) => setTheme(e.target.value as IdeaTheme | 'all')} aria-label="Filter ideas">
                  <option value="all">All ideas</option>
                  {directThemes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <button className="btn primary" onClick={() => setDialog({ kind: 'idea' })}>
                <Icon name="plus" />
                Add Idea
              </button>
            </div>
            <div className="idea-grid">
              {pendingDirectIdeas.map((suggestion) => (
                <BrainstormSuggestionCard key={suggestion.id} suggestion={suggestion} />
              ))}
              {visible.map(ideaCard)}
              <button className="idea-add" onClick={() => setDialog({ kind: 'idea' })}>
                <span>
                  <Icon name="plus" />
                  Add Idea
                </span>
              </button>
            </div>
          </>
        )}
      </div>
      <IdeaDialog
        open={!!dialog}
        defaultTheme={theme === 'all' ? 'Option' : theme}
        kind={dialog?.kind}
        idea={dialog?.idea}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
