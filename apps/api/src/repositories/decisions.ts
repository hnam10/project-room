import type { Decision } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { ConflictError, NotFoundError, rid } from '../db/records.js';

export function listDecisions(projectId: string): Promise<Decision[]> {
  return queryMany<Decision>('SELECT * FROM decision WHERE projectId = $project ORDER BY createdAt DESC', {
    project: rid('project', projectId),
  });
}

export async function createDecision(projectId: string, raisedById: string, title: string): Promise<Decision> {
  const decision = await queryOne<Decision>('CREATE ONLY decision CONTENT $content', {
    content: { projectId: rid('project', projectId), title, status: 'open', raisedById: rid('member', raisedById) },
  });
  if (!decision) throw new Error('Decision creation returned nothing');
  return decision;
}

export async function markDecided(projectId: string, decisionId: string, memberId: string): Promise<Decision> {
  const existing = await queryOne<Decision>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('decision', decisionId),
    project: rid('project', projectId),
  });
  if (!existing) throw new NotFoundError('Decision');
  if (existing.status === 'decided') throw new ConflictError('Decision is already recorded');
  const decision = await queryOne<Decision>(
    "UPDATE ONLY $id SET status = 'decided', decidedById = $member, decidedAt = time::now() RETURN AFTER",
    { id: rid('decision', decisionId), member: rid('member', memberId) },
  );
  if (!decision) throw new NotFoundError('Decision');
  return decision;
}
