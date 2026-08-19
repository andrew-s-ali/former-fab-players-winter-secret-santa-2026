import { describe, expect, it } from "vitest";
import type { User } from "@netlify/identity";
import { ORGANIZER_ROLE, isOrganizer } from "./organizer";

function user(roles?: string[]): User {
  return { id: "u1", email: "organiser@example.com", roles } as User;
}

describe("isOrganizer", () => {
  it("accepts a user holding the role", () => {
    expect(isOrganizer(user([ORGANIZER_ROLE]))).toBe(true);
  });

  it("accepts a user holding the role alongside others", () => {
    expect(isOrganizer(user(["member", ORGANIZER_ROLE]))).toBe(true);
  });

  it("rejects a logged-out visitor", () => {
    expect(isOrganizer(null)).toBe(false);
  });

  it("rejects a logged-in user with no roles at all", () => {
    // `roles` is optional on the User type: a signed-up user whose role
    // assignment failed has none, and must not be treated as an organiser.
    expect(isOrganizer(user(undefined))).toBe(false);
    expect(isOrganizer(user([]))).toBe(false);
  });

  it("rejects a user with a different role", () => {
    expect(isOrganizer(user(["member"]))).toBe(false);
  });
});
