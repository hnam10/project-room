import { createHash } from 'node:crypto';
import {
  RESEARCH_SUMMARY_REASON,
  hasResearchableDetail,
  researchTerms,
  type BrainstormActionInput,
  type Idea,
  type Suggestion,
} from '@project-room/shared';
import { getAiProvider } from '../ai/index.js';
import { AiRequestError } from '../ai/openai.js';
import type { AiProvider, BrainstormMode } from '../ai/provider.js';
import { ConflictError } from '../db/records.js';
import { getIdea, listIdeas } from '../repositories/ideas.js';
import { createSuggestion, getSuggestion, listSuggestions, updateSuggestionResearchSummary } from '../repositories/suggestions.js';
import { researchWeb, type WebResearchResult } from './research.js';
import { brainstormScope, getTopic } from '../repositories/brainstorm-topics.js';

const EXPLORATION_TRIGGERS = new Set<BrainstormActionInput['trigger']>(['problem_created', 'first_idea', 'idea_updated', 'manual']);
const runningActions = new Map<string, Promise<Suggestion[]>>();

function idFor(...parts: string[]): string {
  return `brainstorm_${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24)}`;
}

/** Only surface search results that share concrete topic words with the idea. */
export function similarWebResults(idea: Pick<Idea, 'title' | 'description'>, results: WebResearchResult[]): WebResearchResult[] {
  const ideaTerms = new Set(researchTerms(`${idea.title} ${idea.description}`));
  const seenHosts = new Set<string>();
  return results
    .filter((result) => {
      const titleTerms = new Set(researchTerms(result.title));
      const contentTerms = new Set(researchTerms(result.content));
      const titleHits = [...ideaTerms].filter((term) => titleTerms.has(term)).length;
      const totalHits = [...ideaTerms].filter((term) => titleTerms.has(term) || contentTerms.has(term)).length;
      if ((titleHits < 1 || totalHits < 2) && totalHits < 3) return false;
      if (result.content.trim().length < 40) return false;
      if (!URL.canParse(result.url)) return false;
      const host = new URL(result.url).hostname.replace(/^www\./, '');
      if (seenHosts.has(host)) return false;
      seenHosts.add(host);
      return true;
    })
    .slice(0, 2);
}

function explored(previous: Suggestion[], trigger: BrainstormActionInput['trigger'], target: Idea, version: string): boolean {
  return previous.some(
    (suggestion) =>
      suggestion.kind === 'brainstorm_analysis' &&
      suggestion.brainstormTrigger === trigger &&
      suggestion.ideaId === target.id &&
      suggestion.title.startsWith('Brainstorm checked:') &&
      suggestion.createdAt >= version,
  );
}

async function markExplored(
  projectId: string,
  trigger: BrainstormActionInput['trigger'],
  target: Idea,
  version: string,
  mode: BrainstormMode,
) {
  await createSuggestion(
    projectId,
    {
      kind: 'brainstorm_analysis',
      status: 'dismissed',
      title: `Brainstorm checked: ${target.title}`,
      proposal: mode,
      reason: 'This problem state has been assessed so the board does not repeat suggestions on every visit.',
      ideaId: target.id,
      brainstormTrigger: trigger,
    },
    idFor(projectId, target.id, trigger, version, 'explored'),
  );
}

