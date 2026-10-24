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
import { readStored, writeStored } from '../../state/storage';

type IdeaTab = 'ideas' | 'mindmap' | 'notes';

export function BrainstormPanel({ className = '', headerActions }: { className?: string; headerActions?: ReactNode }) {
  const { projectId, members, applyRecord, reload } = useWorkspace();
  const snapshot = useSnapshot();
  const [selectedTopicId, selectTopic] = useState<string | null>(() => readStored(`brainstorm-topic:${projectId}`, null));
  const topics = snapshot.ideas.filter((idea) => idea.kind === 'problem');
  const problem = topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const chooseTopic = (id: string) => {
    selectTopic(id);
    writeStored(`brainstorm-topic:${projectId}`, id);
    setTheme('all');
    setDialog(null);
  };
  const ideas = snapshot.ideas.filter((idea) => idea.id === problem?.id || (problem && idea.topicId === problem.id));
  const suggestions = snapshot.suggestions.filter((item) => problem && item.topicId === problem.id);
  const prepared = suggestions.some((item) => item.ideaId === problem?.id && item.title.startsWith('Brainstorm checked:'));
  const { memberId } = useSession();
  const { toast, toastError, confirm } = useFeedback();
  const [tab, setTab] = useState<IdeaTab>('ideas');
  const [theme, setTheme] = useState<IdeaTheme | 'all'>('all');
  const [dialog, setDialog] = useState<{ kind: 'problem' | 'idea'; idea?: Idea } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const pendingTopics = snapshot.suggestions.filter(
    (suggestion) => suggestion.status === 'pending' && suggestion.kind === 'brainstorm_topic',
  );
  const visible = ideas.filter((i) => i.kind !== 'problem' && i.theme !== 'Strategy' && (theme === 'all' || i.theme === theme));
  const strategies = ideas.filter((idea) => idea.kind !== 'problem' && idea.theme === 'Strategy');
  const pendingIdeas = suggestions.filter((suggestion) => suggestion.status === 'pending' && suggestion.kind === 'idea');
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
      if (!problem) return;
      const drafts = await api.runBrainstormAction(projectId, { ...input, topicId: problem.id });
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
        title: idea.kind === 'problem' ? 'Delete topic and its board?' : 'Delete idea?',
        text:
          idea.kind === 'problem'
            ? `Delete “${idea.title}” and all its ideas, research, strategies and drafts? Other topics and existing tasks stay in place.`
            : `“${idea.title}” will be permanently deleted. ${detail}`,
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

  const clearIdeas = async () => {
    if (
      !problem ||
      !(await confirm({
        title: 'Clear all ideas for this topic?',
        text: 'This removes all direct ideas and direct AI idea drafts from this topic. The topic, research and strategies stay. Tasks already on the task board stay in place.',
        okLabel: 'Clear ideas',
      }))
    )
      return;
    try {
      await api.clearTopicIdeas(projectId, problem.id);
      reload();
      toast('Ideas cleared. Research and strategies kept.');
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
            {topics.length > 0 && (
              <div className="brainstorm-topics" role="tablist" aria-label="Brainstorm topics">
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    role="tab"
                    title={topic.title}
                    aria-selected={topic.id === problem?.id}
                    className={`brainstorm-topic-tab${topic.id === problem?.id ? ' active' : ''}`}
                    onClick={() => chooseTopic(topic.id)}
                  >
                    {topic.title}
                  </button>
                ))}
                <button className="btn sm" onClick={() => setDialog({ kind: 'problem' })}>
                  <Icon name="plus" /> New topic
                </button>
              </div>
            )}
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
                    <p>Pick a topic first. AI will research it and suggest an approach before your team adds ideas.</p>
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
            {problem && (
              <>
                <section className="brainstorm-support" aria-labelledby="brainstorm-support-title">
                  <div className="brainstorm-support-head">
                    <h2 id="brainstorm-support-title">Research &amp; strategies</h2>
                    <p>Review the evidence and choose an approach, then develop your own ideas below.</p>
                  </div>
                  <BrainstormGuide key={problem.id} ideas={ideas} suggestions={suggestions} onRun={runAi} busy={aiBusy} />
                  {suggestions.find((item) => item.kind === 'brainstorm_analysis' && item.title === 'Topic research status')?.proposal && (
                    <p className="brainstorm-research-status" role="status">
                      {suggestions.find((item) => item.title === 'Topic research status')?.proposal}
                    </p>
                  )}
                  {problem.researchSources.length > 0 && (
                    <div className="idea-sources">
                      <strong>Saved research</strong>
                      {problem.researchSources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                      ))}
                    </div>
                  )}
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
                    <p>
                      {prepared
                        ? 'Direct options and ideas for this topic.'
                        : 'Research and strategy preparation comes first. You can add ideas when it finishes.'}
                    </p>
                  </div>
                  <label className="select-btn">
                    <select value={theme} onChange={(e) => setTheme(e.target.value as IdeaTheme | 'all')} aria-label="Filter ideas">
                      <option value="all">All ideas</option>
                      {directThemes.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <button className="btn primary" disabled={!prepared} onClick={() => setDialog({ kind: 'idea' })}>
                    <Icon name="plus" />
                    Add Idea
                  </button>
                  <button
                    className="btn danger-ghost sm"
                    disabled={
                      aiBusy || (!ideas.some((item) => item.kind === 'idea' && item.theme !== 'Strategy') && !pendingDirectIdeas.length)
                    }
                    onClick={() => void clearIdeas()}
                  >
                    Clear ideas
                  </button>
                </div>
                <div className="idea-grid">
                  {pendingDirectIdeas.map((suggestion) => (
                    <BrainstormSuggestionCard key={suggestion.id} suggestion={suggestion} />
                  ))}
                  {visible.map(ideaCard)}
                  <button className="idea-add" disabled={!prepared} onClick={() => setDialog({ kind: 'idea' })}>
                    <span>
                      <Icon name="plus" />
                      Add Idea
                    </span>
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <IdeaDialog
        open={!!dialog}
        defaultTheme={theme === 'all' ? 'Option' : theme}
        kind={dialog?.kind}
        idea={dialog?.idea}
        topicId={problem?.id}
        onSaved={(saved) => {
          if (saved.kind === 'problem') chooseTopic(saved.id);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
