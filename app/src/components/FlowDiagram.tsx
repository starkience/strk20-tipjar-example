// FlowDiagram — shows what the selected mode actually does on-chain.
//
//   PUBLIC   YOU ──tip──▶ JAR ──▶ CREATOR        (all visible)
//   PRIVATE  YOU ──shield──▶ POOL ──send──▶ CREATOR   (one atomic tx)
//
// This is the app's main teaching surface: the private path is a single
// strk20InvokeTransaction carrying BOTH a deposit (shield) and a transfer, so
// the diagram draws them as two steps under one "1 ATOMIC TX" bracket.
// The forwarded ref marks the CREATOR node — the coin-flight animation target.
import { forwardRef } from "react";
import { COIN_SVG, JAR_SVG, VAULT_SVG, WALLET_SVG } from "../lib/pixelArt";

export const FlowDiagram = forwardRef<HTMLDivElement, { isPrivate: boolean }>(
  function FlowDiagram({ isPrivate }, creatorRef) {
    return (
      <div className={`flow ${isPrivate ? "flow--private" : ""}`}>
        <div className="flow__node">
          <span
            className="flow__sprite"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: COIN_SVG }}
          />
          <span className="flow__label">YOU</span>
        </div>

        <div className="flow__arrow">
          <span className="flow__step">{isPrivate ? "SHIELD" : "TIP"}</span>
          <span className="flow__line" aria-hidden>
            ──▶
          </span>
        </div>

        <div className="flow__node">
          <span
            className="flow__sprite"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: isPrivate ? VAULT_SVG : JAR_SVG }}
          />
          <span className="flow__label">{isPrivate ? "POOL" : "JAR"}</span>
        </div>

        <div className="flow__arrow">
          <span className="flow__step">{isPrivate ? "SEND" : ""}</span>
          <span className="flow__line" aria-hidden>
            ──▶
          </span>
        </div>

        <div className="flow__node" ref={creatorRef}>
          <span
            className="flow__sprite"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: WALLET_SVG }}
          />
          <span className="flow__label">CREATOR</span>
        </div>

        <p className="flow__caption">
          {isPrivate
            ? "1 ATOMIC TX · SENDER & AMOUNT HIDDEN · +POOL FEE"
            : "1 TX · SENDER & AMOUNT PUBLIC"}
        </p>
      </div>
    );
  },
);