async function suggestDirection(
  projectId: string,
  ai: AiProvider,
  mode: BrainstormMode,
  trigger: BrainstormActionInput['trigger'],
  problem: Idea | null,
  cards: Idea[],
  previous: Suggestion[],
  target: Idea,
  version: string,
): Promise<Suggestion[]> {
  if (
    previous.some(
      (suggestion) =>
        suggestion.status === 'pending' && suggestion.kind === 'idea' && suggestion.brainstormTrigger && suggestion.createdAt >= version,
    )
  )
    return [];
  const output = await ai.facilitateBrainstorm({ trigger, problem, ideas: cards, research: [], mode });
  const existing = new Set([
    ...cards.map((idea) => idea.title.trim().toLowerCase()),
    ...previous.filter((suggestion) => suggestion.kind === 'idea').map((suggestion) => suggestion.ideaDraft?.title.trim().toLowerCase()),
  ]);
  const draft = output.ideas.find((candidate) => candidate.draft.title.trim() && !existing.has(candidate.draft.title.trim().toLowerCase()));
  if (!draft) return [];
  let researchSources: { title: string; url: string }[] = [];
  if (mode === 'product' && trigger === 'problem_created' && hasResearchableDetail(draft.draft)) {
    const search = await researchWeb(`${draft.draft.title} ${draft.draft.description.slice(0, 160)} similar products alternatives`);
    if (search.configured && !search.error)
      researchSources = similarWebResults(draft.draft, search.results).map(({ title, url }) => ({ title, url }));
  }
  return [
    await createSuggestion(
      projectId,
      {
        kind: 'idea',
        title: `Brainstorm direction: ${draft.draft.title}`,
        reason: `${draft.reason}${ai.isMock ? ' (Mock AI)' : ''}`,
        ideaDraft: draft.draft,
        originIdeaId: target.kind === 'idea' ? target.id : null,
        researchSources,
        brainstormTrigger: trigger,
      },
      idFor(projectId, target.id, trigger, version, draft.draft.title),
    ),
  ];
}

function checked(previous: Suggestion[], trigger: BrainstormActionInput['trigger'], ideaId: string, version: string): boolean {
  return previous.some(
    (suggestion) =>
      suggestion.kind === 'brainstorm_analysis' &&
      suggestion.brainstormTrigger === trigger &&
      suggestion.ideaId === ideaId &&
      /^(Similar work:|Research checked:)/.test(suggestion.title) &&
      suggestion.createdAt >= version,
  );
}

/** Search snippets are evidence, not card copy. Reject model output that repeats a substantial passage. */
export function isCopiedResearch(summary: string, snippet: string): boolean {
  const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const summaryWords = words(summary);
  const sourceWords = words(snippet);
  if (summaryWords.length < 5) return true;
  if (sourceWords.join(' ').includes(summaryWords.join(' '))) return true;
  const source = sourceWords.join(' ');
  return summaryWords.some(
    (_, index) => index + 8 <= summaryWords.length && source.includes(summaryWords.slice(index, index + 8).join(' ')),
  );
}

async function researchSimilarWork(
  projectId: string,
  ai: AiProvider,
  trigger: BrainstormActionInput['trigger'],
  idea: Idea,
  previous: Suggestion[],
): Promise<Suggestion[]> {
  if (!hasResearchableDetail(idea)) return [];
  const version = trigger === 'idea_updated' ? (idea.significantChangeAt ?? idea.updatedAt) : idea.createdAt;
  if (trigger !== 'manual' && checked(previous, trigger, idea.id, version)) return [];

  const search = await researchWeb(`${idea.title} ${idea.description.slice(0, 160)} similar products alternatives`);
  if (!search.configured) {
    if (trigger === 'manual') throw new ConflictError('Web research is not configured. Set TAVILY_API_KEY to search similar work.');
    return [];
  }
  if (search.error) {
    if (trigger === 'manual') throw new Error('Web research is temporarily unavailable. Please try again.');
    return [];
  }

  const knownUrls = new Set(
    previous.filter((item) => item.ideaId === idea.id).flatMap((item) => item.researchSources.map((source) => source.url)),
  );
  const results = similarWebResults(idea, search.results).filter((result) => !knownUrls.has(result.url));
  let summaries: Awaited<ReturnType<AiProvider['summarizeResearch']>> = [];
  if (results.length) {
    try {
      summaries = await ai.summarizeResearch({ idea, results });
    } catch (error) {
      console.error('Summarizing brainstorm research failed', error);
    }
  }
  const summaryByUrl = new Map(
    summaries
      .filter((item) => {
        const result = results.find((candidate) => candidate.url === item.url);
        return result && item.summary.trim() && !isCopiedResearch(item.summary, result.content);
      })
      .map((item) => [item.url, item.summary.replace(/\s+/g, ' ').trim().slice(0, 240)]),
  );
  if (!summaryByUrl.size) {
    // A hidden check record prevents the same board state from searching again on every visit.
    await createSuggestion(
      projectId,
      {
        kind: 'brainstorm_analysis',
        status: 'dismissed',
        title: `Research checked: ${idea.title}`,
        reason: 'No new web source had a reliable, distinct summary for this idea.',
        ideaId: idea.id,
        brainstormTrigger: trigger,
      },
      idFor(projectId, idea.id, trigger, version, 'empty'),
    );
    return [];
  }

  return Promise.all(
    results
      .filter((result) => summaryByUrl.has(result.url))
      .map((result) =>
        createSuggestion(
          projectId,
          {
            kind: 'brainstorm_analysis',
            title: `Similar work: ${result.title}`,
            proposal: summaryByUrl.get(result.url)!,
            reason: `${RESEARCH_SUMMARY_REASON} found while searching for “${idea.title}”${ai.isMock ? ' (mock AI)' : ''}. Check the source before using it for your project.`,
            researchSources: [{ title: result.title, url: result.url }],
            ideaId: idea.id,
            brainstormTrigger: trigger,
          },
          idFor(projectId, idea.id, result.url),
        ),
      ),
  );
}

