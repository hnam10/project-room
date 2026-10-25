import { Router } from 'express';
import { suggestionApproveSchema, suggestionUpdateSchema } from '@project-room/shared';
import { ConflictError } from '../../db/records.js';
import { getSuggestion, listSuggestions, updateSuggestionDrafts, updateSuggestionItems } from '../../repositories/suggestions.js';
import { approveSuggestion, dismissSuggestion } from '../../services/suggestions.js';
import { summarizeExistingResearch } from '../../services/brainstorm.js';
import { ctx } from '../context.js';

export const suggestionsRouter = Router({ mergeParams: true });

suggestionsRouter.get('/', async (_req, res) => {
  res.json(await listSuggestions(ctx(res).project.id));
});

/** Edit the proposed action items before approving them. */
suggestionsRouter.patch('/:suggestionId', async (req, res) => {
  const { project, members } = ctx(res);
  const suggestion = await getSuggestion(project.id, req.params.suggestionId);
  if (suggestion.status !== 'pending') throw new ConflictError(`Suggestion is already ${suggestion.status}`);
  const { items, ideaDraft, pollDraft } = suggestionUpdateSchema.parse(req.body);
  if ((ideaDraft && suggestion.kind !== 'idea' && suggestion.kind !== 'brainstorm_topic') || (pollDraft && suggestion.kind !== 'poll')) {
    res.status(400).json({ error: 'Draft does not match the suggestion kind' });
    return;
  }
  let updated = suggestion;
  if (items) {
    if (items.some((i) => i.assigneeId && !members.has(i.assigneeId))) {
      res.status(400).json({ error: 'Assignee is not a member of this project' });
      return;
    }
    updated = await updateSuggestionItems(suggestion.id, items);
  }
  if (ideaDraft || pollDraft) updated = await updateSuggestionDrafts(suggestion.id, { ideaDraft, pollDraft });
  res.json(updated);
});

/** Validates member approval options before dispatching the suggestion service. */
suggestionsRouter.post('/:suggestionId/approve', async (req, res) => {
  const { project, memberId, members } = ctx(res);
  const options = suggestionApproveSchema.parse(req.body ?? {});
  const { assigneeId } = options;
  if (assigneeId && !members.has(assigneeId)) {
    res.status(400).json({ error: 'Assignee is not a member of this project' });
    return;
  }
  res.json(await approveSuggestion(project.id, req.params.suggestionId, memberId, options));
});

suggestionsRouter.post('/:suggestionId/dismiss', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await dismissSuggestion(project.id, req.params.suggestionId, memberId));
});

suggestionsRouter.post('/:suggestionId/summarize-research', async (req, res) => {
  res.json(await summarizeExistingResearch(ctx(res).project.id, req.params.suggestionId));
});
