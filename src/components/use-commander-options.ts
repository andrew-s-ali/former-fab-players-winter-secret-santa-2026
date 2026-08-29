"use client";

import { useEffect, useState } from "react";
import type { CommanderOption } from "@/lib/commanders";

/**
 * The whole legal commander pool, trimmed to what a picker needs.
 *
 * Fetched once and filtered in the browser, so changing a colour veto
 * re-filters instantly and one cached response serves everybody — see the note
 * in `/api/commanders/names`. Both the sign-up form and the card workshop need
 * it: the workshop's grid comes from the sample endpoint, but working out
 * legal partners needs the full list.
 */
export function useCommanderOptions(): {
  options: CommanderOption[] | null;
  failed: boolean;
} {
  const [options, setOptions] = useState<CommanderOption[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/commanders/names")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ commanders: CommanderOption[] }>;
      })
      .then((data) => {
        if (!cancelled) setOptions(data.commanders);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, failed };
}
