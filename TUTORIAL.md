# Adding Starknet Privacy (STRK20) to an app you already have

> A short, complete tutorial for developers — and coding agents — who want
> **confidential token transfers on a public chain** in an app that already
> works.

Most privacy tutorials start from an empty directory. That is the easy case, and
it is not the one you are in. This one starts from an app **already deployed and
transacting on mainnet**, and adds privacy without taking it down — because that
is the situation worth documenting:

> **You can add privacy to an app with existing users, liquidity, and activity —
> this is the key unique selling point of STRK20.**

You do not migrate your users. You do not fork your liquidity. You do not
redeploy your contracts. You add a second path through the app you already
shipped, and the two coexist.

This repo is the worked example. Everything below actually ran on Starknet
mainnet; the transaction hashes are real.

---

## Facts (for agents and skimmers)

| | |
| --- | --- |
| Live demo | <https://app-chi-three-39.vercel.app> |
| Repo | <https://github.com/starkience/strk20-tipjar-example> |
| Network | Starknet **mainnet** |
| Integration route | **Starknet Wallet API** via `starknet.js` |
| Custom Cairo needed | **None** |
| Contracts changed to add privacy | **0 files** |
| App files changed to add privacy | **5** — `+255 / −33`, of which the only Starknet wiring is `app/src/hooks/useTipJar.ts` (the other four are UI) |
| Built with | the [STRK20 agent skill](https://strk20-by-example.org/agent-skill) |
| Key deps | `starknet@10.4.0`, `@starknet-io/get-starknet-discovery@6.0.2`, `@starknet-io/types-js@0.10.3`, `@avnu/avnu-sdk@4.2.0` |
| Wallet requirement | Wallet API **≥ 0.10.3** (Ready today; Xverse in progress; Braavos unsupported) |
| STRK20 pool (mainnet) | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| Pool fee | flat, per private operation — **4 STRK** at time of writing |
| Note maturity | **~10 blocks** (~20s on mainnet) |

Reference docs are published as raw Markdown for agents:
<https://strk20-by-example.org/llms.txt>

---

## The 30-second version of STRK20

STRK20 is a privacy layer for **existing ERC-20s** on Starknet. Tokens are
**shielded** into a **privacy pool**, where balances are held as encrypted
**notes** (a UTXO model) and spending a note publishes a **nullifier** rather
than an identity. **Viewing keys** let the owner — and only the owner — read
their own state.

Four actions cover almost everything:

| Action | What it does | Public? |
| --- | --- | --- |
| **Shield** (deposit) | move public ERC-20 into the pool | public leg |
| **Private transfer** | move value between registered users inside the pool | private |
| **Swap** | trade inside the pool, where the wallet supports it | private |
| **Withdraw** (unshield) | move tokens back out to a public address | public leg |

And the one rule to internalise before you design anything:

> **Edges stay public.** Deposits and withdrawals expose public ERC-20 legs and
> timing, even though in-pool movement is private.

Almost every mistake in this tutorial traces back to that sentence.

---

## Act 1 — the app that already exists

The example app is a **tip jar**: one on-chain action, no liquidity to
bootstrap, so nothing distracts from the privacy work.

`contracts/src/tipjar.cairo` is deliberately ordinary — non-custodial, one
entrypoint:

```cairo
fn tip(ref self: ContractState, amount: u256) {
    assert(amount > 0_u256, 'TIP_AMOUNT_ZERO');
    let tipper = get_caller_address();
    // Forward directly to the owner — the jar never holds funds.
    IMockERC20Dispatcher { contract_address: self.token.read() }
        .transfer_from(tipper, self.owner.read(), amount);
    self.total_tipped.write(self.total_tipped.read() + amount);
    self.tip_count.write(self.tip_count.read() + 1_u64);
    self.emit(Tipped { tipper, amount, timestamp: get_block_timestamp() });
}
```

The frontend does what every Starknet dapp does: connect a wallet, `approve`,
`execute`, read events back into a "LATEST TIPS" wall.

It is deployed at
[`0x03ade0d0…b8a64f`](https://starkscan.co/contract/0x03ade0d029152e3b52188b5a32eac1f8b6f14d2fc3bdae1b94d9f6c545b8a64f)
and it works. **This contract is never modified again.** Hold onto that: the
privacy work below does not touch Cairo at all.

---

## Act 2 — the problem, on mainnet

Send one tip and look at what the chain now knows.

The `Tipped` event carries `tipper`, `amount`, `timestamp`. The transfer names
both parties. Anyone can reconstruct: **who supported whom, how much, and
when** — forever, for every tip.

For a tip jar that means a creator's entire support graph is public. For a
payroll app it is salaries. For a treasury it is your counterparties. The
problem is not that the app is badly written; it is that a public chain is
doing exactly what it promises.

You cannot fix this by deploying a different tip jar. The value has to move
somewhere the chain cannot narrate.

---

## Act 3 — add privacy, without rebuilding the app

### Step 1 — install the agent skill

Rather than reading the protocol docs and guessing at method names, drive the
integration with the official skill. It follows a **Scan → Ask → Route → Plan →
Execute** loop, and it works on **app code only — it never writes Cairo**.

```bash
npx skills add starkience/strk20-agent-skills
```

This installs to `.agents/skills/strk20-privacy-integration/` (with a symlink
into `.claude/skills/` for Claude Code). Then just ask:

> Add STRK20 privacy to this app.

**Scan** — it reads the repo and reports back: normal dapp, users bring their
own wallets, no backend, wallet connect at `useTipJar.ts:24`, sends at
`useTipJar.ts:62`, and a version gap (`starknet@10.0.2`, needs `10.4.0`).

**Ask** — three questions that actually change the output:

| Question | Answer here |
| --- | --- |
| What must be private? | the tipper↔creator link, and the amount |
| Which network? | mainnet (each real send gets explicit confirmation) |
| Which wallet? | Ready |

**Route** — it picks the **Starknet Wallet API via `starknet.js`**, the
recommended route for most private dapps: your dapp runs **on top of existing
privacy wallets**, and the wallet **handles keys, notes, proving, and
submission**. No anonymizer contract, because a private transfer to a wallet is
a plain Wallet-API primitive.

**Plan** — it writes [`STRK20_INTEGRATION_PLAN.md`](STRK20_INTEGRATION_PLAN.md)
to your repo: repo-specific, phased, with an honest hidden-vs-visible table.
Review it before executing. This is the artifact to read if you want to see
what the skill actually produces.

**Execute** — phase by phase, stopping at each boundary for a real wallet check.

### Step 2 — upgrade and detect capability

```bash
npm i starknet@^10.4.0 @starknet-io/get-starknet-discovery@^6.0.2 \
      @starknet-io/get-starknet-wallet-standard@^6.0.2 @starknet-io/types-js@^0.10.3
```

`WalletAccountV6` is a normal account — your existing `execute` calls are
untouched — that *also* exposes STRK20 actions:

```ts
const wa = await WalletAccountV6.connect(provider, wallet);
setPrivacySupported(await walletSupportsStrk20(wallet));
```

Ask the wallet what it supports. Do **not** probe balances:

```ts
// app/src/hooks/useTipJar.ts
async function walletSupportsStrk20(wallet: WalletWithStarknetFeatures) {
  try {
    const versions = await walletV6.supportedWalletApi(wallet);
    return versions.some((v) => compareVersions(v, "0.10.3") >= 0);
  } catch {
    return false;               // predates the method ⇒ not capable
  }
}
```

This matters more than it looks. The tempting shortcut — call `strk20Balances([])`
and see whether it throws — works, but it makes the wallet raise a **"share your
balances?"** consent prompt on page load, before the user has asked for anything
private. A privacy app should not read private state to decide whether it *can*
read private state. `supportedWalletApi` answers the question and reads nothing.

Treat every private read as something the user must opt into. It is the first
place your app either earns or loses their trust.

### Step 3 — the private tip

Here is the entire privacy feature:

```ts
// app/src/hooks/useTipJar.ts
const actions: STRK20_ACTION[] = [
  {
    type: "transfer",
    token: CONFIG.strkAddress,
    amount: `0x${amount.toString(16)}`,
    recipient: CONFIG.ownerAddress,
  },
];
const { transaction_hash } = await account.strk20InvokeTransaction(actions);
```

That is it. No contract call, no `Tipped` event, no approve. The wallet holds
the keys, finds the notes, generates the proof, and submits. Your app describes
*intent* and nothing else.

Shielding is the same call with a different action:

```ts
const actions: STRK20_ACTION[] = [
  { type: "deposit", token: token.address, amount: `0x${amount.toString(16)}` },
];
```

`STRK20_ACTION` comes from `@starknet-io/types-js` — the shapes are typed, so
you are never guessing at field names.

### Step 4 — the design decision that makes it actually private

Shield and transfer are **separate transactions on purpose.**

Bundling them is one click and one fee, and it is wrong. A deposit is a *public
leg that names the tipper* (edges stay public). Put it in the same transaction
as the transfer and anyone can correlate the two ends — you have paid the pool
fee for nothing.

Shielding **earlier, on its own**, is what breaks the link. The ~10-block wait
and the extra fee are the price of unlinkability, not overhead to optimise away.

If you take one thing from this tutorial, take this one.

### Step 5 — private swaps, still no Cairo

"Tip in any token, creator receives STRK" is private DeFi, which normally needs
an **anonymizer contract**. But AVNU ships private swaps as a first-party
integration, so you get theirs:

```ts
const { transactionHash } = await executePrivateSwap({
  quote,
  slippage: 0.05,
  takerAddress: account.address,
  poolAddress: PRIVACY_POOL_ADDRESS,
  feeMode: { poolFeeToken: STRK.address },
  prover: createStrk20WalletProver(account),   // the wallet proves
});
```

Both legs stay inside the pool: AVNU withdraws the sell amount to its executor,
routes the trade, and the bought STRK lands back as a new private note. The
wallet does the proving; your app describes the trade.

So the rule of thumb holds one step further than you would expect — **check
whether an integration already exists before writing Cairo.** If you do need
your own, [`docs/ANONYMIZER.md`](docs/ANONYMIZER.md) walks through a reference
`privacy_invoke` anonymizer built against AVNU's route model, showing what the
SDK does underneath and where the boundary sits between app code and a
team-owned, audited contract. It is **unaudited and not deployed** — a teaching
artifact, not a dependency.

> The paymaster needs an API key, and a key in a browser bundle is a public key.
> The deployed app proxies it through [`app/api/paymaster.ts`](app/api/paymaster.ts).

---

## The result

The complete cost of adding privacy to a live mainnet app — both phases, as
`git diff --stat`:

```
 app/src/App.css                |  57 ++++++++++++
 app/src/App.tsx                |  50 ++++++++--
 app/src/components/TipForm.tsx |  40 +++++---
 app/src/components/TipWall.tsx |   3 +
 app/src/hooks/useTipJar.ts     | 138 ++++++++++++++++++++++++-----
 5 files changed, 255 insertions(+), 33 deletions(-)
```

No entry under `contracts/`. Four of the five files are UI; one is wiring. The
deployed jar, its class hash, and every existing tipper's history are untouched.

Both paths deliver the same value to the creator. Verified on mainnet:

- The creator's wallet shows **four private receives — +20, +20, +1, +1 = 42 STRK**.
- The public jar's counter reads **3 tips / 3 STRK**, and the "LATEST TIPS" wall
  never moved.

**42 STRK arrived with no public trace.** A frozen public wall while the creator
is actually being paid — that contrast is the whole point.

One honest detail: the creator's wallet *does* show the sender. Private
transfers run over a directional channel, so the **recipient** can see who paid
them — which is what you want for a tip jar. What is hidden is that **no third
party can**.

Full evidence: [`docs/STRK20_INTEGRATION.md`](docs/STRK20_INTEGRATION.md).

---

## Designing the UX

The code is the easy part. What actually distinguishes a good STRK20 app is the
interface, because a private flow has **three properties a public one does
not**. None of them are obstacles — they are the mechanics that buy you
privacy — but each is something the user must be able to see.

### 1. A shield is two prompts, not one

The ERC-20 `approve` has to land on-chain before the deposit can be proven
against it. So the first time a user shields a given token, their wallet asks
twice.

**Design for it:** say so before they click. Our step 1 renders
*"first STRK shield needs an approval — two prompts"* only when the allowance is
actually missing. A user who expects two prompts is fine; a user who expects one
assumes it double-charged them.

### 2. Notes mature — about 10 blocks

A freshly created note is not immediately spendable. This is true after a
**shield** *and* after a **private swap**, since a swap credits a new note too.

**Design for it:** make the wait legible and non-blocking. The app anchors a
countdown at the block the note landed in, shows blocks remaining plus an ETA in
seconds, and disables the spend button until it clears. A visible 20-second
countdown reads as a system working; a button that silently fails reads as a
broken app.

```ts
const head = await provider.getBlockNumber();
setShieldedAtBlock(head);          // re-anchor after a shield AND after a swap
```

### 3. Every private operation costs a flat pool fee

Not a percentage — a flat amount per operation, currently 4 STRK on mainnet.
That is large enough to change your interface design.

**Design for it, three ways:**

- **Read it, don't hardcode it.** `get_fee_amount` on the pool.
- **Reserve it in your shortcuts.** A "MAX" button that spends the whole balance
  leaves nothing for the fee, so the transaction fails *after* the user signs.
  Ours reserves the fee before filling the field.
- **Report the outcome; don't predict it.** How the fee interacts with the
  amount varies by token — shielding STRK charges it on top of the amount, while
  other tokens can take it from within. Rather than compute a split we would get
  wrong, the UI states that a fee applies and lets the wallet show the exact
  numbers it is signing.

### And one rule that is not about mechanics at all

**Never read private state to make a UI decision.** Feature-detect with
`supportedWalletApi`, not with a balance call. Refresh shielded balances only
when the user presses SHOW, never on a timer — each read is a consent prompt,
and an app that asks constantly trains users to click through prompts they
should be reading.

### What changes in your UI

| Public flow | Private flow |
| --- | --- |
| one prompt | two, on a token's first shield |
| spendable immediately | ~10 blocks to mature — show a countdown |
| gas only | gas + a flat pool fee — reserve it in MAX |
| tx appears in your event feed | **nothing to display** — say so explicitly |
| balances read freely | read only on explicit user action |

That fourth row is the one teams forget. A private tip emits no event, so your
activity feed cannot show it. Do not leave that looking like a failure — our tip
wall carries the line *"private tips don't appear here — only the creator's
wallet sees them."* Honest copy about what is and is not visible is part of the
integration, not decoration on top of it.

### Standard Starknet hygiene, still required

Nothing STRK20-specific, but private flows surface these faster:

- **An accepted transaction is not a successful one.** Read `execution_status`
  from the receipt — a revert is otherwise indistinguishable from success.
- **Give `waitForTransaction` a ceiling.** Paymaster-relayed hashes can take a
  while to become visible to your RPC; an unbounded await strands the UI.
- **Normalize felts before comparing.** APIs return `0x4718f5a…` where your
  config holds `0x04718f5a…` — same felt, but `===` disagrees
  (`app/src/lib/address.ts`).
- **Translate protocol errors.** Wallets and relayers surface machine codes;
  map them to plain language (`app/src/lib/errors.ts`). A duplicate submission
  rejected by replay protection, for instance, means the *first* one went
  through — the opposite of what "error" suggests.

---

## Do this in your own app

1. `npx skills add starkience/strk20-agent-skills`, then ask it to add privacy.
2. Answer its three questions honestly — *what must be hidden* determines the route.
3. Read the generated plan before approving it.
4. Feature-detect with `supportedWalletApi`, never with a balance read.
5. Keep the shield **separate** from the private action.
6. Budget for the pool fee and the maturity wait in your UI, not just your logic.
7. Be honest in your copy about what stays public. Edges stay public.

Your contracts do not change. Your public path does not change. Your users keep
their addresses, their balances, and their history — and get a private path
alongside the one they already use.

---

## Where to go next

- **This repo, in order:** [`README.md`](README.md) →
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) →
  [`docs/STRK20_INTEGRATION.md`](docs/STRK20_INTEGRATION.md)
- **The one file that matters:** [`app/src/hooks/useTipJar.ts`](app/src/hooks/useTipJar.ts)
- **STRK20 by Example:** <https://strk20-by-example.org/> · agents: <https://strk20-by-example.org/llms.txt>
- **Starknet Wallet API:** <https://strk20-by-example.org/starknet-wallet-api/overview>
- **The agent skill:** <https://strk20-by-example.org/agent-skill>
- **AVNU private swaps:** <https://docs.avnu.fi/docs/privacy>

```bash
git clone https://github.com/starkience/strk20-tipjar-example
cd strk20-tipjar-example/app && npm install && npm run dev
```
