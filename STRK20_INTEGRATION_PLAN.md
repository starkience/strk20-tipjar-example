# STRK20 Privacy Integration Plan — strk20-tipjar-example

Generated 2026-07-24 by the strk20-privacy-integration skill. Statuses below were
current at generation time — re-verify the "coming soon" items before building
against them.

## 1. Project snapshot

- **Stack:** Vite + React 19 + TypeScript frontend; `starknet` **10.0.2**;
  `get-starknet` **4.0.0**; Cairo contracts present (`contracts/` — `TipJar`, a
  non-DeFi contract that just forwards STRK); no backend; tests: `snforge`
  (contracts) + `vitest` (frontend helpers).
- **Relevant code:**
  - Wallet connection: `app/src/hooks/useTipJar.ts:24` (`connect()` from
    get-starknet v4, then `WalletAccount.connect`).
  - Transaction layer: `app/src/hooks/useTipJar.ts:62` (`account.execute(calls)`).
  - Tip UI + handler: `app/src/components/TipForm.tsx`, `app/src/App.tsx`
    (`handleTip`).
  - Addresses/config: `app/src/config.ts` (`ownerAddress` = the creator).
- **Privacy goal (from interview):** add a **"Tip privately"** action — a
  pool-internal **private transfer to the creator** (`CONFIG.ownerAddress`) —
  hiding the tipper↔creator link and the amount. The existing public tip path
  is unchanged.
- **Environment:** **mainnet** (the public jar is already on mainnet). Test
  wallet: **Ready** extension.

## 2. Chosen route: Privacy Wallet API via starknet.js

Normal dapp relying on the user's wallet → the dapp asks the user's
privacy-enabled wallet to perform the private transfer; the wallet handles keys,
notes, proving, and the pool. **No anonymizer contract** — a private transfer to
a wallet is a pure Wallet-API primitive, so this needs app code only.

**The rule this follows:** this app **never touches viewing keys** — the user's
Ready wallet acts on its behalf via starknet.js.

## 3. What this delivers — hidden vs visible

| Private (inside the pool) | Public (visible onchain) |
|---|---|
| That the tipper paid **this creator** (the tipper↔creator link) | If the tipper must **shield** STRK first, that deposit amount (a public ERC-20 leg) |
| The **amount** of the private tip | The fact that an address interacted with the pool, and timing |
| Which notes were spent | Any later **unshield** amount, if the creator withdraws |

Honest limit: the private tip hides **who tipped the creator and how much**. If
the tipper funds it by shielding STRK, that shield is a public deposit into the
pool from the tipper's address — it shows they used the pool, **not who they
paid**. Private tips **never call `TipJar` and emit no `Tipped` event**, so they
never appear in the public "LATEST TIPS" wall.

## 4. Prerequisites & versions

- `starknet@10.4.0` — upgrade from **10.0.2** (ships `WalletAccountV6` with
  STRK20 actions; on the npm `next` tag — `latest` is still 10.0.x). Migration
  task; see Phase 1.
- `@starknet-io/get-starknet-discovery@6.0.2`,
  `@starknet-io/get-starknet-wallet-standard@6.0.2` (npm `next` tag — pin
  explicitly; this replaces the current `get-starknet@4.0.0`).
- `@starknet-io/types-js@0.10.3`
- Test wallet: **Ready** extension (STRK20-capable). Braavos is **not**
  supported for STRK20; Xverse is in progress.
- Verified on npm 2026-07-24: `starknet` next=10.5.2 (10.4.0 available),
  get-starknet-discovery next=6.0.2, wallet-standard 6.0.2, types-js 0.10.3 — all
  pins hold.

## 5. Phase 1 — wallet upgrade + capability-aware connection ✅ done 2026-07-24

1. Install the pinned versions above (replaces `get-starknet@4`; bumps
   `starknet` to 10.4.0).
2. Migrate the connection in `app/src/hooks/useTipJar.ts` from get-starknet v4
   `connect()` to **get-starknet v6 discovery + `WalletAccountV6`**. **Fetch the
   WalletAccount guide for the exact current API before writing code — do not
   guess method names:**
   <https://starknet-js.com/docs/next/guides/account/walletAccount/#with-get-starknet-v6>
3. **Capability detection (no balance access):** check the wallet's advertised
   Wallet-API versions via `walletV6.supportedWalletApi(wallet)` and treat
   >= 0.10 as STRK20-capable. Deliberately **not** a `strk20Balances` probe —
   the dapp should never touch a user's balances/keys just to feature-detect.
4. **Graceful degradation:** with a non-privacy wallet (e.g. Braavos), the
   public tip keeps working and "Tip privately" is hidden/disabled with a
   "needs a privacy-enabled wallet (Ready)" note.
