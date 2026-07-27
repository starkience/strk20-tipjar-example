// Pills — 25% / 50% / MAX shortcuts under an amount field, so a user can't
// overshoot their balance and hit INSUFFICIENT_* after signing.
//
// `reserve` is subtracted before MAX: every private operation costs a flat pool
// fee in STRK, so maxing your STRK would leave nothing to pay it with.
import { formatUnits } from "../lib/tipjar";

export function Pills(props: {
  balance?: bigint;
  decimals: number;
  reserve?: bigint;
  onPick: (amount: string) => void;
}) {
  if (props.balance === undefined) return null;

  const spendable = (() => {
    const net = props.balance! - (props.reserve ?? 0n);
    return net > 0n ? net : 0n;
  })();

  const pick = (percent: bigint) =>
    props.onPick(formatUnits((spendable * percent) / 100n, props.decimals));

  return (
    <div className="pills">
      <button className="pill" type="button" onClick={() => pick(25n)}>
        25%
      </button>
      <button className="pill" type="button" onClick={() => pick(50n)}>
        50%
      </button>
      <button className="pill" type="button" onClick={() => pick(100n)}>
        MAX
      </button>
    </div>
  );
}
