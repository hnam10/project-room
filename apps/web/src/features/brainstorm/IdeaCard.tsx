import type { Idea, Member } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IdeaDetails } from './IdeaDetails';
import { StrategyDetails } from './StrategyDetails';

export function IdeaCard(props: {
  idea: Idea;
  author: Member | undefined;
  voted: boolean;
  onVote: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
}) {
  const { idea } = props;
  return (
    <article className={`idea${idea.theme === 'Strategy' ? ' direction idea-strategy' : ''}`}>
      {idea.taskId && <span className="idea-converted">✓ On the board</span>}
      <h3>{idea.title}</h3>
      {idea.theme === 'Strategy' ? <StrategyDetails description={idea.description} /> : <IdeaDetails description={idea.description} />}
      {idea.researchStale && <span className="idea-stale">Research may be outdated after this edit</span>}
      <div className="idea-stage-actions">
        <button type="button" onClick={props.onEdit}>
          Edit
        </button>
        <button type="button" className="idea-delete" onClick={props.onDelete} aria-label={`Delete ${idea.title}`}>
          Delete
        </button>
        {idea.approved ? (
          <strong>Approved</strong>
        ) : (
          <button type="button" onClick={props.onApprove}>
            Approve
          </button>
        )}
      </div>
      {idea.researchSources?.length > 0 && (
        <div className="idea-sources">
          <strong>Sources:</strong>
          {idea.researchSources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          ))}
        </div>
      )}
      <div className="idea-foot">
        <Avatar member={props.author} />
        {props.author?.name ?? 'Former member'}
        <span className="idea-meta">
          <button
            className={props.voted ? 'voted' : ''}
            onClick={props.onVote}
            aria-pressed={props.voted}
            aria-label={`${props.voted ? 'Remove heart from' : 'Heart'} ${idea.title}`}
          >
            <Icon name="heart" />
            {idea.voterIds.length}
          </button>
        </span>
      </div>
    </article>
  );
}
