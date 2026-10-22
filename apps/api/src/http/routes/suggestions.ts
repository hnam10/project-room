import { Router } from 'express';
import { z } from 'zod';
import { suggestionUpdateSchema } from '@project-room/shared';
import { ConflictError } from '../../db/records.js';
import { getSuggestion, listSuggestions, updateSuggestionDrafts, updateSuggestionItems } from '../../repositories/suggestions.js';
import { approveSuggestion, dismissSuggestion } from '../../services/suggestions.js';
import { ctx } from '../context.js';

export const suggestionsRouter = Router({ mergeParams: true });

const approveSchema = z.object({ assigneeId: z.string().min(1).max(64).nullable().optional() });

suggestionsRouter.get('/', async (_req, res) => {
  res.json(await listSuggestions(ctx(res).project.id));
});

/** Edit the proposed action items before approving them. */
suggestionsRouter.patch('/:suggestionId', async (req, res) => {
  const { project, members } = ctx(res);
  const suggestion = await getSuggestion(project.id, req.params.suggestionId);
  if (suggestion.status !== 'pending') throw new ConflictError(`Suggestion is already ${suggestion.status}`);
  const { items, ideaDraft, pollDraft } = suggestionUpdateSchema.parse(req.body);
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

suggestionsRouter.post('/:suggestionId/approve', async (req, res) => {
  const { project, memberId, members } = ctx(res);
  const { assigneeId } = approveSchema.parse(req.body ?? {});
  if (assigneeId && !members.has(assigneeId)) {
    res.status(400).json({ error: 'Assignee is not a member of this project' });
    return;
  }
  res.json(await approveSuggestion(project.id, req.params.suggestionId, memberId, { assigneeId }));
});

suggestionsRouter.post('/:suggestionId/dismiss', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await dismissSuggestion(project.id, req.params.suggestionId, memberId));
});
