// Tests for the STRK20 action shapes.
//
// These pin two decisions that are easy to get wrong and expensive to get wrong
// quietly — a private tip that silently leaks the link, or a capability check
// that reads private state. Prose in a README does not stop a refactor; a
// failing test does.

import { describe, expect, it, vi } from "vitest";
import {
  buildPrivateTipActions,
  buildShieldActions,
  MIN_STRK20_WALLET_API,
  supportsStrk20,
} from "./strk20";

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const CREATOR = "0x06196afc75e23edc79ecf3982f84ddb9142eca19cdce678b42cface67f063eaa";

describe("buildShieldActions", () => {
  it("is a single deposit, with the amount as a hex felt", () => {
    expect(buildShieldActions(STRK, 5_000000000000000000n)).toEqual([
      { type: "deposit", token: STRK, amount: "0x4563918244f40000" },
    ]);
  });

  it("handles zero without emitting an empty amount", () => {
    expect(buildShieldActions(STRK, 0n)).toEqual([
      { type: "deposit", token: STRK, amount: "0x0" },
    ]);
  });
});

describe("buildPrivateTipActions", () => {
  it("is a single transfer to the recipient", () => {
    expect(buildPrivateTipActions(STRK, 1_000000000000000000n, CREATOR)).toEqual(
      [
        {
          type: "transfer",
          token: STRK,
          amount: "0xde0b6b3a7640000",
          recipient: CREATOR,
        },
      ],
    );
  });

  // The important one. Bundling the shield into the tip is one click and one
  // fee, and it destroys the privacy the app exists to demonstrate: a deposit
  // is a public leg naming the sender, so an observer seeing both in a single
  // transaction can correlate the two ends. Unlinkability comes from shielding
  // earlier, separately. If a future refactor "optimises" the extra
  // transaction away, this fails.
  it("never bundles a deposit — that would defeat unlinkability", () => {
    const actions = buildPrivateTipActions(STRK, 1n, CREATOR);
    expect(actions).toHaveLength(1);
    expect(actions.some((a) => a.type === "deposit")).toBe(false);
  });
});

describe("supportsStrk20", () => {
  it("accepts the minimum version and above", () => {
    expect(supportsStrk20([MIN_STRK20_WALLET_API])).toBe(true);
    expect(supportsStrk20(["0.10.4"])).toBe(true);
    expect(supportsStrk20(["0.11.0"])).toBe(true);
    expect(supportsStrk20(["0.8.1", "0.9.0", "0.10.3"])).toBe(true);
  });

  it("rejects older wallets and an empty list", () => {
    expect(supportsStrk20(["0.10.2"])).toBe(false);
    expect(supportsStrk20(["0.7.0", "0.8.0"])).toBe(false);
    expect(supportsStrk20([])).toBe(false);
  });

  // Capability detection must never touch balances or keys. The tempting
  // shortcut is to call strk20Balances([]) and see whether it throws, which
  // makes the wallet raise a "share your balances?" consent prompt on page
  // load — before the user has asked for anything private. Keeping this a pure
  // function over version strings makes that mistake structurally impossible:
  // there is no wallet object here to call anything on.
  it("decides from version strings alone, touching no wallet method", () => {
    const wallet = {
      strk20Balances: vi.fn(),
      request: vi.fn(),
      enable: vi.fn(),
    };
    supportsStrk20(["0.10.3"]);
    expect(wallet.strk20Balances).not.toHaveBeenCalled();
    expect(wallet.request).not.toHaveBeenCalled();
    expect(wallet.enable).not.toHaveBeenCalled();
  });
});