5. Headless verify: `npm install` clean, `npm run build` (typecheck) passes,
   `npm test` passes.
6. **Manual check (you):** connect Ready via the app; confirm the private action
   appears with Ready and is hidden with a non-privacy wallet.

## 6. Phase 2 — the "Tip privately" action ✅ built 2026-07-24, verified on mainnet 2026-07-27

> ⚠️ **This phase was planned one way and shipped another.** The change is the
> most important lesson in the project, so the original text is kept below
> rather than quietly rewritten. **Build from step 2b, not 2a.**

1. Add a **"Tip privately"** button in `app/src/components/TipForm.tsx`
   alongside the public "INSERT TIP", wired through a new handler in
   `app/src/App.tsx` / `useTipJar` (kept separate from `sendTip`).

2a. ~~Wire the private tip via `WalletAccountV6.strk20InvokeTransaction([...])`
   as a **batched `deposit` + `transfer`**: shield exactly the tip amount from
   public STRK, then privately transfer it to `CONFIG.ownerAddress`. This sources
   the tip from public STRK every time, so the app never reads the tipper's
   shielded balance.~~ **Superseded — do not build this.**

   The plan treated batching as a *technical* question ("can a freshly-deposited
   note be spent in the same transaction?"). Execution showed the real question
   is a *privacy* one, and the answer makes the technical one moot:

   **A deposit is a public leg that names the tipper.** Put it in the same
   transaction as the private transfer and any observer can correlate the two
   ends — you pay the pool fee and get no unlinkability. Batching would have
   produced a demo that looks private and is not.

2b. **Shipped design — two independent user actions.** The tipper shields
   *earlier, on its own* (`shield`, a lone `deposit` action), waits for the note
   to mature, and later sends a lone `transfer` action to `CONFIG.ownerAddress`.
   Separating them in *time*, not just in code, is what actually breaks the link.

   The cost is real and worth naming: an extra transaction, an extra pool fee,
   and a ~10-block wait. That is the price of unlinkability, not overhead to
   optimise away. See `TUTORIAL.md` → "The design decision that makes it actually
   private", and `app/src/hooks/useTipJar.ts` (`shield`, `sendPrivateTip`).

   Least privilege is preserved differently: `sendPrivateTip` sends only a
   `transfer`, and shielded balances are read **only** when the user presses
   SHOW — never on a timer, never to feature-detect.

3. **Invariant:** the private path does **not** call `TipJar` and emits no
   `Tipped` event → it never appears in "LATEST TIPS". Add honest UI copy near
   the wall: *"Private tips don't appear here — only the creator's wallet sees
   them."*
4. Reuse the existing coin-flip/sound feedback on a confirmed private tip.
5. Fee UX: wallet flows currently sponsor gas but **not** pool fees; re-check the
   fee experience at build time (don't hardcode a fee UX).
6. Headless verify (as Phase 1) + **Manual check (you):** see §8.

## 7. Phase 3 — creator-facing private total (tracked, optional)

- Not in the approved scope (you chose the minimal private-transfer path).
- Entry criterion / open design: a creator-facing view of received private tips
  would use a **wallet-mediated** shielded-balance read (`strk20Balances`) — the
  dapp still never sees a viewing key. Depends on what the Ready extension
  exposes to dapps; design when/if desired.
- **Sub-accounts** (hide the tipper's main-wallet↔activity link) are **coming
  soon** — nothing builder-facing yet; tracked, not built.

## 8. Testing

Mainnet-first (your choice); each real mainnet send gets an explicit go-ahead at
that moment. Headless gates: clean `npm install`, `npm run build`, `npm test`.

Manual (Wallet API route):
- [x] Connect with the **Ready** extension — the app discovers it via
      get-starknet v6.
- [x] Capability check: the private action appears with Ready and degrades
      gracefully with a non-privacy wallet. Detection uses
      `supportedWalletApi` (≥ 0.10.3), **not** a balance probe.
- [x] **Shield** into the pool. Done for STRK and USDC; a shield is two prompts
      on a token's first use (the ERC-20 `approve` must land before the deposit
      can be proven against it). A screening decline is a protocol outcome to
      surface in UX, not an app bug.
- [x] **Tip privately** → private transfer to the creator
      (`CONFIG.ownerAddress`), sent as its own transaction after the note
      matured.
- [x] Confirm the **creator's Ready wallet** shows the received private balance,
      **and** that the public "LATEST TIPS" wall does **not** show it.
      **Result: 42 STRK received privately (+20, +20, +1, +1) while the public
      counter stayed at 3 tips / 3 STRK.** Full evidence in
      [`docs/STRK20_INTEGRATION.md`](docs/STRK20_INTEGRATION.md).
- [x] Cross-check anything odd against the wallet test dapp:
      <https://starknet-wallet-account.vercel.app/>

Note: no testnet STRK20 pool is assumed (re-verify in §10); the real private
transfer is exercised on mainnet.

## 9. Compliance & security notes

- **Deposit screening** is enforced onchain by the protocol and applies here; a
  shield can be declined by screening — surface it in UX rather than treating it
  as a bug.
- **Selective disclosure** exists for legitimate regulatory requests; it is not
  automatic compliance and carries no regulator endorsement. App-level legal/KYC
  decisions remain yours.
- **No key material in the repo** — the wallet holds keys; the dapp only asks it
  to act.

## 10. Open items — and what execution answered

> **Resolved during execution.** Kept as questions-with-answers, because what
> the plan could not know up front is the useful part.

- **Exact `WalletAccountV6` method/action names.** ✅ `strk20InvokeTransaction(actions)`
  with `STRK20_ACTION` from `@starknet-io/types-js` — `deposit`, `transfer`,
  `withdraw`, `invoke`. Taken from the installed types, not guessed.
- **Does a testnet STRK20 pool exist?** ✅ Yes — Sepolia
  `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91`.
  **But it does not straightforwardly open a safer path for *this* route.** On
  the Wallet API route the dapp never passes a pool address — `shield` and
  `sendPrivateTip` send actions only, and the *wallet* selects the pool for its
  connected network. That address comes from the **wallet-builder SDK** docs,
  where you configure the pool yourself. So a Sepolia path here depends on
  **Ready supporting STRK20 on Sepolia**, not on the dapp's config. See
  `docs/DEPLOYMENT.md` → "Running on Sepolia" for what is and is not verified.
- **Ready's dapp-facing behavior.** ✅ Capability detection via
  `supportedWalletApi` (≥ 0.10.3). It *does* expose shielded balances through
  `strk20Balances`, gated behind a per-call user consent prompt — which is why
  the app reads them only on an explicit SHOW press.
- **Xverse** dapp-facing Wallet API status: still in progress; unchanged.
  **Fee/paymaster UX:** ✅ designed — the flat pool fee is reserved by the MAX
  shortcut and reported rather than predicted (the split varies by token).
  AVNU's paymaster sponsors gas on private swaps, proxied server-side via
  `app/api/paymaster.ts` so the API key never ships in the bundle.
- **Deposit+transfer batching.** ✅ **Resolved as a privacy decision, not a
  technical one.** See §6.2a/2b — batching was abandoned because a deposit is a
  public leg naming the tipper. Shield separately, earlier.
- get-starknet **v6 import surface** vs the current v4 usage in
  `useTipJar.ts` (breaking migration). ✅ resolved in Phase 1: `createStore`
  from `@starknet-io/get-starknet-discovery`; `WalletWithStarknetFeatures` from
  `@starknet-io/get-starknet-wallet-standard/features`;
  `WalletAccountV6`/`strk20Balances`/`strk20InvokeTransaction` from `starknet`.
- Build warning (non-fatal): a get-starknet v6 transitive dep
  (`@module-federation/sdk`) uses direct `eval`; surfaces as a bundler advisory,
  not an error. Track upstream; no action needed.
- Phase 1 auto-connects when exactly one wallet is discovered and shows a picker
  for multiple; a wallet that registers late may need a re-click of CONNECT
  (get-starknet `store.subscribe` polish is a possible follow-up).

## 11. Links

- Wallet API route (overview): <https://strk20-by-example.org/starknet-wallet-api/overview>
- starknet.js `WalletAccountV6` wiring: <https://strk20-by-example.org/starknet-wallet-api/starknet-js>
- React `useStrk20` hooks: <https://strk20-by-example.org/starknet-wallet-api/starknet-start-hook>
- WalletAccount guide (fetch for the current API): <https://starknet-js.com/docs/next/guides/account/walletAccount/#with-get-starknet-v6>
- What is STRK20 / the pool model: <https://strk20-by-example.org/what-is-strk20>
- Hidden-vs-visible & compliance: <https://strk20-by-example.org/compliance>
- STRK20 pool (mainnet): <https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a>
- Privacy SDK monorepo (reference, Apache 2.0): <https://github.com/starkware-libs/starknet-privacy>
- Pinned versions: `starknet@10.4.0`, `@starknet-io/get-starknet-discovery@6.0.2`, `@starknet-io/get-starknet-wallet-standard@6.0.2`, `@starknet-io/types-js@0.10.3`.
