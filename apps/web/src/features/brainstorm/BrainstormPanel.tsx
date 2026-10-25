import { useRef, useState, type ReactNode } from 'react';
import type { BrainstormActionInput, Idea } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSession } from '../../state/session';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { IdeaCard } from './IdeaCard';
import { IdeaDialog } from './IdeaDialog';
import { BrainstormSuggestionCard } from './BrainstormSuggestionCard';
import { BrainstormTopicSuggestionCard } from './BrainstormTopicSuggestionCard';
import { BrainstormTopicTabs } from './BrainstormTopicTabs';
import { BrainstormGuide } from './BrainstormGuide';
import { BrainstormAnalysisCard } from './BrainstormAnalysisCard';
import { isCurrentWebSuggestion, isSimilarWebSuggestion } from './similarWebSuggestion';
import { ActionItemsCard } from '../chat/ActionItemsCard';
import { readStored, writeStored } from '../../state/storage';

type IdeaTab = 'ideas' | 'notes';

/** Renders the topic-scoped research, strategies, ideas, and pending AI proposals. */
export function BrainstormPanel({ className = '', headerActions }: { className?: string; headerActions?: ReactNode }) {
  const { projectId, members, applyRecord, reload } = useWorkspace();
  const snapshot = useSnapshot();
  const [selectedTopicId, selectTopic] = useState<string | null>(() => readStored(`brainstorm-topic:${projectId}`, null));
  const topics = snapshot.ideas.filter((idea) => idea.kind === 'problem');
  const problem = topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const chooseTopic = (id: string) => {
    selectTopic(id);
    writeStored(`brainstorm-topic:${projectId}`, id);
    setDialog(null);
  };
  const ideas = snapshot.ideas.filter((idea) => idea.id === problem?.id || (problem && idea.topicId === problem.id));
  const suggestions = snapshot.suggestions.filter((item) => problem && item.topicId === problem.id);
  const prepared = suggestions.some((item) => item.ideaId === problem?.id && item.title.startsWith('Brainstorm checked:'));
  const { memberId } = useSession();
  const { toast, toastError, confirm } = useFeedback();
  const [tab, setTab] = useState<IdeaTab>('ideas');
  const [dialog, setDialog] = useState<{ kind: 'problem' | 'idea'; idea?: Idea } | null>(null);
  const runningTopics = useRef(new Set<string>());
  const automaticAttempts = useRef(new Set<string>());
  const [busyTopics, setBusyTopics] = useState<string[]>([]);
  const aiBusy = !!problem && busyTopics.includes(problem.id);
  const researchStatus = suggestions.find(
    (item) => item.kind === 'brainstorm_analysis' && item.title === 'Topic research status',
  )?.proposal;
  const aiUnavailable = /usage limit|AI guidance is temporarily unavailable/.test(researchStatus ?? '');

  const pendingTopics = snapshot.suggestions.filter(
    (suggestion) => suggestion.status === 'pending' && suggestion.kind === 'brainstorm_topic' && !suggestion.ideaId,
  );
  const pendingTopicChanges = snapshot.suggestions.filter(
    (suggestion) => suggestion.status === 'pending' && suggestion.kind === 'brainstorm_topic' && suggestion.ideaId === problem?.id,
  );
  const visible = ideas.filter((i) => i.kind !== 'problem' && i.theme !== 'Strategy');
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

  const runAi = async (input: BrainstormActionInput, automatic = false) => {
    if (!problem || runningTopics.current.has(problem.id)) return;
    const topicId = problem.id;
    runningTopics.current.add(topicId);
    setBusyTopics((current) => [...current, topicId]);
    try {
      const drafts = await api.runBrainstormAction(projectId, { ...input, topicId });
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
      runningTopics.current.delete(topicId);
      setBusyTopics((current) => current.filter((id) => id !== topicId));
    }
  };

  const approve = async (idea: Idea) => {
    if (
      !(await confirm({
        title: idea.theme === 'Strategy' ? 'Approve this strategy?' : 'Approve this idea?',
        text: `Make “${idea.title}” a selected direction for the team?`,
        okLabel: 'Approve',
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
      onEdit={() => setDialog({ kind: 'idea', idea })}
      onDelete={() => void remove(idea)}
      onApprove={() => void approve(idea)}
    />
  );

  return (
    <div className={`panel brainstorm-panel ${className}`}>
      <div className="panel-tabs">
        {tabButton('ideas', 'Brainstorm')}
        {tabButton('notes', 'Notes')}
        <div className="panel-actions">{headerActions}</div>
      </div>
      {topics.length > 0 && (
        <BrainstormTopicTabs topics={topics} selectedId={problem?.id} onSelect={chooseTopic} onNew={() => setDialog({ kind: 'problem' })} />
      )}
      <div className="panel-body">
        {tab !== 'ideas' ? (
          <div className="empty-state">Notes isn’t built yet — planned for a later iteration.</div>
        ) : (
          <>
            {(pendingTopics.length > 0 || pendingTopicChanges.length > 0) && (
              <details className="brainstorm-disclosure brainstorm-topic-inbox" key={`proposals:${problem?.id ?? 'new'}`}>
                <summary>
                  Suggested topics <span className="brainstorm-section-count">{pendingTopics.length + pendingTopicChanges.length}</span>
                </summary>
                <div className="brainstorm-disclosure-content">
                  <p>Review new topics from conversations and proposed changes to this topic.</p>
                  {pendingTopics.map((suggestion) => (
                    <BrainstormTopicSuggestionCard key={suggestion.id} suggestion={suggestion} />
                  ))}
                  {pendingTopicChanges.map((suggestion) => (
                    <BrainstormTopicSuggestionCard key={suggestion.id} suggestion={suggestion} />
                  ))}
                </div>
              </details>
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
            {problem && (
              <>
                <div className="brainstorm-support" key={problem.id}>
                  <details className="brainstorm-disclosure">
                    <summary>
                      Research
                      <span className="brainstorm-section-count">{pendingAnalyses.length + problem.researchSources.length}</span>
                      {aiBusy && (
                        <span className="brainstorm-section-status" role="status">
                          Researching…
                        </span>
                      )}
                      {!aiBusy && aiUnavailable && <span className="brainstorm-section-status">AI unavailable</span>}
                    </summary>
                    <div className="brainstorm-disclosure-content">
                      <BrainstormGuide ideas={ideas} suggestions={suggestions} onRun={runAi} busy={aiBusy} attempted={automaticAttempts} />
                      {researchStatus && (
                        <p className="brainstorm-research-status" role="status">
                          {researchStatus}
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
                          <div className="brainstorm-analysis-list">
                            {pendingAnalyses.map((suggestion) => (
                              <BrainstormAnalysisCard key={suggestion.id} suggestion={suggestion} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                  <details className="brainstorm-disclosure">
                    <summary>
                      Strategies <span className="brainstorm-section-count">{pendingStrategies.length + strategies.length}</span>
                      {!aiBusy && aiUnavailable && <span className="brainstorm-section-status">AI unavailable</span>}
                    </summary>
                    <div className="brainstorm-disclosure-content">
                      {pendingStrategies.length === 0 && strategies.length === 0 && (
                        <p>{aiUnavailable ? researchStatus : 'No strategies yet.'}</p>
                      )}
                      <div className="brainstorm-strategy-grid">
                        {pendingStrategies.map((suggestion) => (
                          <BrainstormSuggestionCard key={suggestion.id} suggestion={suggestion} />
                        ))}
                        {strategies.map(ideaCard)}
                      </div>
                    </div>
                  </details>
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
                </div>
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
                  <button className="btn idea-btn" disabled={!prepared} onClick={() => setDialog({ kind: 'idea' })}>
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
