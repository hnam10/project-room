import { useState } from 'react';
import { RESEARCH_SUMMARY_REASON, type Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import { IdeaDetails } from './IdeaDetails';

export function BrainstormAnalysisCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, applyRecord, reload } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [busy, setBusy] = useState(false);
  const act = async (approve: boolean) => {
    setBusy(true);
    try {
      const updated = approve
        ? await api.approveSuggestion(projectId, suggestion.id)
        : await api.dismissSuggestion(projectId, suggestion.id);
      applyRecord('suggestion', updated);
      if (approve) reload();
      toast(approve ? 'Research source saved' : 'Web example dismissed');
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };
  const source = suggestion.researchSources[0];
  if (!source) return null;
  const hasSummary = suggestion.reason.startsWith(RESEARCH_SUMMARY_REASON) && !!suggestion.proposal;
  const summarize = async () => {
    setBusy(true);
    try {
      applyRecord('suggestion', await api.summarizeResearchSuggestion(projectId, suggestion.id));
      toast('Research example summarized');
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="brainstorm-analysis">
      <strong>
        {suggestion.title.startsWith('Topic research:')
          ? suggestion.title.slice('Topic research:'.length).trim()
          : 'Research · related idea'}
      </strong>
      {hasSummary ? (
        <IdeaDetails description={suggestion.proposal ?? ''} title={suggestion.title} previewLength={120} />
      ) : (
        <p>Summary not available for this earlier result.</p>
      )}
      <small>{suggestion.reason}</small>
      <a className="brainstorm-source-link" href={source.url} target="_blank" rel="noreferrer">
        Source: {source.title}
      </a>
      <div className="action-buttons">
        {!hasSummary && (
          <button className="btn research-btn sm" disabled={busy} onClick={() => void summarize()}>
            Summarize source
          </button>
        )}
        <button className="btn research-btn sm" disabled={busy} onClick={() => void act(true)}>
          Save source
        </button>
        <button className="btn sm" disabled={busy} onClick={() => void act(false)}>
          Dismiss
        </button>
      </div>
    </article>
  );
}
