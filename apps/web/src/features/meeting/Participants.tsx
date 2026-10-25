import type { Meeting } from '@project-room/shared';
import { AI_AUTHOR } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useSession } from '../../state/session';
import { useWorkspace } from '../../state/workspace';
import { useSpeaking } from './useSpeaking';

function Tile({ id, stream, muted }: { id: string; stream: MediaStream | null; muted: boolean }) {
  const { members } = useWorkspace();
  const speaking = useSpeaking(muted ? null : stream);
  const name = members.get(id)?.name ?? 'Unknown';
  return (
    <li className={`meeting-tile${speaking ? ' speaking' : ''}`} aria-label={`${name}${muted ? ', muted' : speaking ? ', speaking' : ''}`}>
      <Avatar member={members.get(id)} />
      <span className="tile-name">{name}</span>
      {muted && (
        <span className="tile-state" title="Muted">
          <Icon name="micOff" />
        </span>
      )}
    </li>
  );
}

interface Props {
  meeting: Meeting;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  muted: boolean;
}

export function Participants({ meeting, localStream, remoteStreams, muted }: Props) {
  const { memberId } = useSession();
  return (
    <ul className="meeting-people">
      {meeting.participantIds.map((id) => (
        <Tile key={id} id={id} stream={id === memberId ? localStream : (remoteStreams.get(id) ?? null)} muted={id === memberId && muted} />
      ))}
      <li className={`meeting-tile ai${meeting.aiEnabled ? '' : ' off'}`}>
        <Avatar id={AI_AUTHOR} />
        <span className="tile-name">AI</span>
        <span className="tile-sub">{meeting.aiEnabled ? 'Listening · reads only' : 'Removed'}</span>
      </li>
    </ul>
  );
}
