import type { Meeting } from '@project-room/shared';
import { AI_AUTHOR } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { useWorkspace } from '../../state/workspace';

export function Participants({ meeting }: { meeting: Meeting }) {
  const { members } = useWorkspace();
  return (
    <ul className="meeting-people">
      {meeting.participantIds.map((id) => (
        <li key={id}>
          <Avatar member={members.get(id)} />
          <span>{members.get(id)?.name ?? 'Unknown'}</span>
        </li>
      ))}
      <li className="ai">
        <Avatar id={AI_AUTHOR} />
        <span>Claude · reads only</span>
      </li>
    </ul>
  );
}
