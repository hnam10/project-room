import type { Idea, Suggestion } from '@project-room/shared';

function isSimilarWebSuggestion(suggestion: Suggestion): boolean {
  return (
    suggestion.kind === 'brainstorm_analysis' &&
    /^(Similar work:|Topic research:)/.test(suggestion.title) &&
    suggestion.researchSources.length > 0
  );
}

function isCurrentWebSuggestion(suggestion: Suggestion, ideas: Idea[], suggestions: Suggestion[]): boolean {
  if (!isSimilarWebSuggestion(suggestion)) return false;
  if (suggestion.title.startsWith('Topic research:')) return true;
  const problem = ideas.find((idea) => idea.kind === 'problem' && idea.id === suggestion.topicId);
  if (!problem) return true;
  const modeCheck = suggestions.find(
    (item) =>
      item.ideaId === problem.id &&
      item.title.startsWith('Brainstorm checked:') &&
      item.proposal === 'non_product' &&
      item.createdAt >= problem.updatedAt,
  );
  return !modeCheck || suggestion.createdAt > modeCheck.createdAt;
}

/** Same filter as the web Assistant tab badge. */
export function pendingAssistantSuggestions(suggestions: Suggestion[], ideas: Idea[]): Suggestion[] {
  return suggestions.filter(
    (suggestion) =>
      suggestion.status === 'pending' &&
      (suggestion.kind === 'risk' ||
        suggestion.kind === 'idea' ||
        suggestion.kind === 'brainstorm_topic' ||
        isCurrentWebSuggestion(suggestion, ideas, suggestions)),
  );
}
