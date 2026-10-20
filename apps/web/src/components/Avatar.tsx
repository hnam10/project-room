import { AI_AUTHOR, type Member } from '@project-room/shared';
import { Icon } from './Icon';

export function Avatar({ member, id }: { member?: Member | null; id?: string | null }) {
  if (id === AI_AUTHOR) {
    return (
      <span className="avatar ai">
        <Icon name="sparkle" />
      </span>
    );
  }
  if (!member) {
    return (
      <span className="avatar empty" title="Unassigned">
        ?
      </span>
    );
  }
  return (
    <span className="avatar" style={{ '--c': member.color } as React.CSSProperties} title={member.name}>
      {member.name[0]}
    </span>
  );
}
