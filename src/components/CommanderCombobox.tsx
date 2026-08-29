"use client";

import { useId, useMemo, useState } from "react";
import type { CommanderOption } from "@/lib/commanders";

/**
 * Most matches rendered at once.
 *
 * The legal pool is ~704 cards, so an empty query would otherwise put 704
 * options in the DOM on every keystroke. The count of what is hidden is shown
 * rather than silently truncating, so "my card isn't in the list" is
 * distinguishable from "I need to type more".
 */
const MAX_VISIBLE = 50;

function matches(option: CommanderOption, query: string): boolean {
  return option.name.toLowerCase().includes(query);
}

/**
 * Type-to-filter picker over the legal commander list.
 *
 * A plain `<datalist>` would be less code, but its filtering, styling and
 * mobile presentation are all browser-defined, and it offers no way to show
 * "42 more matches" or to keep a chosen value distinct from typed text. This
 * follows the ARIA combobox pattern instead: the input owns the listbox,
 * `aria-activedescendant` moves the screen-reader cursor without moving focus,
 * and Enter commits the highlighted option.
 */
export function CommanderCombobox({
  options,
  onChoose,
  label,
  hint,
  disabled = false,
}: {
  options: CommanderOption[];
  onChoose: (option: CommanderOption) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const listboxId = useId();
  const optionId = useId();
  const hintId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === "" ? options : options.filter((o) => matches(o, needle));
  }, [options, query]);

  const visible = filtered.slice(0, MAX_VISIBLE);
  const hidden = filtered.length - visible.length;
  // Clamped rather than stored-and-corrected: the list changes under the
  // cursor on every keystroke, and an index past the end must not select
  // nothing when Enter is pressed.
  const activeIndex = Math.min(active, Math.max(visible.length - 1, 0));

  function choose(option: CommanderOption | undefined) {
    if (!option) {
      return;
    }
    onChoose(option);
    setQuery("");
    setActive(0);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = activeIndex + step;
      // Wraps, so holding one arrow key can reach both ends of the list.
      setActive(
        next < 0 ? visible.length - 1 : next >= visible.length ? 0 : next
      );
      return;
    }
    if (event.key === "Enter") {
      // Only swallow Enter when it is being used to pick — otherwise it must
      // still submit the form this sits inside.
      if (open && visible.length > 0) {
        event.preventDefault();
        choose(visible[activeIndex]);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        // Closing on blur, but not when focus merely moved to an option
        // inside this same widget.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium">{label}</span>
        <input
          aria-activedescendant={
            open && visible.length > 0 ? `${optionId}-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={hint ? hintId : undefined}
          aria-expanded={open}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-300/40 bg-transparent px-3 py-2 text-sm disabled:opacity-50"
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          // Click as well as focus: after committing a pick the list closes but
          // the input keeps focus, so a focus-only handler would leave a
          // second click doing nothing.
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Start typing a commander's name…"
          role="combobox"
          type="text"
          value={query}
        />
      </label>

      {hint ? (
        <span className="mt-1 block text-xs opacity-70" id={hintId}>
          {hint}
        </span>
      ) : null}

      {open ? (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-300/40 bg-slate-900 shadow-lg">
          <ul
            aria-label={label}
            className="max-h-72 overflow-y-auto"
            id={listboxId}
            role="listbox"
          >
            {visible.map((option, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  index === activeIndex ? "bg-sky-600 text-white" : ""
                }`}
                id={`${optionId}-${index}`}
                key={option.id}
                // mousedown, not click: click fires after blur, which would
                // have already closed the list out from under the pointer.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(index)}
                role="option"
              >
                {option.name}
              </li>
            ))}
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-sm opacity-70">
                No legal commander matches that.
              </li>
            ) : null}
          </ul>

          {hidden > 0 ? (
            <p className="border-t border-slate-300/20 px-3 py-2 text-xs opacity-70">
              {hidden} more match{hidden === 1 ? "" : "es"} — keep typing to narrow it down.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
