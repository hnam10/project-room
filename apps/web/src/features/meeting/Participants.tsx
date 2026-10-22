import type { Meeting } from '@project-room/shared';
import { AI_AUTHOR } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { useSession } from '../../state/session';
import { useWorkspace } from '../../state/workspace';
import { useSpeaking } from './useSpeaking';

function SpeakingDot({ stream }: { stream: MediaStream | null }) {
  const speaking = useSpeaking(stream);
  return <span className={`speaking-dot${speaking ? ' on' : ''}`} role="img" aria-label={speaking ? 'Speaking' : 'Silent'} />;
}

interface Props {
  meeting: Meeting;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  muted: boolean;
}

export function Participants({ meeting, localStream, remoteStreams, muted }: Props) {
  const { members } = useWorkspace();
  const { memberId } = useSession();
  return (
    <ul className="meeting-people">
      {meeting.participantIds.map((id) => (
        <li key={id}>
          <Avatar member={members.get(id)} />
          <span>{members.get(id)?.name ?? 'Unknown'}</span>
          {id === memberId && muted ? (
            <span className="muted-tag">muted</span>
          ) : (
            <SpeakingDot stream={id === memberId ? localStream : (remoteStreams.get(id) ?? null)} />
          )}
        </li>
      ))}
      <li className="ai">
        <Avatar id={AI_AUTHOR} />
        <span>Claude · reads only</span>
      </li>
    </ul>
  );
}
