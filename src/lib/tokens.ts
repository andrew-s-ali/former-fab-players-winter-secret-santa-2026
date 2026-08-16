import { randomBytes } from "node:crypto";

/**
 * Mints a reveal token.
 *
 * This token is the only thing protecting a participant's assignment, so it
 * must come from a CSPRNG — never Math.random.
 */
export function mintToken(): string {
  return randomBytes(16).toString("base64url");
}
