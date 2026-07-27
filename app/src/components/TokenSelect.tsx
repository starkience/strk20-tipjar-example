// TokenSelect — an 8-bit dropdown. A native <select> renders with OS chrome,
// which breaks the arcade styling, so this is a button + list we control.
import { useEffect, useRef, useState } from "react";
import type { Token } from "../config";

export function TokenSelect(props: {
  tokens: Token[];
  value: Token;
  onChange: (t: Token) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="tokensel" ref={ref}>
      <button
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

      {open && (
        <ul className="tokensel__list" role="listbox">
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
        </ul>
      )}
    </div>
  );
}
