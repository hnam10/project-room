import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClerkProvider,
  InviteMembersButton,
  OrganizationList,
  OrganizationSwitcher,
  Show,
  SignIn,
  UserButton,
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
export function ActiveTeamSync({ projectId }: { projectId: string }) {
  const { organization, isLoaded } = useOrganization();
  const { setActive } = useClerk();
  const activeId = organization?.id;
  useEffect(() => {
    if (isLoaded && projectId && activeId !== projectId) {
      // Fails if the user isn't in that team; the API then reports the project as not found.
      setActive({ organization: projectId }).catch(() => undefined);
    }
  }, [isLoaded, activeId, projectId, setActive]);
  return null;
}
