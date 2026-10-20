import { AI_AUTHOR, type Message } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { rid, ridOrNull } from '../db/records.js';

export function listMessages(projectId: string, channelId: string, limit = 200): Promise<Message[]> {
  // Newest `limit` messages, returned oldest-first for display.
  return queryMany<Message>(
    `SELECT * FROM (SELECT * FROM message WHERE projectId = $project AND channelId = $channel ORDER BY createdAt DESC LIMIT $limit)
     ORDER BY createdAt ASC`,
    { project: rid('project', projectId), channel: rid('channel', channelId), limit },
  );
}

/** Messages after the AI last spoke in this channel: the conversation the AI hasn't processed yet. */
export async function messagesSinceLastAiReply(projectId: string, channelId: string, max = 12): Promise<Message[]> {
  const recent = await listMessages(projectId, channelId, 50);
  const lastAi = recent.map((m) => m.authorId).lastIndexOf(AI_AUTHOR);
  return recent.slice(lastAi + 1).slice(-max);
}

export async function createMessage(input: {
  projectId: string;
  channelId: string;
  authorId: string;
  text: string;
  suggestionId?: string | null;
}): Promise<Message> {
  const message = await queryOne<Message>('CREATE ONLY message CONTENT $content', {
    content: {
      projectId: rid('project', input.projectId),
      channelId: rid('channel', input.channelId),
      authorId: input.authorId,
      text: input.text,
      suggestionId: ridOrNull('suggestion', input.suggestionId),
    },
  });
  if (!message) throw new Error('Message creation returned nothing');
  return message;
}
