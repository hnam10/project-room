import { AsyncLocalStorage } from 'node:async_hooks';
import type { Idea, IdeaUpdateInput } from '@project-room/shared';
import { queryMany } from '../db/query.js';
import { ConflictError, NotFoundError, rid } from '../db/records.js';

export interface TopicScope {
  projectId: string;
  topicId: string;
  version: number;
}

// Propagates a captured topic version through nested AI research calls. A reset
// invalidates their writes without cancelling another topic's work.
export const brainstormScope = new AsyncLocalStorage<TopicScope>();

export async function getTopic(projectId: string, topicId?: string | null): Promise<Idea> {
  const topics = await queryMany<Idea>("SELECT * FROM idea WHERE projectId = $project AND kind = 'problem'", {
    project: rid('project', projectId),
  });
  const topic = topicId ? topics.find((item) => item.id === topicId) : topics.length === 1 ? topics[0] : null;
  if (!topic && topicId) throw new NotFoundError('Brainstorm topic');
  if (!topic) throw new ConflictError('Choose a brainstorm topic first');
  return topic;
}

export async function assertTopicScope(scope: TopicScope): Promise<void> {
  const topic = await getTopic(scope.projectId, scope.topicId);
  if (topic.boardVersion !== scope.version) throw new ConflictError('This topic changed while AI was working. Try again.');
}

/** Reset only this topic. Tasks and decisions already created remain project records. */
export async function resetTopic(
  projectId: string,
  topicId: string,
  mode: 'all' | 'ideas' | 'delete',
  patch: IdeaUpdateInput = {},
  keepSuggestionId: string | null = null,
): Promise<Idea | null> {
  const topic = await getTopic(projectId, topicId);
  await queryMany(
    `BEGIN TRANSACTION;
     LET $cards = SELECT VALUE id FROM idea WHERE projectId = $project AND topicId = $topic
       ${mode === 'ideas' ? "AND theme != 'Strategy'" : ''};
     ${
       mode === 'ideas'
         ? `
       LET $sources = array::flatten((SELECT VALUE researchSources FROM idea WHERE projectId = $project AND id IN $cards));
       UPDATE idea SET researchSources = array::distinct(array::concat(researchSources, $sources)) WHERE projectId = $project AND id = $topic;
       UPDATE suggestion SET ideaId = $topic WHERE projectId = $project AND topicId = $topic AND kind = 'brainstorm_analysis' AND ideaId IN $cards;
       UPDATE suggestion SET ideaId = null, originIdeaId = null WHERE projectId = $project AND topicId = $topic AND kind = 'idea' AND ideaDraft.theme = 'Strategy' AND (ideaId IN $cards OR originIdeaId IN $cards);
     `
         : ''
     }
     DELETE suggestion WHERE projectId = $project AND topicId = $topic AND id != $keepSuggestion
       ${mode === 'ideas' ? "AND ((kind = 'idea' AND ideaDraft.theme != 'Strategy') OR (kind = 'action_items' AND ideaId IN $cards))" : ''};
     DELETE idea WHERE projectId = $project AND id IN $cards;
     ${
       mode === 'delete'
         ? 'DELETE idea WHERE projectId = $project AND id = $topic;'
         : `UPDATE idea SET boardVersion += 1${mode === 'all' ? ', title = $title, description = $description, researchSources = [], researchStale = false' : ''}
        WHERE projectId = $project AND id = $topic;`
     }
     COMMIT TRANSACTION;`,
    {
      project: rid('project', projectId),
      topic: rid('idea', topicId),
      title: patch.title ?? topic.title,
      description: patch.description ?? topic.description,
      keepSuggestion: keepSuggestionId ? rid('suggestion', keepSuggestionId) : null,
    },
  );
  return mode === 'delete' ? null : getTopic(projectId, topicId);
}

/** Idempotent upgrade for existing boards: preserve old unscoped cards in an explicit topic. */
export async function migrateLegacyTopics(): Promise<void> {
  await queryMany(`
    BEGIN TRANSACTION;
    FOR $project IN (SELECT VALUE id FROM project WHERE brainstormTopicsMigrated IN [NONE, NULL, false]) {
      UPDATE idea SET boardVersion = boardVersion ?? 0 WHERE projectId = $project;
      LET $orphans = SELECT VALUE id FROM idea WHERE projectId = $project AND kind = 'idea' AND topicId IN [NONE, NULL];
      LET $topics = SELECT VALUE id FROM idea WHERE projectId = $project AND kind = 'problem' ORDER BY createdAt;
      IF array::len($orphans) > 0 OR array::len($topics) > 0 {
        LET $topic = IF array::len($topics) > 0 { $topics[0] } ELSE {
          (CREATE ONLY idea CONTENT {
            projectId: $project, kind: 'problem', title: 'Earlier brainstorming',
            description: 'Ideas saved before topic boards were introduced.', theme: 'Option',
            authorId: (SELECT VALUE authorId FROM idea WHERE id IN $orphans LIMIT 1)[0]
          }).id
        };
        UPDATE idea SET topicId = $topic WHERE projectId = $project AND id IN $orphans;
        UPDATE suggestion SET topicId = $topic, topicVersion = $topic.boardVersion
          WHERE projectId = $project AND topicId IN [NONE, NULL] AND kind != 'brainstorm_topic'
          AND (kind IN ['idea', 'brainstorm_analysis'] OR brainstormTrigger != null);
      };
      UPDATE $project SET brainstormTopicsMigrated = true;
    };
    COMMIT TRANSACTION;
  `);
}
