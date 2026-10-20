import type { Channel, Member, Project } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { rid } from '../db/records.js';

const PROJECT_FIELDS = 'id, name, description, emoji, color, dueDate, memberIds';

export function listProjectsForMember(memberId: string): Promise<Project[]> {
  return queryMany<Project>(`SELECT ${PROJECT_FIELDS} FROM project WHERE memberIds CONTAINS $member ORDER BY name`, {
    member: rid('member', memberId),
  });
}

export function getProject(projectId: string): Promise<Project | null> {
  return queryOne<Project>(`SELECT ${PROJECT_FIELDS} FROM ONLY $id`, { id: rid('project', projectId) });
}

export function listMembers(memberIds: string[]): Promise<Member[]> {
  return queryMany<Member>('SELECT * FROM $ids', { ids: memberIds.map((id) => rid('member', id)) });
}

export function getMember(memberId: string): Promise<Member | null> {
  return queryOne<Member>('SELECT * FROM ONLY $id', { id: rid('member', memberId) });
}

export function listChannels(projectId: string): Promise<Channel[]> {
  return queryMany<Channel>('SELECT * FROM channel WHERE projectId = $project ORDER BY name', {
    project: rid('project', projectId),
  });
}

export function getChannel(projectId: string, channelId: string): Promise<Channel | null> {
  return queryOne<Channel>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('channel', channelId),
    project: rid('project', projectId),
  });
}
