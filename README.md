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

---

## Status

| Part | What | State |
| --- | --- | --- |
| **Part 1 — Public tip jar** | Cairo contract + React frontend, deployed on mainnet | ✅ Done (this codebase) |
| **Part 2 — STRK20 privacy** | A "Tip privately" path via the STRK20 Wallet API | 🚧 Next — documented step-by-step in [`docs/STRK20_INTEGRATION.md`](docs/STRK20_INTEGRATION.md) |

The point of the repo is Part 2. Part 1 exists so there is a real, working app
to add privacy *to* — and so the "everything is public" problem is concrete.

---

## The idea in one screen

A tip jar has one on-chain action: **tip the creator**.

- **Public tip (Part 1):** calls `tip()` on the `TipJar` contract, which
  forwards STRK from the tipper straight to the creator and emits a `Tipped`
  event. Anyone can see *who tipped whom, how much, and when.*
- **Private tip (Part 2):** a **pool-internal private transfer** to the
  creator via the STRK20 Wallet API. It never touches the `TipJar` contract and
  emits no event — only the creator's wallet sees it.

That's the whole lesson: the public path and the private path deliver the same
value to the creator, but the private one leaves no public link between tipper
and creator.

```
PUBLIC   Tipper ──approve+tip──▶ TipJar ──transfer_from──▶ Creator
         (tipper, amount, time all public; shows in "LATEST TIPS")

PRIVATE  Tipper ──▶ STRK20 pool ──private transfer──▶ Creator
         (observers see only "someone used the pool"; not in "LATEST TIPS")
```

---

## Repository map

```
strk20-tipjar-example/
├── README.md                     ← you are here
├── AGENTS.md                     ← orientation for coding agents (build/test/deploy, conventions)
├── contracts/                    ← Cairo (Scarb + Starknet Foundry)
│   ├── src/tipjar.cairo          ← the TipJar contract (public tipping)
│   ├── src/mock_erc20.cairo      ← test-only ERC-20 used in unit tests
│   ├── tests/                    ← snforge tests (7 passing)
│   └── README.md                 ← contract details + deploy commands
├── app/                          ← React + TypeScript + Vite frontend
│   ├── src/config.ts             ← all on-chain addresses live here
│   ├── src/hooks/useTipJar.ts    ← ALL the Starknet wiring (connect, read, tip)
│   ├── src/lib/tipjar.ts         ← pure helpers: calldata, event decoding, STRK math
│   ├── src/components/           ← TipForm, TipWall
│   └── README.md                 ← frontend details
└── docs/
    ├── ARCHITECTURE.md           ← how the pieces fit; what STRK20 changes
    ├── DEPLOYMENT.md             ← the live mainnet deployment (addresses, tx hashes, how to redeploy)
    └── STRK20_INTEGRATION.md     ← Part 2: step-by-step log of adding STRK20 (the main event)
```

**Where to look first, by question:**
- *"How does a public tip work end to end?"* → `contracts/src/tipjar.cairo`, then `app/src/hooks/useTipJar.ts`.
- *"How is STRK20 added?"* → `docs/STRK20_INTEGRATION.md`.
- *"What's deployed and where?"* → `docs/DEPLOYMENT.md` and `app/src/config.ts`.

---

## Live mainnet deployment (Part 1)

| | |
| --- | --- |
| Network | Starknet **mainnet** |
| TipJar contract | [`0x03ade0d0…b8a64f`](https://starkscan.co/contract/0x03ade0d029152e3b52188b5a32eac1f8b6f14d2fc3bdae1b94d9f6c545b8a64f) |
| Class hash | `0x22ee61506d0c146e3eb2f4a6b3665bdc8cc349c45ed280ed690e6145003a039` |
| STRK token | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |

Full record (tx hashes, gotchas, how to redeploy your own) in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Quick start

**Prerequisites:** Node 20+, and for the contracts
[Scarb](https://docs.swmansion.com/scarb/) 2.16 + [Starknet
Foundry](https://foundry-rs.github.io/starknet-foundry/) 0.56 (`snforge`/`sncast`).

**Run the frontend against the existing mainnet jar:**

```bash
cd app
npm install
npm run dev            # http://localhost:5173
```

Connect a Starknet wallet (Braavos / Ready) and send a tip. It talks to the
mainnet contract in `app/src/config.ts` out of the box.

**Build & test the contracts:**

```bash
cd contracts
scarb build
snforge test          # 7 passing
```

**Deploy your own jar** (so tips go to *your* address): see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), then update `app/src/config.ts`.

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
private action, and the wallet handles keys, notes, and proofs. No custom Cairo
required.

Learn more (all pages are also available as raw Markdown for agents):
- Site: <https://strk20-by-example.org/>
- Agent-readable index: <https://strk20-by-example.org/llms.txt>
- The STRK20 agent skill (used to build Part 2): <https://strk20-by-example.org/agent-skill>

---

## License

MIT — see [LICENSE](LICENSE).
