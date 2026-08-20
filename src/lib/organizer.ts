import type { User } from "@netlify/identity";

/**
 * The Identity role that may run the event.
 *
 * Assigned automatically on signup by the `userSignup` handler, and only
 * meaningful alongside invite-only registration — with open registration
 * anyone who signed up would be handed the role.
 */
export const ORGANIZER_ROLE = "organizer";

/** Dashboard role names that grant access to the organiser console. */
export const ORGANIZER_ROLES = [
  ORGANIZER_ROLE,
  "organiser",
  "admin",
] as const;

/**
 * Whether a user may use the organiser console.
 *
 * Kept pure and separate from `requireOrganizer` so the rule itself is unit
 * tested. Netlify Identity does not run under `netlify dev`, so anything that
 * actually calls `getUser()` can only be exercised on a deploy.
 */
export function isOrganizer(user: User | null): boolean {
  return Boolean(
    user?.roles?.some((role) =>
      ORGANIZER_ROLES.includes(
        role.trim().toLowerCase() as (typeof ORGANIZER_ROLES)[number]
      )
    )
  );
}
