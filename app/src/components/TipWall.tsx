import { formatStrk, type TipEvent } from "../lib/tipjar";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function TipWall(props: { tips: TipEvent[]; total: bigint; count: number }) {
  return (
    <section className="tip-wall">
      <h2>
        {formatStrk(props.total)} STRK raised · {props.count} tips
      </h2>
      <ul>
        {props.tips.map((t) => (
          <li key={t.txHash}>
            <a
              href={`https://voyager.online/tx/${t.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(t.tipper)}
            </a>{" "}
            tipped {formatStrk(t.amount)} STRK ·{" "}
            {new Date(t.timestamp * 1000).toLocaleString()}
          </li>
        ))}
      </ul>
      {props.tips.length === 0 && <p>No tips yet. Be the first!</p>}
    </section>
  );
}
