import type { Message } from '@project-room/shared';
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

/** Messages in this project whose text contains the phrase. The phrase is a bound parameter, never query text. */
export function searchMessages(projectId: string, query: string, limit = 8): Promise<Message[]> {
  const needle = query.trim().toLowerCase().slice(0, 80);
  if (needle.length < 2) return Promise.resolve([]);
  return queryMany<Message>(
    `SELECT * FROM message WHERE projectId = $project AND string::lowercase(text) CONTAINS $needle ORDER BY createdAt DESC LIMIT $limit`,
    { project: rid('project', projectId), needle, limit },
  );
}

/** How much of the current channel @AI always reads, oldest first, including turns before the last reply. */
export const THREAD_LIMIT = 80;
/** Older lines, from any channel in the project, added when they match the question and sit outside that thread. */
export const RECALL_LIMIT = 8;

const SEARCH_STOP = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'we',
  'did',
  'do',
  'why',
  'what',
  'which',
  'how',
  'is',
  'are',
  'was',
  'were',
  'for',
  'our',
  'use',
  'and',
  'or',
  'in',
  'on',
  'at',
  'it',
  'this',
  'that',
  'with',
  'from',
  'about',
  'where',
  'who',
  'when',
  'can',
  'you',
  'your',
  'any',
  'ai',
  'not',
  'but',
  'have',
  'has',
  'had',
  'just',
  'still',
]);

/** Distinctive words from a mention, used as the full-text query. */
export function searchTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/@\w+/g, ' ')
    .match(/[a-z0-9]{3,}/g);
  return [...new Set(words?.filter((word) => !SEARCH_STOP.has(word)) ?? [])].slice(0, 6);
}

type RecallHit = Message & { channelName?: string | null };

/**
 * The latest thread in this channel, plus older messages anywhere in the project whose words match the
 * question. The thread is always included, so @AI can follow the conversation even when the question
 * shares no words with it.
 */
export async function messagesForMention(projectId: string, channelId: string): Promise<RecallHit[]> {
  const recent = await listMessages(projectId, channelId, THREAD_LIMIT);
  const ask = [...recent].reverse().find((message) => /@ai\b/i.test(message.text))?.text ?? '';
  const terms = searchTerms(ask);
  if (!terms.length) return recent;
  try {
    const match = terms.map((_, index) => `text @${index + 1}@ $t${index}`).join(' OR ');
    const score = terms.map((_, index) => `search::score(${index + 1})`).join(' + ');
    const vars: Record<string, unknown> = {
      project: rid('project', projectId),
      limit: RECALL_LIMIT,
    };
    terms.forEach((term, index) => {
      vars[`t${index}`] = term;
    });
    const recalled = await queryMany<RecallHit>(
      `SELECT *, channelId.name AS channelName, ${score} AS score FROM message
       WHERE projectId = $project AND (${match})
       ORDER BY score DESC
       LIMIT $limit`,
      vars,
    );
    const seen = new Set(recent.map((message) => message.id));
    const older = recalled.filter((message) => !seen.has(message.id));
    return [...older, ...recent].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch (error) {
    console.error('Message search failed; using the channel thread', error);
    return recent;
  }
}

export async function createMessage(input: {
  projectId: string;
  channelId: string;
  authorId: string;
  text: string;
  suggestionId?: string | null;
  fileId?: string | null;
}): Promise<Message> {
  const message = await queryOne<Message>('CREATE ONLY message CONTENT $content', {
    content: {
      projectId: rid('project', input.projectId),
      channelId: rid('channel', input.channelId),
      authorId: input.authorId,
      text: input.text,
      suggestionId: ridOrNull('suggestion', input.suggestionId),
      fileId: ridOrNull('file', input.fileId),
    },
  });
  if (!message) throw new Error('Message creation returned nothing');
  return message;
}
