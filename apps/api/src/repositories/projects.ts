import type { Channel, Member, Project, ProjectUpdateInput } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { NotFoundError, rid } from '../db/records.js';

const PROJECT_FIELDS = 'id, name, description, emoji, color, dueDate, memberIds';

export function listProjectsForMember(memberId: string): Promise<Project[]> {
  return queryMany<Project>(`SELECT ${PROJECT_FIELDS} FROM project WHERE memberIds CONTAINS $member ORDER BY name`, {
    member: rid('member', memberId),
  });
}

export function getProject(projectId: string): Promise<Project | null> {
  return queryOne<Project>(`SELECT ${PROJECT_FIELDS} FROM ONLY $id`, { id: rid('project', projectId) });
}

export async function updateProject(projectId: string, patch: ProjectUpdateInput): Promise<Project> {
  const project = await queryOne<Project>(`UPDATE ONLY $id SET dueDate = $dueDate RETURN AFTER`, {
    id: rid('project', projectId),
    dueDate: patch.dueDate,
  });
  if (!project) throw new NotFoundError('Project');
  return project;
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

/** Creates or refreshes a member's profile (used for members whose identity comes from Clerk). */
export function upsertMember(member: Member): Promise<Member | null> {
  return queryOne<Member>('UPSERT ONLY $id MERGE $data', {
    id: rid('member', member.id),
    data: { name: member.name, color: member.color, role: member.role },
  });
}

/** Creates a project with a #general channel if it doesn't exist yet. Safe to call repeatedly. */
export async function ensureProject(project: Pick<Project, 'id' | 'name'>): Promise<void> {
  const id = rid('project', project.id);
  await queryOne(
    `IF !record::exists($id) {
       UPSERT $id MERGE { name: $name };
       UPSERT $channel MERGE { projectId: $id, name: 'general' };
     }`,
    { id, name: project.name, channel: rid('channel', `${project.id}-general`) },
  );
}

/** Adds a member to a project (no-op when already a member). */
export function addProjectMember(projectId: string, memberId: string): Promise<unknown> {
  return queryOne('UPDATE ONLY $id SET memberIds = array::union(memberIds, [$member])', {
    id: rid('project', projectId),
    member: rid('member', memberId),
  });
}
