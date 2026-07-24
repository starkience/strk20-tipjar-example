// TxLog — the right-side transaction log. Scrolls internally so the page keeps
// its no-scroll layout. Every row is a public `Tipped` event; private (STRK20)
// tips never emit that event, so they never appear here — the note says so.
import { formatStrk, type TipEvent } from "../lib/tipjar";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function TxLog(props: { tips: TipEvent[]; onClose: () => void }) {
  return (
    <aside className="txlog">
      <div className="txlog__head">
        <span className="txlog__title">◆ TX LOG ◆</span>
        <button
          className="txlog__close"
          onClick={props.onClose}
          aria-label="Hide transaction log"
        >
          ✕
        </button>
      </div>

      <ul className="txlog__list">
        {props.tips.map((t) => (
          <li key={t.txHash} className="txlog__row">
            <a
              className="txlog__who"
              href={`https://voyager.online/tx/${t.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(t.tipper)}
            </a>
            <span className="txlog__amt">{formatStrk(t.amount)} STRK</span>
            <span className="txlog__when">
              {new Date(t.timestamp * 1000).toLocaleString()}
            </span>
          </li>
        ))}
        {props.tips.length === 0 && (
          <li className="txlog__empty">NO PUBLIC TIPS YET</li>
        )}
      </ul>

      <p className="txlog__note">
        🔒 Private tips never appear here — only the creator's wallet sees them.
      </p>
    </aside>
  );
}
