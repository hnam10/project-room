import type { Idea, Member } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IdeaDetails } from './IdeaDetails';
import { IdeaSources } from './IdeaSources';
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
      <button
        type="button"
        className={idea.theme === 'Strategy' ? 'card-tool solo danger' : 'corner-x'}
        onClick={props.onDelete}
        aria-label={`Delete ${idea.title}`}
        title="Delete"
      >
        <Icon name={idea.theme === 'Strategy' ? 'trash' : 'x'} />
      </button>
      {idea.taskId && <span className="idea-converted">✓ On the board</span>}
      <h3>{idea.title}</h3>
      {idea.theme === 'Strategy' ? (
        <StrategyDetails description={idea.description} />
      ) : (
        <IdeaDetails description={idea.description} title={idea.title} onEdit={props.onEdit} />
      )}
      {idea.researchStale && <span className="idea-stale">Research may be outdated after this edit</span>}
      <div className="idea-stage-actions">
        <button type="button" onClick={props.onEdit}>
          Edit
        </button>
        {idea.approved ? (
          <strong>Approved</strong>
        ) : (
          <button type="button" onClick={props.onApprove}>
            Approve
          </button>
        )}
      </div>
      <IdeaSources sources={idea.researchSources ?? []} label="Sources" title={idea.title} />
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
            {idea.voterIds.length}
            <Icon name="heart" />
          </button>
        </span>
      </div>
    </article>
  );
}
