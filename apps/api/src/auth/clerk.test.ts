import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, getOrganization, getOrganizationMembershipList } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getOrganization: vi.fn(),
  getOrganizationMembershipList: vi.fn(),
}));

vi.mock('@clerk/express', () => ({
  createClerkClient: () => ({
    users: { getUser },
    organizations: { getOrganization, getOrganizationMembershipList },
  }),
}));

vi.mock('../repositories/projects.js', () => ({
  getMember: vi.fn(),
  upsertMember: vi.fn(),
  setMemberName: vi.fn(),
  getProject: vi.fn(),
  ensureProject: vi.fn(),
  addProjectMember: vi.fn(),
  setProjectName: vi.fn(),
}));

import {
  addProjectMember,
  ensureProject,
  getMember,
  getProject,
  setMemberName,
  setProjectName,
  upsertMember,
} from '../repositories/projects.js';
import { ensureClerkMember, ensureOrgProject, resetClerkSyncCache } from './clerk.js';

const member = vi.mocked(getMember);
const saveMember = vi.mocked(upsertMember);
const renameMember = vi.mocked(setMemberName);
const project = vi.mocked(getProject);
const createProject = vi.mocked(ensureProject);
const joinProject = vi.mocked(addProjectMember);
const renameProject = vi.mocked(setProjectName);

let now = 1_000_000;

