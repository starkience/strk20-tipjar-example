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
import type { LogEntry } from "../lib/txlog";

export type { LogEntry };

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
  //
  // Keyed on the TOP row's hash, not the list length: a new transaction is
  // always prepended, so a changed top hash means "a new row arrived" — while a
  // status update or older chain tips loading in leave the top hash untouched
  // and correctly do not re-animate. Keying on length instead re-ran this on
  // every change and re-collapsed the same top row.
  //
  // clearProps strips the inline height/opacity GSAP applies, so a row can never
  // be left collapsed or invisible if the animation is interrupted mid-flight —
  // which is how transactions "stopped showing up".
  //
  // Only a FRESH row (made this run) animates in. Rehydrated history is loaded
  // in bulk on connect; animating its top row made a plain reconnect look like a
  // transaction had just happened.
  const topId = props.entries[0]?.id;
  const topIsFresh = props.entries[0]?.session === true;
  useGSAP(
    () => {
      const first = listRef.current?.firstElementChild;
      if (!first || !topId || !topIsFresh) return;
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
          clearProps: "height,paddingTop,paddingBottom,borderTopWidth,borderBottomWidth,marginBottom,opacity,visibility",
        })
        .from(
          first.querySelectorAll(".txlog__kind, .txlog__detail, .txlog__hash"),
          {
            autoAlpha: 0,
            x: 10,
            duration: 0.28,
            stagger: 0.05,
            ease: "power2.out",
            clearProps: "opacity,visibility,transform",
          },
          "-=0.18",
        );
    },
    { dependencies: [topId], scope: listRef },
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
            key={e.id}
            className={`txlog__row ${e.session ? "is-session" : ""} ${
              e.status === "failed" ? "is-failed" : ""
            }`}
          >
            <span className="txlog__kind">
              {e.kind}
              {e.status === "failed" && (
                <span className="txlog__status txlog__status--bad"> FAILED</span>
              )}
              {e.status === "pending" && (
                <span className="txlog__status"> PENDING</span>
              )}
            </span>
            {e.detail && <span className="txlog__detail">{e.detail}</span>}
            {e.hash ? (
              <a
                className="txlog__hash"
                href={`https://voyager.online/tx/${e.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                {e.hash.slice(0, 10)}…
              </a>
            ) : (
              // No hash from the wallet — the row still stands. "confirmed" is an
              // ok row with no hash (a shield can land without the wallet ever
              // returning one); "pending…" while in flight; "—" if it failed.
              <span className="txlog__hash txlog__hash--nolink">
                {e.status === "pending"
                  ? "pending…"
                  : e.status === "failed"
                    ? "—"
                    : "confirmed"}
              </span>
            )}
          </li>
        ))}
        {props.entries.length === 0 && <li className="txlog__empty">—</li>}
      </ul>

      {/* The honest answer to "why didn't my private tip show in my wallet?".
          A private transfer calls no contract and emits no public Transfer
          event tied to your address, so a wallet's activity list has nothing to
          render — that unlinkability is the whole point. This log (and SHOW) is
          where you confirm it, not your wallet history. */}
      <p className="txlog__note">
        Private sends leave no public trace — they won't appear in your wallet
        history or the tip wall. Confirm them here, or with SHOW.
      </p>
    </aside>
  );
}
