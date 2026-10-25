import type { Suggestion, SuggestionApproveInput } from '@project-room/shared';
import { ConflictError } from '../db/records.js';
import { createDecision } from '../repositories/decisions.js';
import { attachIdeaResearch } from '../repositories/ideas.js';
import { approveBrainstormTopic, approveIdea, approveMeetingNotes, approvePoll } from './meeting-approvals.js';
import { getSuggestion, resolveSuggestion } from '../repositories/suggestions.js';
import { createTask, getTask, updateTask } from '../repositories/tasks.js';

// Approval is the only path from an AI suggestion to a real change in the project.

export async function approveSuggestion(
  projectId: string,
  suggestionId: string,
  memberId: string,
  options: SuggestionApproveInput = {},
): Promise<Suggestion> {
  const suggestion = await getSuggestion(projectId, suggestionId);
  if (suggestion.status !== 'pending') throw new ConflictError(`Suggestion is already ${suggestion.status}`);

  switch (suggestion.kind) {
    case 'action_items': {
      const chosen = suggestion.items.filter((i) => i.include);
      if (!chosen.length) throw new ConflictError('No action items are selected');
      const created = [];
      for (const item of chosen) {
        created.push(
          await createTask(
            projectId,
            { title: item.title, assigneeId: item.assigneeId, priority: item.priority, status: 'todo', label: 'feature', dueDate: null },
            { kind: 'suggestion', id: suggestion.id },
          ),
        );
      }
      return resolveSuggestion(
        suggestion.id,
        'approved',
        memberId,
        created.map((t) => t.id),
      );
    }
    case 'decision': {
      // Approving is the member's confirmation. A settled outcome is recorded as decided; otherwise the
      // question is logged as open until someone decides it.
      await createDecision(projectId, memberId, suggestion.proposal ?? suggestion.title, {
        outcome: suggestion.outcome,
        quote: suggestion.quote,
        reason: suggestion.outcome ? suggestion.reason : null,
      });
      return resolveSuggestion(suggestion.id, 'approved', memberId);
    }
    case 'risk': {
      // Assigning work to someone needs an explicit choice from the approving member.
      if (!suggestion.taskId) throw new ConflictError('Suggestion has no task to act on');
      if (!options.assigneeId) throw new ConflictError('Choose an assignee to approve this suggestion');
      await getTask(projectId, suggestion.taskId);
      await updateTask(projectId, suggestion.taskId, { assigneeId: options.assigneeId });
      return resolveSuggestion(suggestion.id, 'approved', memberId);
    }
    case 'idea':
      return approveIdea(projectId, suggestion, memberId, options.topicId);
    case 'brainstorm_topic':
      return approveBrainstormTopic(projectId, suggestion, memberId, options.replaceTopicId);
    case 'poll':
      return approvePoll(projectId, suggestion, memberId);
    case 'meeting_notes':
      return approveMeetingNotes(projectId, suggestion, memberId);
    case 'brainstorm_analysis': {
      if (suggestion.ideaId && suggestion.researchSources.length) {
        await attachIdeaResearch(projectId, suggestion.ideaId, suggestion.researchSources);
      }
      return resolveSuggestion(suggestion.id, 'approved', memberId);
    }
  }
}

export async function dismissSuggestion(projectId: string, suggestionId: string, memberId: string): Promise<Suggestion> {
  const suggestion = await getSuggestion(projectId, suggestionId);
  if (suggestion.status !== 'pending') throw new ConflictError(`Suggestion is already ${suggestion.status}`);
  return resolveSuggestion(suggestion.id, 'dismissed', memberId);
}