/** Upgrade an older pending research card whose proposal still contains the raw search snippet. */
export async function summarizeExistingResearch(projectId: string, suggestionId: string): Promise<Suggestion> {
  const suggestion = await getSuggestion(projectId, suggestionId);
  if (suggestion.status !== 'pending' || suggestion.kind !== 'brainstorm_analysis' || !suggestion.title.startsWith('Similar work:'))
    throw new ConflictError('This is not a pending research example');
  if (suggestion.reason.startsWith(RESEARCH_SUMMARY_REASON)) return suggestion;
  const source = suggestion.researchSources[0];
  if (!suggestion.ideaId || !source || !suggestion.proposal) throw new ConflictError('This research example has no source to summarize');
  const idea = await getIdea(projectId, suggestion.ideaId);
  const ai = getAiProvider();
  const [summary] = (
    await ai.summarizeResearch({
      idea,
      results: [{ title: source.title, url: source.url, content: suggestion.proposal }],
    })
  ).filter((item) => item.url === source.url && item.summary.trim() && !isCopiedResearch(item.summary, suggestion.proposal!));
  if (!summary) throw new ConflictError('The source did not provide enough detail for a reliable summary');
  return updateSuggestionResearchSummary(
    projectId,
    suggestionId,
    summary.summary.replace(/\s+/g, ' ').trim().slice(0, 240),
    `${RESEARCH_SUMMARY_REASON} for “${idea.title}”${ai.isMock ? ' (mock AI)' : ''}. Check the source for details.`,
  );
}

/** Assess the team's goal before choosing sourced examples or context-based idea drafts. */
export async function runBrainstormAction(projectId: string, input: BrainstormActionInput): Promise<Suggestion[]> {
  const requested = input.ideaId ? await getIdea(projectId, input.ideaId) : null;
  const problem = await getTopic(projectId, input.topicId ?? (requested?.kind === 'problem' ? requested.id : requested?.topicId));
  if (requested && requested.id !== problem.id && requested.topicId !== problem.id)
    throw new ConflictError('This idea belongs to another topic');
  const preparing = input.trigger === 'problem_created' || (input.trigger === 'manual' && (!requested || requested.kind === 'problem'));
  const key = [projectId, problem.id, problem.boardVersion, preparing ? 'prepare' : `${input.trigger}:${requested?.id ?? ''}`].join(':');
  const running = runningActions.get(key);
  if (running) return running;
  const operation = brainstormScope
    .run({ projectId, topicId: problem.id, version: problem.boardVersion }, () => runTopicAction(projectId, input, problem, requested))
    .finally(() => runningActions.delete(key));
  runningActions.set(key, operation);
  return operation;
}

