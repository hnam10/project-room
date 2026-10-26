import { createHash } from 'node:crypto';
import { queryMany, queryOne } from '../db/query.js';
import { rid } from '../db/records.js';

export async function upsertPushToken(memberId: string, token: string, revocationKey?: string): Promise<void> {
  const revocationHash = revocationKey ? hashKey(revocationKey) : null;
  const existing = await queryMany<{ id: string }>('SELECT id FROM push_token WHERE token = $pushToken', { pushToken: token });
  if (existing[0]) {
    await queryOne('UPDATE ONLY $id SET memberId = $member, revocationHash = $revocationHash', {
      id: rid('push_token', existing[0].id),
      member: rid('member', memberId),
      revocationHash,
    });
    return;
  }
  await queryOne('CREATE ONLY push_token CONTENT { memberId: $member, token: $pushToken, revocationHash: $revocationHash }', {
    member: rid('member', memberId),
    pushToken: token,
    revocationHash,
  });
}

export async function deletePushToken(memberId: string, token: string): Promise<void> {
  await queryOne('DELETE push_token WHERE token = $pushToken AND memberId = $member', {
    pushToken: token,
    member: rid('member', memberId),
  });
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function revokePushToken(token: string, revocationKey: string): Promise<void> {
  await queryOne('DELETE push_token WHERE token = $pushToken AND revocationHash = $revocationHash', {
    pushToken: token,
    revocationHash: hashKey(revocationKey),
  });
}

export function listPushTokensForMembers(memberIds: string[]): Promise<{ memberId: string; token: string }[]> {
  if (memberIds.length === 0) return Promise.resolve([]);
  return queryMany<{ memberId: string; token: string }>('SELECT memberId, token FROM push_token WHERE memberId IN $ids', {
    ids: memberIds.map((id) => rid('member', id)),
  });
}
