import type { Idea, Member } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';

export const PAPER: Record<string, string> = { Product: '#fdf1c4', Engagement: '#f6def8', Platform: '#dcefff' };

export function IdeaCard(props: { idea: Idea; author: Member | undefined; voted: boolean; onVote: () => void; onConvert: () => void }) {
  const { idea } = props;
  return (
    <article className="idea" style={{ '--paper': PAPER[idea.theme] ?? PAPER.Product } as React.CSSProperties}>
      {idea.taskId ? (
        <span className="idea-converted">✓ On the board</span>
      ) : (
        <button className="idea-convert" onClick={props.onConvert}>
          <Icon name="arrow" />
          Make task
        </button>
      )}
      <h3>{idea.title}</h3>
      <p>{idea.description}</p>
      <div className="idea-foot">
        <Avatar member={props.author} />
        {props.author?.name ?? 'Former member'}
        <span className="idea-meta">
          <button className={props.voted ? 'voted' : ''} onClick={props.onVote} aria-pressed={props.voted} aria-label={`Vote for ${idea.title}`}>
            <Icon name="heart" />
            {idea.voterIds.length}
          </button>
        </span>
      </div>
    </article>
  );
}
