import { useEffect, useRef } from 'react';
import {
  hasResearchableDetail,
  type BrainstormActionInput,
  type BrainstormTrigger,
  type Idea,
  type Suggestion,
} from '@project-room/shared';
import { Icon } from '../../components/Icon';
import { isCurrentWebSuggestion } from './similarWebSuggestion';

interface GuideStep {
  trigger: BrainstormTrigger;
  title: string;
  text: string;
  ideaId: string;
  version: string;
}

/** Explore each meaningful problem state once; approved directions may also yield next-step tasks. */
function brainstormGuideSteps(ideas: Idea[], suggestions: Suggestion[]): GuideStep[] {
  const steps: GuideStep[] = [];
  const problem = ideas.find((item) => item.kind === 'problem');
  if (problem && hasResearchableDetail(problem)) {
    const explored = suggestions.some(
      (suggestion) =>
        suggestion.ideaId === problem.id &&
        suggestion.brainstormTrigger === 'problem_created' &&
        suggestion.title.startsWith('Brainstorm checked:') &&
        suggestion.createdAt >= problem.updatedAt,
    );
    if (!explored)
      steps.push({
        trigger: 'problem_created',
        title: `Explore ${problem.title}`,
        text: 'Suggest a direct option or a plan that fits the topic. Product directions can include related web research.',
        ideaId: problem.id,
        version: problem.updatedAt,
      });
  }
  for (const idea of ideas.filter((item) => item.kind === 'idea')) {
    if (hasResearchableDetail(idea)) {
      const trigger = idea.significantChangeAt ? 'idea_updated' : 'first_idea';
      const version = idea.significantChangeAt ?? idea.createdAt;
      const explored = suggestions.some(
        (suggestion) =>
          suggestion.kind === 'brainstorm_analysis' &&
          suggestion.ideaId === idea.id &&
          suggestion.brainstormTrigger === trigger &&
          suggestion.title.startsWith('Brainstorm checked:') &&
          suggestion.createdAt >= version,
      );
      if (!explored)
        steps.push({
          trigger,
          title: `Explore ${idea.title}`,
          text: 'Find a relevant next idea or strategy; product concepts may also surface similar work.',
          ideaId: idea.id,
          version,
        });
    }
    if (idea.approved && idea.theme !== 'Option') {
      const version = idea.updatedAt ?? idea.createdAt;
      const planned = suggestions.some(
        (suggestion) =>
          suggestion.kind === 'action_items' &&
          suggestion.brainstormTrigger === 'idea_approved' &&
          suggestion.ideaId === idea.id &&
          suggestion.createdAt >= version,
      );
      if (!planned)
        steps.push({
          trigger: 'idea_approved',
          title: `Plan next steps for ${idea.title}`,
          text: 'Draft next steps for member review before adding them to the board.',
          ideaId: idea.id,
          version,
        });
    }
  }
  return steps;
}

export function BrainstormGuide({
  ideas,
  suggestions,
  onRun,
  busy,
}: {
  ideas: Idea[];
  suggestions: Suggestion[];
  onRun: (input: BrainstormActionInput, automatic?: boolean) => Promise<void>;
  busy: boolean;
}) {
  const attempted = useRef(new Set<string>());
  const steps = brainstormGuideSteps(ideas, suggestions);
  const latestIdea = [...ideas].reverse().find((idea) => idea.kind === 'idea' && hasResearchableDetail(idea));
  const problem = ideas.find((idea) => idea.kind === 'problem' && hasResearchableDetail(idea));
  const manualTarget = problem ?? latestIdea;

  useEffect(() => {
    if (busy) return;
    const pendingExamples = suggestions.filter(
      (suggestion) => suggestion.status === 'pending' && isCurrentWebSuggestion(suggestion, ideas, suggestions),
    ).length;
    const pendingDirections = suggestions.filter(
      (suggestion) =>
        suggestion.status === 'pending' &&
        suggestion.kind === 'idea' &&
        suggestion.title.startsWith('Brainstorm direction:') &&
        (!problem || suggestion.createdAt >= problem.updatedAt),
    ).length;
    const next = steps.find(
      (step) =>
        !attempted.current.has(`${step.trigger}:${step.ideaId}:${step.version}`) &&
        (step.trigger === 'idea_approved' || step.trigger === 'problem_created' || (pendingExamples < 2 && pendingDirections < 1)),
    );
    if (!next) return;
    attempted.current.add(`${next.trigger}:${next.ideaId}:${next.version}`);
    void onRun({ trigger: next.trigger, ideaId: next.ideaId }, true);
  }, [busy, onRun, steps, suggestions, ideas, problem]);

  return (
    <section className="brainstorm-guide" aria-labelledby="brainstorm-guide-title">
      <div className="brainstorm-guide-head">
        <div>
          <strong id="brainstorm-guide-title">Explore with AI</strong>
          <p>Get options, product ideas, or strategies that fit your topic. Product concepts may also show relevant web examples.</p>
        </div>
        <button
          className="btn sm"
          disabled={busy || !manualTarget}
          onClick={() => manualTarget && onRun({ trigger: 'manual', ideaId: manualTarget.id })}
        >
          <Icon name="sparkle" /> Explore now
        </button>
      </div>
      {steps.length > 0 && (
        <div className="brainstorm-guide-list">
          {steps.map((step) => (
            <article key={`${step.trigger}:${step.ideaId}`} className="brainstorm-guide-step">
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <button className="btn sm" disabled={busy} onClick={() => onRun({ trigger: step.trigger, ideaId: step.ideaId })}>
                {step.trigger === 'idea_approved' ? 'Draft next steps' : 'Explore'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
