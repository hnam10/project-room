import { deleteIdea, getIdea } from '../repositories/ideas.js';
import { dismissPendingSuggestionsForIdea } from '../repositories/suggestions.js';

export async function removeIdea(projectId: string, ideaId: string, memberId: string): Promise<void> {
  await getIdea(projectId, ideaId);
  await dismissPendingSuggestionsForIdea(projectId, ideaId, memberId);
  await deleteIdea(projectId, ideaId);
}
