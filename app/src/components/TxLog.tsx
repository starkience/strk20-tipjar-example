// TxLog — the side panel. Fills in as the stepper advances: every transaction
// this session (shield, private tip, public tip) plus public tips already
// on-chain. Private tips show only their own hash — there is nothing public to
// read about them.
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export type LogEntry = {
  kind: string;
  hash: string;
  time: number;
  detail?: string;
};

export function TxLog(props: { entries: LogEntry[]; onClose: () => void }) {
  const listRef = useRef<HTMLUListElement>(null);

  // Slide the newest row in as the stepper produces transactions.
  useGSAP(
    () => {
      const first = listRef.current?.firstElementChild;
      if (first) {
        gsap.from(first, {
          autoAlpha: 0,
          x: 12,
          duration: 0.24,
          ease: "steps(4)",
        });
      }
    },
    { dependencies: [props.entries.length], scope: listRef },
  );

  return (
    <aside className="txlog">
      <div className="txlog__head">
        <span className="txlog__title">TX LOG</span>
        <button className="txlog__close" onClick={props.onClose} aria-label="Hide">
          ✕
        </button>
      </div>

      <ul className="txlog__list" ref={listRef}>
        {props.entries.map((e) => (
          <li key={e.hash} className="txlog__row">
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
