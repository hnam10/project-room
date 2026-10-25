import { useState } from 'react';
import type { Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon, type IconName } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSession } from '../../state/session';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { BrainstormAnalysisCard } from '../brainstorm/BrainstormAnalysisCard';
import { isCurrentWebSuggestion } from '../brainstorm/similarWebSuggestion';
import { BrainstormSuggestionCard } from '../brainstorm/BrainstormSuggestionCard';
import { BrainstormTopicSuggestionCard } from '../brainstorm/BrainstormTopicSuggestionCard';

const KINDS: Record<'decision' | 'risk', { label: string; icon: IconName; color: string }> = {
  decision: { label: 'Decision', icon: 'flag', color: 'var(--accent)' },
  risk: { label: 'Deadline risk', icon: 'alert', color: '#dc4b4b' },
};

/** The AI recommendations panel: proactive suggestions with their reasons, awaiting review. */
export function AssistantTab({ onOpenDecisions }: { onOpenDecisions: () => void }) {
  const { me } = useSession();
  const { ideas, suggestions } = useSnapshot();
  const pending = suggestions.filter(
    (s) =>
      s.status === 'pending' &&
      (s.kind === 'decision' ||
        s.kind === 'risk' ||
        s.kind === 'idea' ||
        s.kind === 'brainstorm_topic' ||
        isCurrentWebSuggestion(s, ideas, suggestions)),
  );

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
            <InsightCard key={s.id} suggestion={s} onOpenDecisions={onOpenDecisions} />
          ),
        )
      ) : (
        <div className="empty-state">You’re all caught up. New suggestions appear here as the team talks.</div>
      )}
    </div>
  );
}

function InsightCard({ suggestion, onOpenDecisions }: { suggestion: Suggestion; onOpenDecisions: () => void }) {
  const { projectId, members, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);
  const kind = KINDS[suggestion.kind as 'decision' | 'risk'];

  const act = async (call: () => Promise<Suggestion>, message: string, after?: () => void) => {
    setBusy(true);
    try {
      applyRecord('suggestion', await call());
      toast(message);
      after?.();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="insight">
      <span className="insight-type" style={{ '--t': kind.color } as React.CSSProperties}>
        <Icon name={kind.icon} />
        {kind.label}
      </span>
      <h3>{suggestion.title}</h3>
      {suggestion.outcome && (
        <p>
          <strong>Settled on:</strong> {suggestion.outcome}
        </p>
      )}
      <p>
        <strong>Why:</strong> {suggestion.reason}
      </p>
      {suggestion.quote && (
        <blockquote>
          “{suggestion.quote}”{suggestion.cite && <cite>{suggestion.cite}</cite>}
        </blockquote>
      )}
      <div className="action-buttons">
        {suggestion.kind === 'decision' ? (
          <button
            className="btn primary sm"
            disabled={busy}
            onClick={() =>
              act(
                () => api.approveSuggestion(projectId, suggestion.id),
                suggestion.outcome ? 'Recorded as a decision' : 'Logged as an open decision',
                onOpenDecisions,
              )
            }
          >
            {suggestion.outcome ? 'Record decision' : 'Log as open decision'}
          </button>
        ) : (
          <>
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
          </>
        )}
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