beforeEach(() => {
  now = 1_000_000;
  vi.resetAllMocks();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  resetClerkSyncCache();
  getOrganizationMembershipList.mockResolvedValue({ data: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const profile = (name: string | null, username: string | null = null, email: string | null = null) => ({
  fullName: name,
  firstName: name?.split(' ')[0] ?? null,
  lastName: name?.split(' ').slice(1).join(' ') || null,
  username,
  primaryEmailAddress: email ? { emailAddress: email } : null,
});

describe('Clerk profile sync', () => {
  it('creates a member from the Clerk profile the first time', async () => {
    member.mockResolvedValue(null);
    getUser.mockResolvedValue(profile('Mina Park'));

    await ensureClerkMember('user_1');

    expect(saveMember).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_1', name: 'Mina Park', role: '' }));
    expect(renameMember).not.toHaveBeenCalled();
  });

  it('uses the username, then the email, when Clerk has no full name', async () => {
    member.mockResolvedValue(null);
    getUser.mockResolvedValue(profile(null, 'mina'));
    await ensureClerkMember('user_name');
    expect(saveMember).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_name', name: 'mina' }));

    resetClerkSyncCache();
    getUser.mockResolvedValue(profile(null, null, 'mina.park@school.edu'));
    await ensureClerkMember('user_mail');
    expect(saveMember).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_mail', name: 'mina.park' }));
  });

  it('updates a stored name when the Clerk profile changes', async () => {
    member.mockResolvedValue({ id: 'user_1', name: 'Mina', color: '#111111', role: 'lead' });
    getUser.mockResolvedValue(profile('Mina Park'));

    await ensureClerkMember('user_1');

    expect(renameMember).toHaveBeenCalledWith('user_1', 'Mina Park');
    expect(saveMember).not.toHaveBeenCalled();
  });

  it('does not replace a real name with the Member placeholder', async () => {
    member.mockResolvedValue({ id: 'user_1', name: 'Mina', color: '#111111', role: '' });
    getUser.mockResolvedValue(profile(null));

    await ensureClerkMember('user_1');

    expect(renameMember).not.toHaveBeenCalled();
    expect(saveMember).not.toHaveBeenCalled();
  });

  it('asks Clerk again only after the refresh window', async () => {
    member.mockResolvedValue({ id: 'user_1', name: 'Mina', color: '#111111', role: '' });
    getUser.mockResolvedValue(profile('Mina Park'));

    await ensureClerkMember('user_1');
    await ensureClerkMember('user_1');
    expect(getUser).toHaveBeenCalledTimes(1);

    now += 30_001;
    getUser.mockResolvedValue(profile('Mina Park Kim'));
    await ensureClerkMember('user_1');
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(renameMember).toHaveBeenCalledWith('user_1', 'Mina Park Kim');
  });

  it('keeps the stored member when Clerk cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    member.mockResolvedValue({ id: 'user_1', name: 'Mina', color: '#111111', role: '' });
    getUser.mockRejectedValue(new Error('down'));

    await ensureClerkMember('user_1');

    expect(renameMember).not.toHaveBeenCalled();
  });

  it('still fails when a brand-new member cannot be loaded from Clerk', async () => {
    member.mockResolvedValue(null);
    getUser.mockRejectedValue(new Error('down'));

    await expect(ensureClerkMember('user_new')).rejects.toThrow('down');
  });
});

describe('Clerk organization sync', () => {
  it('creates the project from the organization name and adds the caller', async () => {
    project.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'org_1', name: 'Rocket', memberIds: [] });
    getOrganization.mockResolvedValue({ name: 'Rocket' });

    await ensureOrgProject('org_1', 'user_1');

    expect(createProject).toHaveBeenCalledWith({ id: 'org_1', name: 'Rocket' });
    expect(joinProject).toHaveBeenCalledWith('org_1', 'user_1');
  });

  it('renames the project when the Clerk organization name changes', async () => {
    project.mockResolvedValue({ id: 'org_1', name: 'Old', memberIds: ['user_1'] });
    getOrganization.mockResolvedValue({ name: '  New name  ' });

    await ensureOrgProject('org_1', 'user_1');

    expect(renameProject).toHaveBeenCalledWith('org_1', 'New name');
    expect(createProject).not.toHaveBeenCalled();
    expect(joinProject).not.toHaveBeenCalled();
  });

  it('still adds a member when the organization was refreshed recently', async () => {
    project.mockResolvedValue({ id: 'org_1', name: 'Rocket', memberIds: ['user_1'] });
    getOrganization.mockResolvedValue({ name: 'Rocket' });
    await ensureOrgProject('org_1', 'user_1');

    getOrganization.mockClear();
    project.mockResolvedValue({ id: 'org_1', name: 'Rocket', memberIds: ['user_1'] });
    await ensureOrgProject('org_1', 'user_2');

    expect(getOrganization).not.toHaveBeenCalled();
    expect(joinProject).toHaveBeenCalledWith('org_1', 'user_2');
  });

  it('copies a teammate name from the organization membership list', async () => {
    project.mockResolvedValue({ id: 'org_1', name: 'Rocket', memberIds: ['user_1', 'user_2'] });
    getOrganization.mockResolvedValue({ name: 'Rocket' });
    getOrganizationMembershipList.mockResolvedValue({
      data: [{ publicUserData: { userId: 'user_2', firstName: 'Joon', lastName: 'Kim', identifier: 'joon@school.edu' } }],
    });
    member.mockImplementation(async (id: string) => (id === 'user_2' ? { id, name: 'Joon', color: '#111111', role: '' } : null));

    await ensureOrgProject('org_1', 'user_1');

    expect(renameMember).toHaveBeenCalledWith('user_2', 'Joon Kim');
    expect(saveMember).not.toHaveBeenCalled();
  });

  it('does not let a stale membership name overwrite a profile just read from Clerk', async () => {
    member.mockResolvedValue({ id: 'user_1', name: 'Mina', color: '#111111', role: '' });
    getUser.mockResolvedValue(profile('Mina Park'));
    await ensureClerkMember('user_1');
    renameMember.mockClear();

    project.mockResolvedValue({ id: 'org_1', name: 'Rocket', memberIds: ['user_1'] });
    getOrganization.mockResolvedValue({ name: 'Rocket' });
    getOrganizationMembershipList.mockResolvedValue({
      data: [{ publicUserData: { userId: 'user_1', firstName: 'Old', lastName: 'Name', identifier: 'mina@school.edu' } }],
    });

    await ensureOrgProject('org_1', 'user_1');

    expect(renameMember).not.toHaveBeenCalled();
  });

  it('ignores a membership that has no first or last name', async () => {
    project.mockResolvedValue({ id: 'org_1', name: 'Rocket', memberIds: ['user_2'] });
    getOrganization.mockResolvedValue({ name: 'Rocket' });
    getOrganizationMembershipList.mockResolvedValue({
      data: [{ publicUserData: { userId: 'user_2', firstName: null, lastName: null, identifier: 'joon@school.edu' } }],
    });
    member.mockResolvedValue({ id: 'user_2', name: 'Joon', color: '#111111', role: '' });

    await ensureOrgProject('org_1', 'user_1');

    expect(renameMember).not.toHaveBeenCalled();
  });

  it('keeps the stored project when Clerk cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    project.mockResolvedValue({ id: 'org_1', name: 'Rocket', memberIds: [] });
    getOrganization.mockRejectedValue(new Error('down'));

    await ensureOrgProject('org_1', 'user_1');

    expect(renameProject).not.toHaveBeenCalled();
    expect(joinProject).toHaveBeenCalledWith('org_1', 'user_1');
  });
});
