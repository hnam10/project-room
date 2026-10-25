import { AI_AUTHOR, type Member } from '@project-room/shared';
import { useClerkIdentity } from '../features/account/clerkIdentityContext';
import { Icon } from './Icon';

export function Avatar({ member, id }: { member?: Member | null; id?: string | null }) {
  const identity = useClerkIdentity(member?.id ?? id);
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
  const name = identity?.name ?? member.name;
  return (
    <span
      className={`avatar${identity?.imageUrl ? ' has-image' : ''}`}
      style={
        { '--c': member.color, '--avatar-image': identity?.imageUrl ? `url("${identity.imageUrl}")` : undefined } as React.CSSProperties
      }
      title={name}
      role="img"
      aria-label={name}
    >
      {!identity?.imageUrl && name[0]}
    </span>
  );
}