async function prepareTopic(projectId: string, problem: Idea, previous: Suggestion[], manual: boolean): Promise<Suggestion[]> {
  if (!manual && previous.some((item) => item.ideaId === problem.id && item.title.startsWith('Brainstorm checked:'))) return [];
  const ai = getAiProvider();
  let mode: BrainstormMode = 'unclear';
  let aiFailure: string | null = null;
  const recordFailure = (error: unknown) => {
    console.error('Brainstorm preparation AI unavailable', error);
    aiFailure =
      error instanceof AiRequestError && error.status === 429
        ? 'The AI service has reached its usage limit. Retry Research again after the provider limit resets.'
        : 'AI guidance is temporarily unavailable. Retry Research again later.';
  };
  try {
    mode = await ai.classifyBrainstorm({ problem, ideas: [] });
  } catch (error) {
    recordFailure(error);
  }
  const search = await researchWeb(`${problem.title} ${problem.description.slice(0, 160)} research approaches`);
  const results = search.error ? [] : similarWebResults(problem, search.results);
  let summaries: { url: string; summary: string }[] = [];
  if (results.length && !aiFailure) {
    try {
      summaries = await ai.summarizeResearch({ idea: problem, results });
    } catch (error) {
      recordFailure(error);
    }
  }
  const unsummarized = !!aiFailure;
  if (unsummarized)
    summaries = results.map((source) => ({
      url: source.url,
      summary: 'Source found for this topic. An AI summary is unavailable; open the source to assess its relevance.',
    }));
  const created: Suggestion[] = [];
  for (const summary of summaries) {
    const source = results.find((item) => item.url === summary.url);
    if (!source || (!unsummarized && isCopiedResearch(summary.summary, source.content))) continue;
    const sourceId = idFor(projectId, problem.id, String(problem.boardVersion), source.url);
    const reason = unsummarized
      ? 'Web source found; AI summary unavailable. Review the linked source directly.'
      : `${RESEARCH_SUMMARY_REASON} for “${problem.title}”${ai.isMock ? ' (mock AI)' : ''}. Review the source.`;
    const existing = previous.find((item) => item.id === sourceId);
    if (!unsummarized && existing?.status === 'pending' && existing.reason.includes('AI summary unavailable')) {
      created.push(await updateSuggestionResearchSummary(projectId, existing.id, summary.summary, reason));
      continue;
    }
    created.push(
      await createSuggestion(
        projectId,
        {
          kind: 'brainstorm_analysis',
          title: `Topic research: ${source.title}`,
          proposal: summary.summary.replace(/\s+/g, ' ').trim().slice(0, 400),
          reason,
          ideaId: problem.id,
          brainstormTrigger: 'problem_created',
          researchSources: [{ title: source.title, url: source.url }],
        },
        sourceId,
      ),
    );
  }
  let strategyDescription = '';
  if (!aiFailure) {
    try {
      const output = await ai.facilitateBrainstorm({ trigger: 'problem_created', problem, ideas: [], research: results, mode });
      strategyDescription = output.strategy ? JSON.stringify(output.strategy, null, 2) : output.summary.trim();
    } catch (error) {
      recordFailure(error);
    }
  }
  if (strategyDescription)
    created.push(
      await createSuggestion(
        projectId,
        {
          kind: 'idea',
          title: `Strategy: ${problem.title}`,
          reason: `A starting approach for this topic${ai.isMock ? ' (mock AI)' : ''}. Review before saving.`,
          ideaDraft: { title: `Approach: ${problem.title}`.slice(0, 80), description: strategyDescription, theme: 'Strategy' },
          brainstormTrigger: 'problem_created',
          researchSources: results.map(({ title, url }) => ({ title, url })),
        },
        idFor(projectId, problem.id, String(problem.boardVersion), 'strategy-json', manual ? strategyDescription : 'initial'),
      ),
    );
  created.push(
    await createSuggestion(projectId, {
      kind: 'brainstorm_analysis',
      title: 'Topic research status',
      proposal: aiFailure
        ? `${aiFailure} ${results.length ? 'Web sources are available to review.' : search.error ? 'Web search is also temporarily unavailable.' : !search.configured ? 'Web research is not configured.' : 'No matching web sources were found.'} You can still add ideas.`
        : !search.configured
          ? 'Web research is not configured. These strategies use the topic context. You can add ideas or retry research later.'
          : search.error
            ? 'Web research is temporarily unavailable. You can add ideas or retry research.'
            : created.some((item) => item.researchSources.length)
              ? 'Research is ready. Review the sources and strategy, then add your ideas.'
              : 'No reliable matching sources were found. Review the strategy, add context to your topic, or try research again.',
      reason: 'Research availability and next step for this topic.',
      ideaId: problem.id,
      brainstormTrigger: 'problem_created',
    }),
  );
  await markExplored(projectId, 'problem_created', problem, problem.updatedAt, mode);
  return created;
}

