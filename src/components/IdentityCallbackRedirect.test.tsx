import { describe, expect, it } from "vitest";
import { identityCallbackDestination } from "./IdentityCallbackRedirect";

describe("identityCallbackDestination", () => {
  it("forwards a password recovery callback from the homepage", () => {
    expect(
      identityCallbackDestination("/", "#recovery_token=secret-token")
    ).toBe("/admin/login#recovery_token=secret-token");
  });

  it("forwards other Identity callbacks", () => {
    expect(
      identityCallbackDestination("/signup", "#invite_token=secret-token")
    ).toBe("/admin/login#invite_token=secret-token");
  });

  it("does not redirect ordinary hashes", () => {
    expect(identityCallbackDestination("/", "#rules")).toBeNull();
  });

  it("does not redirect the login page again", () => {
    expect(
      identityCallbackDestination(
        "/admin/login",
        "#recovery_token=secret-token"
      )
    ).toBeNull();
  });
});
