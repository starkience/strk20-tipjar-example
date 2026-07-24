import { formatStrk, type TipEvent } from "../lib/tipjar";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function TipWall(props: { tips: TipEvent[]; total: bigint; count: number }) {
  return (
    <section className="tip-wall">
      <div className="scoreboard">
        <div className="scoreboard__cell">
          <span className="scoreboard__label">RAISED</span>
          <span className="scoreboard__value">{formatStrk(props.total)}</span>
          <span className="scoreboard__unit">STRK</span>
        </div>
        <div className="scoreboard__cell">
          <span className="scoreboard__label">TIPS</span>
          <span className="scoreboard__value">
            {String(props.count).padStart(3, "0")}
          </span>
        </div>
      </div>

      <h2 className="tip-wall__title">◆ HIGH SCORES ◆</h2>
      <ul className="tip-wall__list">
        {props.tips.map((t) => (
          <li key={t.txHash} className="tip-wall__row">
            <a
              className="tip-wall__who"
              href={`https://voyager.online/tx/${t.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(t.tipper)}
            </a>
            <span className="tip-wall__amt">{formatStrk(t.amount)} STRK</span>
            <span className="tip-wall__when">
              {new Date(t.timestamp * 1000).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
      {props.tips.length === 0 && (
        <p className="tip-wall__empty">NO TIPS YET — BE PLAYER ONE!</p>
      )}
    </section>
  );
}
