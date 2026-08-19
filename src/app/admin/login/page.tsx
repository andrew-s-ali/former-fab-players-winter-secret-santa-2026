import type { Metadata } from "next";
import { OrganizerLogin } from "@/components/OrganizerLogin";

export const metadata: Metadata = {
  title: "Organiser sign-in",
  robots: { index: false, follow: false },
};

/**
 * Deliberately not gated.
 *
 * `handleAuthCallback()` has to run somewhere a signed-out visitor can reach,
 * because invite and recovery links arrive with no session at all.
 */
export const dynamic = "force-dynamic";

export default function OrganizerLoginPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Organiser sign-in</h1>
      <OrganizerLogin />
    </main>
  );
}
