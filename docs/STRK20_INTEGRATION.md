# Adding STRK20 privacy — step by step (Part 2)

> **Status: 🚧 in progress.** This is the running log of how STRK20 privacy is
> added to the app, built **with the STRK20 agent skill**. It records the actual
> commands, decisions, and gotchas so a developer can reproduce the process.

## Goal

Add a **"Tip privately"** action so a tipper can support the creator **without
any public link** between them — leaving the existing public tip path untouched.

## The tool: the STRK20 agent skill

The integration is driven by the official **STRK20 agent skill**, an
"ask → plan → execute" skill that inspects the repo, interviews the developer,
picks an integration route, writes a repo-specific plan, and executes it phase
by phase. Crucially, it works on **app code only — it never writes Cairo
contracts** (our private path needs none).

### Install

```bash
npx skills add starkience/strk20-agent-skills
```

This installs a universal skill to `.agents/skills/strk20-privacy-integration/`
(with a symlink into `.claude/skills/` for Claude Code), containing `SKILL.md`
plus references (`concepts.md`, `wallet-api-route.md`, `links.md`,
`plan-template.md`, `execute.md`, …). The installer targets 30+ agents and
reports third-party security assessments before installing.

Source & docs: <https://strk20-by-example.org/agent-skill> ·
<https://github.com/starkience/strk20-agent-skills>

> Note: `.agents/` and `.claude/` are the installed-skill machinery, not part of
> the example itself — they're git-ignored so the repo stays focused on the app.

## Step 1 — Scan (what the skill detected)

- **Type:** normal dapp; users connect their own wallet. No backend; no DeFi
  contracts (the `TipJar` contract just forwards STRK).
- **Frontend:** Vite + React 19 + TS. Wallet connect at
  `app/src/hooks/useTipJar.ts:24`; tx send at `useTipJar.ts:62`
  (`account.execute`); addresses in `app/src/config.ts`.
- **Version gap:** repo is on `starknet@10.0.2` / `get-starknet@4.0.0`; the
  Wallet-API route needs `starknet@10.4.0` + get-starknet v6.0.2 + types-js
  0.10.3.

## Step 2 — Interview (developer answers)

| Question | Answer |
|---|---|
| Privacy goal | **Private transfer to the creator** — hide the tipper↔creator link and the amount; public tips unchanged. |
| Network | **Mainnet first** (the public jar is already on mainnet; each real send gets explicit confirmation). |
| Wallet | **Ready extension** (the STRK20-capable wallet; Braavos is not supported). |

## Step 3 — Route

**Privacy Wallet API via starknet.js** — the standard route for a normal dapp.
The wallet performs the private transfer; the dapp never touches viewing keys.
**No anonymizer contract** (a private transfer to a wallet is a pure Wallet-API
primitive). Reference: <https://strk20-by-example.org/starknet-wallet-api/overview>.

## Step 4 — Plan

The skill wrote **[`STRK20_INTEGRATION_PLAN.md`](../STRK20_INTEGRATION_PLAN.md)**
to the repo root — repo-specific, versioned, phased, with an honest
hidden-vs-visible table. Phases:

1. **Phase 1** — upgrade to get-starknet v6 + `starknet@10.4.0`; capability-aware
   connection with graceful degradation for non-privacy wallets.
2. **Phase 2** — the "Tip privately" action: a private transfer to the creator,
   kept separate from the public path; never emits a `Tipped` event, so it never
   shows in "LATEST TIPS".
3. **Phase 3** — (optional/tracked) creator-facing private total; sub-accounts
   when they become builder-facing.

## Step 5 — Execute

> ✅ **Complete and verified on mainnet.** Plan approved; phases executed one at
> a time, each ending with a manual wallet check. The private-tip evidence is
> recorded below.

### Log (filled as phases complete)

