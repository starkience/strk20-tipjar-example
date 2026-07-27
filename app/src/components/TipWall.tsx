// TipWall — the scoreboard summary (RAISED / public tip count) shown in the main
// cabinet. Totals come from the contract's get_total(); the transaction list
// lives in the right-side TxLog. Both reflect only PUBLIC tips — private (STRK20)
// tips never touch the contract.
import { formatDisplay } from "../lib/tipjar";

export function TipWall(props: { total: bigint; count: number }) {
  return (
    <section className="tip-wall">
      <div className="scoreboard">
        <div className="scoreboard__cell">
          <span className="scoreboard__label">RAISED</span>
          <span className="scoreboard__value">{formatDisplay(props.total, 18)}</span>
          <span className="scoreboard__unit">STRK</span>
        </div>
        <div className="scoreboard__cell">
          <span className="scoreboard__label">PUBLIC TIPS</span>
          <span className="scoreboard__value">
            {String(props.count).padStart(3, "0")}
          </span>
        </div>
      </div>
    </section>
  );
}
