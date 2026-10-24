import { deleteIdea, getIdea } from '../repositories/ideas.js';
import { dismissPendingSuggestionsForIdea } from '../repositories/suggestions.js';
import { resetTopic } from '../repositories/brainstorm-topics.js';

export async function removeIdea(projectId: string, ideaId: string, memberId: string): Promise<void> {
  const idea = await getIdea(projectId, ideaId);
  if (idea.kind === 'problem') {
    await resetTopic(projectId, ideaId, 'delete');
    return;
  }
  await dismissPendingSuggestionsForIdea(projectId, ideaId, memberId);
  await deleteIdea(projectId, ideaId);
}
