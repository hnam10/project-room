import { useEffect, useRef, type ReactNode } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import {
  ClerkProvider,
  InviteMembersButton,
  OrganizationList,
  OrganizationSwitcher,
  Show,
  SignIn,
  UserButton,
  useAuth,
  useClerk,
  useOrganization,
} from '@clerk/react';
import { clerkPublishableKey } from '../../api/auth';

// Clerk UI. VITE_CLERK_PUBLISHABLE_KEY is required (see main.tsx).
// A Clerk Organization is a Project Room project: creating, switching and inviting go through Clerk.

const projectUrl = (org: { id: string }) => `/p/${org.id}/board`;

/** Clerk provider + sign-in gate: signed-out visitors only ever see the sign-in screen. */
export function ClerkRoot({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey!}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      afterSignOutUrl="/"
    >
      <ActiveTeamSync />
      <Show when="signed-out">
        <div className="boot">
          <SignIn routing="hash" />
        </div>
      </Show>
      <Show when="signed-in">{children}</Show>
    </ClerkProvider>
  );
}

/** Shown when the user has no active team yet: pick one of their teams or create one. */
export function ChooseTeam() {
  return (
    <div className="boot">
      <OrganizationList hidePersonal afterSelectOrganizationUrl={projectUrl} afterCreateOrganizationUrl={projectUrl} />
    </div>
  );
}

/** Sidebar team (project) switcher; also where new teams are created. */
export function TeamSwitcher() {
  return (
    <div className="team-switcher">
      <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl={projectUrl} afterCreateOrganizationUrl={projectUrl} />
    </div>
  );
}

export function AccountButton() {
  return <UserButton />;
}

/** Wraps the top-bar invite button; only team members allowed to manage memberships see it. */
export function InviteButton({ children }: { children: ReactNode }) {
  return (
    <Show when={{ permission: 'org:sys_memberships:manage' }}>
      <InviteMembersButton>{children}</InviteMembersButton>
    </Show>
  );
}

/** Keeps Clerk's active organization in step with the project in the URL (e.g. after opening a link). */
function ActiveTeamSync() {
  const projectId = useMatch('/p/:projectId/*')?.params.projectId;
  const { isSignedIn } = useAuth();
  const { organization, isLoaded } = useOrganization();
  const { setActive } = useClerk();
  const activeId = organization?.id;
  const syncedProject = useRef<string | null>(null);
  useEffect(() => {
    // Sync once per URL change. The switcher changes Clerk's organization before
    // navigating; reacting to that change would activate the previous team again.
    if (!isLoaded || !isSignedIn) return;
    if (!projectId) {
      syncedProject.current = null;
      return;
    }
    if (syncedProject.current === projectId) return;
    syncedProject.current = projectId;
    if (activeId !== projectId) {
      // Fails if the user isn't in that team; the API then reports the project as not found.
      setActive({ organization: projectId }).catch(() => undefined);
    }
  }, [isLoaded, isSignedIn, activeId, projectId, setActive]);
  return null;
}
