import type { Suggestion } from '@project-room/shared';

/** The AI's reason plus the quoted words (and where they came from). */
export function SuggestionWhy({ suggestion }: { suggestion: Suggestion }) {
  return (
    <div className="action-why">
      <span>{suggestion.reason}</span>
      {suggestion.quote && (
        <q>
          {suggestion.quote}
          {suggestion.cite && <cite> — {suggestion.cite}</cite>}
        </q>
      )}
    </div>
  );
}
