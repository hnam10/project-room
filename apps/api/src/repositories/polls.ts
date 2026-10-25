import type { Poll, PollDraft, PollOption } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { ConflictError, NotFoundError, rid, ridOrNull } from '../db/records.js';

const toDbOptions = (options: PollOption[]) => options.map((o) => ({ ...o, voterIds: o.voterIds.map((id) => rid('member', id)) }));

export async function createPoll(
  projectId: string,
  createdById: string,
  draft: PollDraft,
  opts: { meetingId: string | null; sourceSuggestionId: string | null },
): Promise<Poll> {
  const poll = await queryOne<Poll>('CREATE ONLY poll CONTENT $content', {
    content: {
      projectId: rid('project', projectId),
      meetingId: ridOrNull('meeting', opts.meetingId),
      question: draft.question,
      options: toDbOptions(draft.options.map((label, i) => ({ id: `o${i + 1}`, label, voterIds: [] }))),
      status: 'open',
      createdById: rid('member', createdById),
      sourceSuggestionId: ridOrNull('suggestion', opts.sourceSuggestionId),
    },
  });
  if (!poll) throw new Error('Poll creation returned nothing');
  return poll;
}

export async function getPoll(projectId: string, pollId: string): Promise<Poll> {
  const poll = await queryOne<Poll>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('poll', pollId),
    project: rid('project', projectId),
  });
  if (!poll) throw new NotFoundError('Poll');
  return poll;
}

export function listPolls(projectId: string, meetingId: string | null): Promise<Poll[]> {
  return queryMany<Poll>('SELECT * FROM poll WHERE projectId = $project AND meetingId = $meeting ORDER BY createdAt', {
    project: rid('project', projectId),
    meeting: ridOrNull('meeting', meetingId),
  });
}

/** Every poll in the project, newest first: the Polls tab. */
export function listProjectPolls(projectId: string): Promise<Poll[]> {
  return queryMany<Poll>('SELECT * FROM poll WHERE projectId = $project ORDER BY createdAt DESC', { project: rid('project', projectId) });
}

/** Moves the member's vote to `optionId` (one vote per poll). */
export async function votePoll(projectId: string, pollId: string, memberId: string, optionId: string): Promise<Poll> {
  const poll = await getPoll(projectId, pollId);
  if (poll.status !== 'open') throw new ConflictError('This poll is closed');
  if (!poll.options.some((o) => o.id === optionId)) throw new NotFoundError('Option');
  // ponytail: read-modify-write, a concurrent vote on the same poll can be lost; use a single SurrealQL update if it matters
  const options = poll.options.map((o) => {
    const others = o.voterIds.filter((id) => id !== memberId);
    return { ...o, voterIds: o.id === optionId ? [...others, memberId] : others };
  });
  const updated = await queryOne<Poll>('UPDATE ONLY $id SET options = $options RETURN AFTER', {
    id: rid('poll', pollId),
    options: toDbOptions(options),
  });
  if (!updated) throw new NotFoundError('Poll');
  return updated;
}

export async function closePoll(projectId: string, pollId: string): Promise<Poll> {
  const poll = await getPoll(projectId, pollId);
  if (poll.status === 'closed') return poll;
  const updated = await queryOne<Poll>("UPDATE ONLY $id SET status = 'closed', closedAt = time::now() RETURN AFTER", {
    id: rid('poll', pollId),
  });
  if (!updated) throw new NotFoundError('Poll');
  return updated;
}