- [x] **Phase 1 — wallet upgrade + capability-aware connection** ✅ 2026-07-24
  - Upgraded `starknet@10.0.2 → 10.4.0`; replaced `get-starknet@4` with
    `@starknet-io/get-starknet-discovery@6.0.2` +
    `@starknet-io/get-starknet-wallet-standard@6.0.2` + `@starknet-io/types-js@0.10.3`.
  - Migrated `app/src/hooks/useTipJar.ts` to get-starknet v6 discovery
    (`createStore().getWallets()`) + `WalletAccountV6.connect(provider, wallet)`.
    The public tip path is unchanged — `WalletAccountV6` inherits `execute`.
  - Added runtime **capability detection** and graceful degradation: a wallet
    picker for multiple wallets, and a status line (private available vs.
    public-only) in `App.tsx`.
  - **Design note (privacy):** capability detection uses
    `walletV6.supportedWalletApi(wallet)` (a "which Wallet-API versions do you
    support?" query, ≥ 0.10 = STRK20-capable) — **not** a `strk20Balances`
    probe. A dapp should never touch a user's balances or keys just to
    feature-detect; the wallet-API version check reads no private data.
  - Verified headlessly: `npm run build` (typecheck) passes, `npm test` 6/6.
    (Non-fatal: a get-starknet transitive dep triggers a bundler `eval` advisory.)
  - **Manual check pending** — see below.
- [x] **Phase 2 — "Tip privately" private transfer** ✅ built 2026-07-24
      (live mainnet verification pending)
  - Added `sendPrivateTip` in `app/src/hooks/useTipJar.ts`: a batched
    **`deposit` + `transfer`** via `WalletAccountV6.strk20InvokeTransaction`.
    It shields exactly the tip amount from public STRK, then privately transfers
    it to `CONFIG.ownerAddress` inside the pool. Sourcing from public STRK every
    time means **the app never reads the tipper's shielded balance** — only the
    `deposit` and `transfer` actions are used (least privilege).
  - The private path calls **no contract** and emits **no `Tipped` event**, so it
    never appears in the tip wall. `TipWall` now carries an honest note:
    *"Private tips don't appear here — only the creator's wallet sees them."*
  - UI: a **🔒 TIP PRIVATELY** button in `TipForm`, rendered only when the
    connected wallet is STRK20-capable (`privacySupported`). Public tipping is
    untouched. Marquee/footer updated to describe both modes honestly.
  - Exact action shapes taken from the installed types
    (`@starknet-io/types-js` → `STRK20_DEPOSIT_ACTION` / `STRK20_TRANSFER_ACTION`);
    method names from the WalletAccount guide — **no guessing**, per the skill.
  - Verified headlessly: `npm run build` (typecheck) passes, `npm test` 6/6.
  - **Open item (verify live):** whether a freshly-deposited note is spendable by
    the transfer in the *same* transaction, or shield + transfer must be two
    requests. Validated in the manual mainnet check below.
- [x] **Evidence — verified on mainnet 2026-07-27**

      The creator's wallet (Ready) shows four **private receives** — +20, +20,
      +1 and +1 STRK, 42 STRK in total — alongside one ordinary public "Tip" of
      1 STRK.

      The public chain, for the same period, shows **only three `Tipped`
      events** totalling 3 STRK, and `get_total()` on the jar still returns
      `(3 STRK, 3 tips)`.

      So 42 STRK reached the creator with **no public trace**: the private tips
      never touched the contract, emitted no event, and never appeared in the
      "LATEST TIPS" wall. That contrast — a wall that stays frozen while the
      creator is actually being paid — is the whole point of the repo.

      One honest detail: the creator's wallet *does* show the sender
      ("From 0x6f5e…80ca"). Private transfers run over a directional channel, so
      the **recipient** can see who paid them — which is what you want for a tip
      jar. What is hidden is that no third party can.

## Going further — private swap-tips (anonymizer contract)

A plain private transfer needs no Cairo. But "tip in one token, creator receives
another" (a private *swap*) crosses into **private DeFi**, which needs an
**anonymizer contract**. That advanced, reference-only module lives in
`contracts/src/avnu_swap_anonymizer.cairo` with its own writeup:
[`ANONYMIZER.md`](ANONYMIZER.md). It's built and unit-tested against a mock AVNU,
**not audited, and not deployed** — the boundary where "app code only" ends and a
team-owned, audited contract begins.

## Using the skill (recap for readers)

This whole Part 2 was produced by the **STRK20 agent skill** following its
`SKILL.md` loop — Scan → Ask → Route → Plan → Execute — with a manual wallet
check at each phase boundary. The skill's guardrails shaped the result: **app
code only (no Cairo), no key material in files, capability-detect without
reading balances, and honest hidden-vs-visible copy.** One real correction
during the build (a balance-probe used for capability detection) was fixed both
here and upstream in the skill itself.
