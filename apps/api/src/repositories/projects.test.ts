import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, connectDb } from '../db/client.js';
import {
  addProjectMember,
  ensureProject,
  getMember,
  getProject,
  listChannels,
  listMembers,
  setMemberName,
  setProjectName,
  upsertMember,
} from './projects.js';

// Provisioning used by Clerk mode: Clerk users and organizations become members and projects on first use.

beforeAll(async () => {
  await connectDb('mem://');
});

afterAll(async () => {
  await closeDb();
});

describe('Clerk provisioning', () => {
  it('creates an organization project once, with a #general channel', async () => {
    await ensureProject({ id: 'org_abc', name: 'Team Rocket' });
    await ensureProject({ id: 'org_abc', name: 'Renamed later' });

    const project = await getProject('org_abc');
    expect(project).toMatchObject({ id: 'org_abc', name: 'Team Rocket', memberIds: [] });
    expect((await listChannels('org_abc')).map((c) => c.name)).toEqual(['general']);
  });

  it('adds members without duplicates', async () => {
    await upsertMember({ id: 'user_1', name: 'Mina', color: '#5b4ff0', role: '' });
    await upsertMember({ id: 'user_2', name: 'Joon', color: '#0e9f6e', role: '' });
    await addProjectMember('org_abc', 'user_1');
    await addProjectMember('org_abc', 'user_1');
    await addProjectMember('org_abc', 'user_2');

    const project = await getProject('org_abc');
    expect(project?.memberIds).toEqual(['user_1', 'user_2']);
    expect((await listMembers(project!.memberIds)).map((m) => m.name)).toEqual(['Mina', 'Joon']);
  });

  it('updates a Clerk project name and member name in place', async () => {
    await ensureProject({ id: 'org_rename', name: 'Before' });
    await upsertMember({ id: 'user_rename', name: 'Before', color: '#111111', role: 'lead' });
    await addProjectMember('org_rename', 'user_rename');

    await setProjectName('org_rename', 'After');
    await setMemberName('user_rename', 'After Name');

    expect(await getProject('org_rename')).toMatchObject({ name: 'After', memberIds: ['user_rename'] });
    expect(await getMember('user_rename')).toMatchObject({ name: 'After Name', color: '#111111', role: 'lead' });
    expect((await listChannels('org_rename')).map((channel) => channel.name)).toEqual(['general']);
  });

  it('provisions one project and channel when requests arrive together', async () => {
    const org = { id: 'org_concurrent', name: 'Concurrent Team' };
    await Promise.all(Array.from({ length: 12 }, () => ensureProject(org)));
    expect(await getProject(org.id)).toMatchObject({ id: org.id, name: org.name });
    expect((await listChannels(org.id)).map((channel) => channel.name)).toEqual(['general']);

    const member = { id: 'user_concurrent', name: 'Mina', color: '#5b4ff0', role: '' };
    await Promise.all(Array.from({ length: 12 }, () => upsertMember(member)));
    await Promise.all(Array.from({ length: 12 }, () => addProjectMember(org.id, member.id)));
    expect((await getProject(org.id))?.memberIds).toEqual([member.id]);
  });
});
