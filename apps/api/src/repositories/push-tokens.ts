import { queryMany, queryOne } from '../db/query.js';
import { rid } from '../db/records.js';

export async function upsertPushToken(memberId: string, token: string): Promise<void> {
  const existing = await queryMany<{ id: string }>('SELECT id FROM push_token WHERE token = $pushToken', { pushToken: token });
  if (existing[0]) {
    await queryOne('UPDATE ONLY $id SET memberId = $member', {
      id: rid('push_token', existing[0].id),
      member: rid('member', memberId),
    });
    return;
  }
  await queryOne('CREATE ONLY push_token CONTENT { memberId: $member, token: $pushToken }', {
    member: rid('member', memberId),
    pushToken: token,
  });
}

export async function deletePushToken(memberId: string, token: string): Promise<void> {
  await queryOne('DELETE push_token WHERE token = $pushToken AND memberId = $member', {
    pushToken: token,
    member: rid('member', memberId),
  });
}

export function listPushTokensForMembers(memberIds: string[]): Promise<{ token: string }[]> {
  if (memberIds.length === 0) return Promise.resolve([]);
  return queryMany<{ token: string }>('SELECT token FROM push_token WHERE memberId IN $ids', {
    ids: memberIds.map((id) => rid('member', id)),
  });
}