async function runTopicAction(
  projectId: string,
  input: BrainstormActionInput,
  problem: Idea,
  requested: Idea | null,
): Promise<Suggestion[]> {
  const ideas = (await listIdeas(projectId)).filter((idea) => idea.id === problem.id || idea.topicId === problem.id);
  const cards = ideas.filter((idea) => idea.kind === 'idea');
  const previous = (await listSuggestions(projectId)).filter((item) => item.topicId === problem.id);

  if (input.trigger === 'problem_created' || (input.trigger === 'manual' && (!requested || requested.kind === 'problem')))
    return prepareTopic(projectId, problem, previous, input.trigger === 'manual');

  if (EXPLORATION_TRIGGERS.has(input.trigger)) {
    const target = requested ?? cards.find(hasResearchableDetail) ?? problem;
    if (!target || !hasResearchableDetail(target)) return [];
    if (input.trigger === 'idea_updated' && !target.significantChangeAt) return [];
    const version =
      input.trigger === 'idea_updated'
        ? (target.significantChangeAt ?? target.updatedAt)
        : input.trigger === 'first_idea'
          ? target.createdAt
          : target.updatedAt;
    if (input.trigger !== 'manual' && explored(previous, input.trigger, target, version)) return [];
    const ai = getAiProvider();
    const mode = await ai.classifyBrainstorm({ problem, ideas: target.kind === 'idea' ? [target] : cards });
    if (mode === 'unclear') {
      if (input.trigger !== 'manual') await markExplored(projectId, input.trigger, target, version, mode);
      return [];
    }
    const drafts =
      mode === 'non_product' || input.trigger === 'manual' || input.trigger === 'first_idea'
        ? await suggestDirection(
            projectId,
            ai,
            mode,
            input.trigger,
            problem,
            target.kind === 'idea' ? [target, ...cards.filter((idea) => idea.id !== target.id)] : cards,
            previous,
            target,
            version,
          )
        : [];
    const research =
      mode === 'product' && target.kind === 'idea' ? await researchSimilarWork(projectId, ai, input.trigger, target, previous) : [];
    if (input.trigger !== 'manual') await markExplored(projectId, input.trigger, target, version, mode);
    return [...drafts, ...research];
  }

  if (input.trigger !== 'idea_approved') return [];
  const target = requested ?? cards.find((idea) => idea.approved);
  if (!target?.approved) throw new ConflictError('Approve an idea first');
  const version = target.updatedAt ?? target.createdAt;
  const existing = previous.find(
    (suggestion) =>
      suggestion.kind === 'action_items' &&
      suggestion.brainstormTrigger === 'idea_approved' &&
      suggestion.ideaId === target.id &&
      suggestion.createdAt >= version,
  );
  if (existing) return [existing];

  const ai = getAiProvider();
  const classified = await ai.classifyBrainstorm({ problem, ideas: [target] });
  const mode = classified === 'unclear' ? (target.theme === 'Product' ? 'product' : 'non_product') : classified;
  // A simple choice can be selected without turning dinner, a venue, or an activity into project tasks.
  if (target.theme === 'Option' && mode === 'non_product') return [];
  const result = await ai.facilitateBrainstorm({
    trigger: 'idea_approved',
    problem,
    ideas: cards.filter((idea) => idea.approved),
    research: [],
    mode,
  });
  if (!result.tasks.length) return [];
  return [
    await createSuggestion(projectId, {
      kind: 'action_items',
      title: `${mode === 'non_product' ? 'Next steps' : 'MVP tasks'} for ${target.title}`,
      reason: `Proposed after “${target.title}” was approved${ai.isMock ? ' (mock AI)' : ''}. Review each task before adding it.`,
      items: result.tasks,
      ideaId: target.id,
      brainstormTrigger: 'idea_approved',
    }),
  ];
}
