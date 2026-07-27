# strk20-tipjar-example

> A minimal, real-mainnet example of adding **STRK20 privacy** to an ordinary
> Starknet app — built as a tip jar so the before/after is obvious.

This repo is a teaching reference. It starts as a completely ordinary **public**
tip jar (a Cairo contract + a React frontend, live on Starknet mainnet), and is
then extended with a **private** tipping path using
[STRK20](https://strk20-by-example.org/) — Starknet's privacy protocol — so you
can see exactly which files change and why.

If you are a developer (or a coding agent) trying to understand **how STRK20
plugs into an existing app**, this is meant to be read top to bottom.

### 👉 Start with [**TUTORIAL.md**](TUTORIAL.md)

The short, complete walkthrough: an ordinary mainnet app → the problem, shown
on-chain → privacy added with the agent skill, in **0 contract changes** — then
how to design the UX around it. Everything else in this repo is the evidence
behind it.

**Try it live:** <https://app-chi-three-39.vercel.app>

---

## Status

| Part | What | State |
| --- | --- | --- |
| **Part 1 — Public tip jar** | `TipJar` Cairo contract + React frontend, deployed on mainnet | ✅ Done |
| **Part 2 — STRK20 privacy** | Shield → wait → private swap → private tip, built **with the [STRK20 agent skill](https://strk20-by-example.org/agent-skill)** | ✅ **Verified on mainnet** — 42 STRK received privately while the public wall stayed at 3 tips. Log + evidence: [`docs/STRK20_INTEGRATION.md`](docs/STRK20_INTEGRATION.md) |
| **Private swaps (any token → STRK)** | Via the **[AVNU SDK](https://docs.avnu.fi/docs/privacy)** — no custom contract needed | ✅ Wired into the app |
| **Anonymizer contract** | A Cairo `privacy_invoke` helper, kept to show what the SDK does underneath | 🧪 Reference only — **not audited, not deployed**. See [`docs/ANONYMIZER.md`](docs/ANONYMIZER.md) |

Part 1 exists so there is a real, working app to add privacy *to* — and so the
"everything is public" problem is concrete.

---

## The idea in one screen

A tip jar has one on-chain action: **tip the creator**.

```
PUBLIC   Tipper ──approve + tip──▶ TipJar ──transfer_from──▶ Creator
         everything visible: who tipped whom, how much, when

PRIVATE  ① Tipper ──shield──▶ STRK20 pool          (public deposit, earlier)
         ② …wait ~10 blocks for the note to mature
         ③ optional: private swap any token → STRK  (inside the pool, via AVNU)
         ④ Tipper ──private transfer──▶ Creator     (no public leg at all)
```

The public path and the private path deliver the same value to the creator. The
private one leaves **no public link between tipper and creator**.

Verified on mainnet: the creator's wallet shows **42 STRK received privately**,
while the jar's public counter still reads **3 tips / 3 STRK** and the "LATEST
TIPS" wall never moved.

### The part that is easy to get wrong

Shielding and tipping are **separate transactions on purpose**. Bundling them
would be one click and one fee — but the deposit is a *public* leg naming the
tipper, so putting it in the same transaction as the transfer lets anyone
correlate the two. Shielding earlier, on its own, is what actually breaks the
link. The 10-block wait and the extra pool fee are the price of that.

This is the single most important design decision in the repo, and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) walks through it.

---

## What the app does

- **PUBLIC / PRIVATE toggle** — the same tip, two paths, side by side
- **Multi-token** — shield any token you hold; the list comes from AVNU's
  verified tokens, filtered to your actual balances
- **Private swaps** — turn a shielded token into shielded STRK via the AVNU SDK
  (their executor + paymaster; the wallet does the proving)
- **Reads no private state** except when you press SHOW — the app never holds a
  viewing key, and never probes balances to feature-detect
- **TX log** — every transaction as it happens, session entries highlighted

---

## Repository map

```
strk20-tipjar-example/
├── TUTORIAL.md                   ← START HERE — the walkthrough, end to end
├── README.md                     ← you are here
├── AGENTS.md                     ← orientation for coding agents (commands, conventions)
├── STRK20_INTEGRATION_PLAN.md    ← the plan the agent skill generated
├── contracts/                    ← Cairo (Scarb + Starknet Foundry) — 11 tests
│   ├── src/tipjar.cairo          ← the TipJar contract (public tipping)
│   ├── src/mock_erc20.cairo      ← test-only ERC-20
│   ├── src/avnu_swap_anonymizer.cairo  ← REFERENCE anonymizer (not audited, not deployed)
│   ├── src/avnu_models.cairo     ← AVNU v2 Route types, vendored
│   └── src/mock_avnu_exchange.cairo    ← test-only AVNU stand-in
├── app/                          ← React + TypeScript + Vite — 16 tests
│   ├── src/config.ts             ← all on-chain addresses live here
│   ├── src/hooks/useTipJar.ts    ← ALL the Starknet wiring (connect, shield, swap, tip)
│   ├── src/lib/tokens.ts         ← token list + batched public balance reads
│   ├── src/lib/tipjar.ts         ← pure helpers: calldata, amounts, event decoding
│   ├── src/lib/errors.ts         ← protocol codes → plain language
│   ├── src/lib/address.ts        ← felt address normalization
│   └── src/components/           ← Stepper, TokenSelect, Pills, TipForm, TxLog…
└── docs/
    ├── ARCHITECTURE.md           ← how the pieces fit; what STRK20 changes
    ├── DEPLOYMENT.md             ← the live mainnet deployment + how to redeploy
    ├── STRK20_INTEGRATION.md     ← the step-by-step integration log (the main event)
    └── ANONYMIZER.md             ← the reference anonymizer, and when you'd need one
```

**Where to look first, by question:**
- *"How does a public tip work end to end?"* → `contracts/src/tipjar.cairo`, then `app/src/hooks/useTipJar.ts`
- *"How is STRK20 added?"* → [`docs/STRK20_INTEGRATION.md`](docs/STRK20_INTEGRATION.md)
- *"How does the private swap work?"* → `privateSwapToStrk` in `app/src/hooks/useTipJar.ts`
- *"What's deployed and where?"* → [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and `app/src/config.ts`

---

## Live mainnet deployment

| | |
| --- | --- |
| Live app | <https://app-chi-three-39.vercel.app> |
| Network | Starknet **mainnet** |
| TipJar contract | [`0x03ade0d0…b8a64f`](https://starkscan.co/contract/0x03ade0d029152e3b52188b5a32eac1f8b6f14d2fc3bdae1b94d9f6c545b8a64f) |
| Class hash | `0x22ee61506d0c146e3eb2f4a6b3665bdc8cc349c45ed280ed690e6145003a039` |
| Creator (tips land here) | `0x06196AFC75E23edc79ecF3982F84dDB9142EcA19CDcE678b42Cface67F063eAa` |
| STRK20 pool | [`0x040337b1…812a`](https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a) |
| STRK token | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |

Full record (tx hashes, tooling notes, how to redeploy your own) in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Quick start

**Prerequisites:** Node 20+, and for the contracts
[Scarb](https://docs.swmansion.com/scarb/) 2.16 + [Starknet
Foundry](https://foundry-rs.github.io/starknet-foundry/) 0.56 (`snforge`/`sncast`).

```bash
cd app
npm install
npm run dev            # http://localhost:5173
```

It talks to the mainnet contract in `app/src/config.ts` out of the box.

**Wallets:** public tips work with any Starknet wallet. **Private tips need a
STRK20-capable wallet — Ready today** (Xverse is in progress; Braavos does not
support STRK20). The app detects this and hides the private path when it is
unavailable.

**Private swaps** additionally need an AVNU paymaster key. Anything bundled into
a browser app is publicly readable, so the key is kept server-side:

- **Locally** — `vite dev` serves no functions, so copy `app/.env.example` to
  `app/.env.local` and set `VITE_AVNU_PAYMASTER_API_KEY`.
- **In production** — set an **unprefixed** `AVNU_PAYMASTER_API_KEY` in your
  host's environment. [`app/api/paymaster.ts`](app/api/paymaster.ts) attaches it
  and forwards to AVNU, so the key never reaches the browser.

```bash
cd contracts && scarb build && snforge test    # 11 passing
cd app && npm test                             # 16 passing
```

**Deploy your own jar** (so tips go to *your* address): see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), then update `app/src/config.ts`.

---

## What to design for

A private flow behaves differently from a public one in a few specific ways.
Build for them and the app feels smooth. [`TUTORIAL.md`](TUTORIAL.md) covers the
UX in full; the short version:

- **A shield is two prompts.** The ERC-20 `approve` must land on-chain before the
  deposit can be proven against it, so the wallet asks twice on a token's first
  shield. Tell the user in advance.
- **Notes mature ~10 blocks** (~20s on mainnet) — after a shield *and* after a
  swap. Show a countdown rather than letting a button fail silently.
- **Every private operation costs a flat pool fee** — 4 STRK on mainnet at time
  of writing. Read it with `get_fee_amount` rather than hardcoding it, and have
  "MAX" reserve it, or the transaction fails after the user has signed.
- **Private actions emit no events.** There is nothing for an activity feed to
  display — say so, so the silence doesn't read as a failure.
- **Read private state only on explicit user action.** Every read is a consent
  prompt; feature-detect with `supportedWalletApi`, never with a balance call.
- **Open notes carry public amounts.** A swap's output lands in one, so crediting
  it straight to a recipient publishes what they received.

Plus standard Starknet practice that private flows surface quickly: give
`waitForTransaction` a ceiling, read `execution_status` (an accepted transaction
can still revert), and normalize felts before comparing — APIs return
`0x4718f5a…` where your config holds `0x04718f5a…`.

---

## What is STRK20? (the 30-second version)

STRK20 is a privacy layer for existing ERC-20s on Starknet. Tokens are
"shielded" into a pool where balances are held as encrypted notes (UTXOs);
private transfers spend and create notes inside the pool, proven with
zero-knowledge proofs and verified on-chain. Deposits and withdrawals (the
pool's edges) are public; movement *inside* the pool — sender, receiver,
amount, token — is private.

For most apps (including this one) the integration route is the **Starknet
Wallet API**: your app asks the user's privacy-enabled wallet to perform a
private action, and the wallet handles keys, notes, and proofs. **No custom Cairo
required** — and that now extends to swaps, since AVNU ships private swaps as a
first-party integration.

Learn more (all pages are also available as raw Markdown for agents):
- Site: <https://strk20-by-example.org/> · index: <https://strk20-by-example.org/llms.txt>
- The STRK20 agent skill (used to build Part 2): <https://strk20-by-example.org/agent-skill>
- AVNU private swaps: <https://docs.avnu.fi/docs/privacy>

---

## License

MIT — see [LICENSE](LICENSE).
