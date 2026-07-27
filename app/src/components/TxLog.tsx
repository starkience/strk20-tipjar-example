// TxLog — the side panel. Fills in as the stepper advances: every transaction
// this session (shield, private tip, public tip) plus public tips already
// on-chain. Private tips show only their own hash — there is nothing public to
// read about them.
//
// Motion here is deliberately smoother than the stepped, 8-bit easing used
// elsewhere: rows arrive while you are reading, so they expand and settle
// rather than snapping, and the rows below slide down instead of jumping.
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export type LogEntry = {
  kind: string;
  hash: string;
  time: number;
  detail?: string;
  /** Made in this session — highlighted so it stands out from chain history. */
  session?: boolean;
};

export function TxLog(props: { entries: LogEntry[]; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Panel slides in when shown.
  useGSAP(
    () => {
      gsap.from(panelRef.current, {
        autoAlpha: 0,
        x: 20,
        duration: 0.34,
        ease: "power3.out",
      });
    },
    { scope: panelRef },
  );

  // New row expands into place; everything below slides down with it.
  useGSAP(
    () => {
      const first = listRef.current?.firstElementChild;
      if (!first || props.entries.length === 0) return;
      gsap
        .timeline()
        .from(first, {
          height: 0,
          paddingTop: 0,
          paddingBottom: 0,
          borderTopWidth: 0,
          borderBottomWidth: 0,
          marginBottom: -8,
          autoAlpha: 0,
          duration: 0.38,
          ease: "power3.out",
        })
        .from(
          first.querySelectorAll(".txlog__kind, .txlog__detail, .txlog__hash"),
          {
            autoAlpha: 0,
            x: 10,
            duration: 0.28,
            stagger: 0.05,
            ease: "power2.out",
          },
          "-=0.18",
        );
    },
    { dependencies: [props.entries.length], scope: listRef },
  );

  return (
    <aside className="txlog" ref={panelRef}>
      <div className="txlog__head">
        <span className="txlog__title">TX LOG</span>
        <button className="txlog__close" onClick={props.onClose} aria-label="Hide">
          ✕
        </button>
      </div>

      <ul className="txlog__list" ref={listRef}>
        {props.entries.map((e) => (
          <li
            key={e.hash}
            className={`txlog__row ${e.session ? "is-session" : ""}`}
          >
            <span className="txlog__kind">{e.kind}</span>
            {e.detail && <span className="txlog__detail">{e.detail}</span>}
            <a
              className="txlog__hash"
              href={`https://voyager.online/tx/${e.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {e.hash.slice(0, 10)}…
            </a>
          </li>
        ))}
        {props.entries.length === 0 && <li className="txlog__empty">—</li>}
      </ul>
    </aside>
  );
}
