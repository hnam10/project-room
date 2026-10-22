import type { Dispatch, SetStateAction } from 'react';
import type { MeetingDetail, Poll } from '@project-room/shared';
import { meetingsApi } from '../../api/meetings';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { ActionItemsCard } from '../chat/ActionItemsCard';
import { PollCard } from '../polls/PollCard';
import { useSession } from '../../state/session';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { IdeaSuggestionCard } from './IdeaSuggestionCard';
import { PollSuggestionCard } from './PollSuggestionCard';

/** Right column of the meeting: Claude's pending suggestions for this meeting and its polls. */
export function MeetingAiPanel(props: {
  detail: MeetingDetail;
  joined: boolean;
  applyPoll: (poll: Poll) => void;
  setCurrent: Dispatch<SetStateAction<MeetingDetail | null>>;
}) {
  const { meeting, polls } = props.detail;
  const { projectId } = useWorkspace();
  const { me } = useSession();
  const { suggestions } = useSnapshot();
  const { toastError } = useFeedback();
  const pending = suggestions
    .filter((s) => s.meetingId === meeting.id && s.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shownPolls = polls.filter((p) => p.status === 'open' || meeting.status !== 'live');
  const live = meeting.status === 'live';

  const toggle = async () => {
    try {
      const m = await meetingsApi.setAi(projectId, meeting.id, !meeting.aiEnabled);
      props.setCurrent((prev) => (prev ? { ...prev, meeting: m } : prev));
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <h2>AI suggestions</h2>
      <div className="ai-panel">
        {me?.ai.isMock && (
          <div className="mock-note">
            <Icon name="sparkle" />
            Mock AI — no ANTHROPIC_API_KEY is set, so suggestions come from simple local rules. Nothing changes until you confirm.
          </div>
        )}
        {props.joined && live && (
          <button className="btn sm" onClick={() => void toggle()}>
            {meeting.aiEnabled ? 'Remove Claude' : 'Invite Claude'}
          </button>
        )}
        {shownPolls.map((p) => (
          <PollCard key={p.id} poll={p} onChange={props.applyPoll} />
        ))}
        {pending.map((s) =>
          s.kind === 'action_items' ? (
            <ActionItemsCard key={s.id} suggestion={s} />
          ) : s.kind === 'idea' ? (
            <IdeaSuggestionCard key={s.id} suggestion={s} />
          ) : s.kind === 'poll' ? (
            <PollSuggestionCard key={s.id} suggestion={s} />
          ) : null,
        )}
        {!pending.length && !shownPolls.length && (
          <p className="empty-state">
            {meeting.aiEnabled
              ? 'Claude is listening. Suggestions appear here as the team talks.'
              : 'Claude was removed from this meeting.'}
          </p>
        )}
      </div>
    </>
  );
}
