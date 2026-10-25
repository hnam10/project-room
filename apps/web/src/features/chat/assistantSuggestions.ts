import type { Idea, Suggestion } from '@project-room/shared';
import { isCurrentWebSuggestion } from '../brainstorm/similarWebSuggestion';

/** Keep the tab badge and its review list in sync when chat produces a new idea draft. */
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
