# Adding STRK20 privacy — step by step (Part 2)

> **Status: 🚧 not started yet.** This document is the plan and will become the
> blow-by-blow log as the integration is built. The goal is that a developer can
> follow it and understand *exactly* how STRK20 was added to an existing app —
> every command, decision, and gotcha.

## Goal

Add a **"Tip privately"** action to the tip jar so a tipper can support the
creator **without any public link** between them — while leaving the existing
public tip path untouched.

## Approach (and why)

Route: the **Starknet Wallet API** (via starknet.js), the standard path for
private dapps. The app asks the user's privacy-enabled wallet to perform a
**pool-internal private transfer** to the creator's registered wallet; the
wallet handles viewing keys, notes, proofs, and submission.

Why this route:
- A private tip is conceptually just "pay the creator privately" — a **private
  transfer to a wallet**, which is a pure Wallet-API primitive. **No custom
  Cairo / anonymizer contract is required** (those are only needed when a
  contract must custody or transform value privately, e.g. private DeFi).
- It keeps the example genuinely simple, which is the whole point.

Reference: <https://strk20-by-example.org/starknet-wallet-api/overview>
(agent-readable: <https://strk20-by-example.org/llms.txt>).

## Invariants (must hold when done)

- The private path **does not call the `TipJar` contract** and **emits no
  `Tipped` event** → private tips never appear in the "LATEST TIPS" wall.
- The public `sendTip` path keeps working unchanged.
- **No key material in the repo** — viewing/private keys and secrets are handled
  wallet-side or via env placeholders only.
- Testnet first; any mainnet-affecting change is explicit.

## What's hidden vs. visible (be honest in the UI)

- **Hidden:** the tipper↔creator link and the private transfer amount.
- **Visible:** the pool's public edges (a shield deposit or withdraw are public
  ERC-20 legs) and timing.

## Plan of record

The integration will be built with the **STRK20 agent skill**, which scans the
repo, interviews for the specifics, writes a versioned plan, and executes it:

```bash
npx skills add starkience/strk20-agent-skills
# then, in the repo:  "plan STRK20 privacy for this app"
```

<https://strk20-by-example.org/agent-skill>

### Prerequisites (to fill in)
- [ ] Choose the privacy-enabled wallet to target (deferred — decide at build time).
- [ ] Creator registers in the STRK20 pool (one-time, wallet-side).

### Steps (to be logged as we go)
1. [ ] Install the agent skill and run its planning flow; capture the interview Q&A.
2. [ ] Review the generated `STRK20_INTEGRATION_PLAN.md` (route, files, hidden-vs-visible).
3. [ ] Add the "Tip privately" action (capability-detect the wallet; shield if needed; private transfer to the creator).
4. [ ] Verify: public path unchanged; private tip does not appear in the wall; `npm test`/`npm run build` pass.
5. [ ] Send a real private tip; record the evidence (what an observer can and cannot see).

### Evidence (to fill in)
- Wallet used: _tbd_
- Generated plan: _tbd_
- Private tip result / what's visible on-chain vs. in the creator's wallet: _tbd_

---

*As each step is completed, replace its checkbox with the actual commands run,
decisions made, and any gotchas — the same way [`DEPLOYMENT.md`](DEPLOYMENT.md)
records Part 1.*
