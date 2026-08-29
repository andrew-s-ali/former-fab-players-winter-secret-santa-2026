"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** Width of the magnified preview. Scryfall's "normal" art is 488×680. */
const PREVIEW_WIDTH = 340;
const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * 680) / 488);
/** Gap between the cursor and the preview, so it never sits under the pointer. */
const CURSOR_GAP = 18;
/** Keeps the preview off the very edge of the window. */
const MARGIN = 8;

/**
 * Only offer the preview where hovering is a real thing.
 *
 * On a touch screen the first tap would fire the hover handlers and leave a
 * card floating over the page with nothing to dismiss it.
 */
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeToHover(onChange: () => void) {
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A card image that magnifies next to the pointer on hover.
 *
 * Card art at thumbnail size is unreadable — the whole point of looking at a
 * commander is its rules text — so rather than making every grid bigger, the
 * full card follows the cursor.
 *
 * Rendered through a portal to `document.body` because several of the places
 * a card appears sit inside `overflow-hidden` containers, which would clip a
 * preview positioned inside the normal flow.
 */
export function CardImage({
  src,
  alt = "",
  name,
  className,
  style,
}: {
  src: string;
  /** Usually empty: the card's name is nearly always rendered beside it. */
  alt?: string;
  /** Used only for the preview's accessible label when one is warranted. */
  name?: string;
  className?: string;
  /** For sizes Tailwind has no utility for; never applied to the preview. */
  style?: React.CSSProperties;
}) {
  const hoverCapable = useSyncExternalStore(
    subscribeToHover,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => false
  );
  const [showing, setShowing] = useState(false);
  const position = useRef({ x: 0, y: 0 });
  const preview = useRef<HTMLImageElement | null>(null);

  /**
   * Written straight to the node rather than held in state: this runs on every
   * mousemove, and re-rendering the tree at that rate is what makes hover
   * previews feel sticky.
   */
  const place = useCallback(() => {
    const node = preview.current;
    if (!node) {
      return;
    }
    const { x, y } = position.current;
    // Flip to the left of the cursor when there is no room on the right.
    const right = x + CURSOR_GAP;
    const left =
      right + PREVIEW_WIDTH > window.innerWidth - MARGIN
        ? x - CURSOR_GAP - PREVIEW_WIDTH
        : right;
    const top = y - PREVIEW_HEIGHT / 2;

    node.style.left = `${Math.max(MARGIN, left)}px`;
    node.style.top = `${Math.min(
      Math.max(MARGIN, top),
      window.innerHeight - PREVIEW_HEIGHT - MARGIN
    )}px`;
  }, []);

  const track = useCallback(
    (event: { clientX: number; clientY: number }) => {
      position.current = { x: event.clientX, y: event.clientY };
      place();
    },
    [place]
  );

  const open = useCallback(
    (event: React.MouseEvent<HTMLImageElement>) => {
      if (!hoverCapable) {
        return;
      }
      track(event);
      setShowing(true);
    },
    [hoverCapable, track]
  );

  /**
   * Keyboard users get the same thing, anchored beside the element rather
   * than the cursor — these images sit inside buttons on the browser grid,
   * so they are reachable by tab.
   */
  const openFromFocus = useCallback(
    (event: React.FocusEvent<HTMLImageElement>) => {
      if (!hoverCapable) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      position.current = { x: rect.right, y: rect.top + rect.height / 2 };
      setShowing(true);
    },
    [hoverCapable]
  );

  const close = useCallback(() => setShowing(false), []);

  return (
    <>
      {/*
        Scryfall images are external and deliberately unoptimised.
        eslint-disable-next-line @next/next/no-img-element
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        className={className}
        onBlur={close}
        onFocus={openFromFocus}
        onMouseEnter={open}
        onMouseLeave={close}
        onMouseMove={hoverCapable ? track : undefined}
        src={src}
        style={style}
      />

      {showing
        ? createPortal(
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={name ? `${name}, enlarged` : ""}
              aria-hidden={name ? undefined : true}
              className="pointer-events-none fixed z-50 rounded-xl shadow-2xl ring-1 ring-black/40"
              ref={(node) => {
                preview.current = node;
                place();
              }}
              src={src}
              style={{ width: PREVIEW_WIDTH }}
            />,
            document.body
          )
        : null}
    </>
  );
}
