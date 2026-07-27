// TokenSelect — an 8-bit dropdown. A native <select> renders with OS chrome,
// which breaks the arcade styling, so this is a button + list we control.
//
// The list is rendered through a portal with fixed positioning rather than
// absolutely inside the step. Its ancestor (.stage) scrolls, and an absolutely
// positioned child of a scrolling box gets clipped — options below the fold
// were unreachable. Portaling escapes that, and the list scrolls internally so
// a long token list never grows the page.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Token } from "../config";

export function TokenSelect(props: {
  tokens: Token[];
  value: Token;
  onChange: (t: Token) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Position the list against the button each time it opens.
  useLayoutEffect(() => {
    if (open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
  }, [open]);

  // Close on outside click, Escape, or any scroll/resize that would strand the
  // list away from its button.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !listRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <div className="tokensel">
      <button
        ref={btnRef}
        type="button"
        className="tokensel__btn"
        disabled={props.disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {props.value.symbol}
        <span className="tokensel__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <ul
            className="tokensel__list"
            role="listbox"
            ref={listRef}
            style={{
              top: rect.bottom + 4,
              left: rect.left,
              minWidth: rect.width,
            }}
          >
            {props.tokens.map((t) => (
              <li key={t.address}>
                <button
                  type="button"
                  role="option"
                  aria-selected={t.address === props.value.address}
                  className={`tokensel__opt ${
                    t.address === props.value.address ? "is-active" : ""
                  }`}
                  onClick={() => {
                    props.onChange(t);
                    setOpen(false);
                  }}
                >
                  {t.symbol}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
