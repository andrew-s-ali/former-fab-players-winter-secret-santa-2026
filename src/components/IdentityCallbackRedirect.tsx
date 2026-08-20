"use client";

import { useEffect } from "react";

const CALLBACK_PARAMETERS = [
  "access_token",
  "confirmation_token",
  "recovery_token",
  "invite_token",
  "email_change_token",
] as const;

export function identityCallbackDestination(pathname: string, hash: string) {
  if (pathname === "/admin/login" || !hash.startsWith("#")) {
    return null;
  }

  const parameters = new URLSearchParams(hash.slice(1));
  const isIdentityCallback = CALLBACK_PARAMETERS.some((parameter) =>
    parameters.has(parameter)
  );

  return isIdentityCallback ? `/admin/login${hash}` : null;
}

export function IdentityCallbackRedirect() {
  useEffect(() => {
    const destination = identityCallbackDestination(
      window.location.pathname,
      window.location.hash
    );

    if (destination) {
      window.location.replace(destination);
    }
  }, []);

  return null;
}
