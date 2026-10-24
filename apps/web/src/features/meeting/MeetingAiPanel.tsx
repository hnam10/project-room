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
import { BrainstormTopicSuggestionCard } from '../brainstorm/BrainstormTopicSuggestionCard';

/** Right column of the meeting: the AI's pending suggestions for this meeting and its polls. */
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
  const shownPolls = [...polls].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open'));
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
        {pending.some((suggestion) => suggestion.kind === 'brainstorm_topic') && (
          <p className="meeting-note-small">Review the topic when ready. Idea suggestions stay available in Brainstorm while you choose.</p>
        )}
        {me?.ai.isMock && (
          <div className="mock-note">
            <Icon name="sparkle" />
            Mock AI — no OPENAI_API_KEY is set, so suggestions come from simple local rules. Nothing changes until you confirm.
          </div>
        )}
        {props.joined && live && (
          <button className="btn sm" onClick={() => void toggle()}>
            {meeting.aiEnabled ? 'Remove AI' : 'Invite AI'}
          </button>
        )}
        {shownPolls.map((p) => (
          <PollCard key={p.id} poll={p} onChange={props.applyPoll} />
        ))}
        {pending.map((s) =>
          s.kind === 'action_items' ? (
            <ActionItemsCard key={s.id} suggestion={s} />
          ) : s.kind === 'brainstorm_topic' ? (
            <BrainstormTopicSuggestionCard key={s.id} suggestion={s} />
          ) : s.kind === 'idea' ? (
            <IdeaSuggestionCard key={s.id} suggestion={s} />
          ) : s.kind === 'poll' ? (
            <PollSuggestionCard key={s.id} suggestion={s} />
          ) : null,
        )}
        {!pending.length && !shownPolls.length && (
          <p className="empty-state">
            {meeting.aiEnabled
              ? 'The AI is listening. Suggestions appear here as the team talks.'
              : 'The AI was removed from this meeting.'}
          </p>
        )}
      </div>
    </>
  );
}
