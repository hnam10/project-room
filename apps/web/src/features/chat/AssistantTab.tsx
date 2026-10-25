import { useState } from 'react';
import type { Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSession } from '../../state/session';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { BrainstormAnalysisCard } from '../brainstorm/BrainstormAnalysisCard';
import { pendingAssistantSuggestions } from './assistantSuggestions';
import { BrainstormSuggestionCard } from '../brainstorm/BrainstormSuggestionCard';
import { BrainstormTopicSuggestionCard } from '../brainstorm/BrainstormTopicSuggestionCard';

/** The AI recommendations panel: proactive suggestions with their reasons, awaiting review. */
export function AssistantTab() {
  const { me } = useSession();
  const { ideas, suggestions } = useSnapshot();
  const pending = pendingAssistantSuggestions(suggestions, ideas);

  return (
    <div className="list-pad">
      {me?.ai.isMock && (
        <div className="mock-note">
          <Icon name="sparkle" />
          Mock AI — set OPENAI_API_KEY or NEBIUS_API_KEY for a real model. Nothing changes until you confirm.
        </div>
      )}
      {pending.length ? (
        pending.map((s) =>
          s.kind === 'idea' ? (
            <BrainstormSuggestionCard key={s.id} suggestion={s} />
          ) : s.kind === 'brainstorm_topic' ? (
            <BrainstormTopicSuggestionCard key={s.id} suggestion={s} />
          ) : s.kind === 'brainstorm_analysis' ? (
            <BrainstormAnalysisCard key={s.id} suggestion={s} />
          ) : (
            <RiskCard key={s.id} suggestion={s} />
          ),
        )
      ) : (
        <div className="empty-state">You’re all caught up. New suggestions appear here as the team talks.</div>
      )}
    </div>
  );
}

/** A task the AI thinks may slip: approving means choosing its owner. */
function RiskCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, members, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (call: () => Promise<Suggestion>, message: string) => {
    setBusy(true);
    try {
      applyRecord('suggestion', await call());
      toast(message);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="insight">
      <span className="insight-type" style={{ '--t': '#dc4b4b' } as React.CSSProperties}>
        <Icon name="alert" />
        Deadline risk
      </span>
      <h3>{suggestion.title}</h3>
      <p>
        <strong>Why:</strong> {suggestion.reason}
      </p>
      {suggestion.quote && (
        <blockquote>
          “{suggestion.quote}”{suggestion.cite && <cite>{suggestion.cite}</cite>}
        </blockquote>
      )}
      <div className="action-buttons">
        <select className="btn sm" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Choose an owner">
          <option value="">Choose owner…</option>
          {[...members.values()].map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          className="btn primary sm"
          disabled={busy || !assigneeId}
          onClick={() =>
            act(() => api.approveSuggestion(projectId, suggestion.id, { assigneeId }), `Assigned to ${members.get(assigneeId)?.name}`)
          }
        >
          Assign owner
        </button>
        <button
          className="btn sm"
          disabled={busy}
          onClick={() => act(() => api.dismissSuggestion(projectId, suggestion.id), 'Suggestion dismissed')}
        >
          Dismiss
        </button>
      </div>
    </article>
  );
}
