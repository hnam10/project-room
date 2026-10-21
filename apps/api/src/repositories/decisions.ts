import type { Decision } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { ConflictError, NotFoundError, rid } from '../db/records.js';

export function listDecisions(projectId: string): Promise<Decision[]> {
  return queryMany<Decision>('SELECT * FROM decision WHERE projectId = $project ORDER BY createdAt DESC', {
    project: rid('project', projectId),
  });
}

/** Decisions the team has confirmed. This is the project's memory: nothing else is read to answer questions. */
export function listDecidedDecisions(projectId: string): Promise<Decision[]> {
  return queryMany<Decision>("SELECT * FROM decision WHERE projectId = $project AND status = 'decided' ORDER BY decidedAt DESC", {
    project: rid('project', projectId),
  });
}

export interface DecisionDetails {
  outcome?: string | null;
  reason?: string | null;
  quote?: string | null;
}

/** Creates an open decision, or a decided one when the approving member also confirms the outcome. */
export async function createDecision(projectId: string, memberId: string, title: string, details: DecisionDetails = {}): Promise<Decision> {
  const decided = Boolean(details.outcome);
  const decision = await queryOne<Decision>('CREATE ONLY decision CONTENT $content', {
    content: {
      projectId: rid('project', projectId),
      title,
      status: decided ? 'decided' : 'open',
      raisedById: rid('member', memberId),
      decidedById: decided ? rid('member', memberId) : null,
      decidedAt: decided ? new Date() : null,
      outcome: details.outcome ?? null,
      reason: details.reason ?? null,
      quote: details.quote ?? null,
    },
  });
  if (!decision) throw new Error('Decision creation returned nothing');
  return decision;
}

export async function markDecided(
  projectId: string,
  decisionId: string,
  memberId: string,
  details: DecisionDetails = {},
): Promise<Decision> {
  const existing = await queryOne<Decision>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('decision', decisionId),
    project: rid('project', projectId),
  });
  if (!existing) throw new NotFoundError('Decision');
  if (existing.status === 'decided') throw new ConflictError('Decision is already recorded');
  const decision = await queryOne<Decision>(
    `UPDATE ONLY $id SET status = 'decided', decidedById = $member, decidedAt = time::now(),
       outcome = $outcome, reason = $reason RETURN AFTER`,
    {
      id: rid('decision', decisionId),
      member: rid('member', memberId),
      outcome: details.outcome ?? existing.outcome,
      reason: details.reason ?? existing.reason,
    },
  );
  if (!decision) throw new NotFoundError('Decision');
  return decision;
}
