// AVNU swap anonymizer — a private-DeFi helper for STRK20.
//
// ⚠️ REFERENCE ONLY. This contract moves funds. It is adapted from the public
// Ekubo swap-anonymizer reference and tested here only against a mock AVNU
// exchange. It has NOT been audited and MUST NOT be deployed to mainnet without
// a security audit owned by the integrating team. See ../../docs/ANONYMIZER.md.
//
// Purpose: let a tipper pay in ANY token while the creator privately receives
// STRK. The STRK20 pool withdraws the tipper's token to this helper, calls
// `privacy_invoke` atomically, the helper swaps it to STRK on AVNU, and returns
// an `OpenNoteDeposit` so the pool credits STRK into the creator's private note.
// The tipper's address is never revealed to the swap venue.
//
// The AVNU exchange and the output token are PINNED AT DEPLOYMENT, so a deployed
// instance is a fixed, auditable route ("any token -> STRK") rather than an
// arbitrary swap engine. Callers choose only what they are selling.
//
// The pattern is the canonical `privacy_invoke` sandwich:
//   approve the venue → swap → measure output by BALANCE DELTA → approve the
//   pool to pull the output → return Span<OpenNoteDeposit>.

use starknet::ContractAddress;
// AVNU v2's real routing type — verified against avnu-contracts-v2 (see avnu_models).
use crate::avnu_models::Route;

/// Instruction telling the privacy pool which open note to credit, with which
/// token and amount. Layout verified to match the deployed pool's
/// `privacy::objects::OpenNoteDeposit` (starkware-libs/starknet-privacy):
/// `note_id: felt252, token: ContractAddress, amount: u128`. Defined locally so
/// this reference needs no monorepo dependency.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

/// The subset of ERC-20 this helper calls. Real STRK/USDC support these
/// (snake_case) via OpenZeppelin's dual-case ERC-20.
#[starknet::interface]
pub trait IERC20<T> {
    fn approve(ref self: T, spender: ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
}

/// The subset of AVNU's Exchange this helper calls. The `multi_route_swap`
/// signature (params, order, types) and the `Route` type are verified against
/// avnu-contracts-v2 — this interface is ABI-compatible with AVNU's real
/// Exchange. The deployed Exchange address is a constructor parameter.
#[starknet::interface]
pub trait IAvnuExchange<T> {
    fn multi_route_swap(
        ref self: T,
        sell_token_address: ContractAddress,
        sell_token_amount: u256,
        buy_token_address: ContractAddress,
        buy_token_amount: u256,
        buy_token_min_amount: u256,
        beneficiary: ContractAddress,
        integrator_fee_amount_bps: u128,
        integrator_fee_recipient: ContractAddress,
        routes: Array<Route>,
    ) -> bool;
}

#[starknet::interface]
pub trait IAvnuSwapAnonymizer<T> {
    /// Swap `sell_amount` of `sell_token` (already held by this contract, having
    /// been withdrawn here by the pool) into the pinned output token on the
    /// pinned AVNU exchange, and return an `OpenNoteDeposit` crediting the
    /// received output to `note_id`.
    ///
    /// `min_out` is the caller's slippage floor, quoted off-chain via AVNU's
    /// routing API alongside `routes`.
    fn privacy_invoke(
        ref self: T,
        sell_token: ContractAddress,
        sell_amount: u128,
        min_out: u256,
        routes: Array<Route>,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;

    /// The pinned route: (AVNU exchange, output token). Lets integrators and
    /// auditors confirm what a deployed instance is wired to.
    fn get_route(self: @T) -> (ContractAddress, ContractAddress);
}

#[starknet::contract]
pub mod AvnuSwapAnonymizer {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::{
        IAvnuExchangeDispatcher, IAvnuExchangeDispatcherTrait, IAvnuSwapAnonymizer,
        IERC20Dispatcher, IERC20DispatcherTrait, OpenNoteDeposit, Route,
    };

    pub mod errors {
        pub const ZERO_EXCHANGE: felt252 = 'ZERO_EXCHANGE';
        pub const ZERO_OUT_TOKEN: felt252 = 'ZERO_OUT_TOKEN';
        pub const ZERO_SELL_TOKEN: felt252 = 'ZERO_SELL_TOKEN';
        pub const ZERO_SELL_AMOUNT: felt252 = 'ZERO_SELL_AMOUNT';
        pub const SAME_TOKEN: felt252 = 'SAME_TOKEN';
        pub const RECEIVED_AMOUNT_OVERFLOW: felt252 = 'RECEIVED_AMOUNT_OVERFLOW';
        pub const ZERO_OUT_AMOUNT: felt252 = 'ZERO_OUT_AMOUNT';
    }

    #[storage]
    struct Storage {
        // Pinned at deployment — a deployed instance is one fixed, auditable
        // route. Callers cannot redirect the venue or the output token.
        avnu_exchange: ContractAddress,
        out_token: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        avnu_exchange: ContractAddress,
        out_token: ContractAddress,
    ) {
        assert(avnu_exchange.is_non_zero(), errors::ZERO_EXCHANGE);
        assert(out_token.is_non_zero(), errors::ZERO_OUT_TOKEN);
        self.avnu_exchange.write(avnu_exchange);
        self.out_token.write(out_token);
    }

    // Access control: intentionally PERMISSIONLESS (no `caller == pool` assert),
    // matching the stateless Ekubo/Vesu references. Safe because this helper
    // holds no funds between transactions — anything it holds mid-call is pulled
    // by the pool in the same transaction, and a direct caller would only ever
    // swap their own funds into the pinned output token. A STATEFUL helper
    // (e.g. an escrow) MUST instead assert the caller is the privacy pool.
    #[abi(embed_v0)]
    impl AvnuSwapAnonymizerImpl of IAvnuSwapAnonymizer<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            sell_token: ContractAddress,
            sell_amount: u128,
            min_out: u256,
            routes: Array<Route>,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let out_token = self.out_token.read();
            let avnu_exchange = self.avnu_exchange.read();

            assert(sell_token.is_non_zero(), errors::ZERO_SELL_TOKEN);
            assert(sell_amount.is_non_zero(), errors::ZERO_SELL_AMOUNT);
            // Selling the output token is a no-op swap: the caller wants a plain
            // private transfer, not this helper.
            assert(sell_token != out_token, errors::SAME_TOKEN);

            let self_addr = get_contract_address();
            let pool = get_caller_address();
            let sell = IERC20Dispatcher { contract_address: sell_token };
            let buy = IERC20Dispatcher { contract_address: out_token };

            // Let AVNU pull the input the pool withdrew to us.
            sell.approve(avnu_exchange, sell_amount.into());

            // Measure output by balance delta — never trust the venue's return
            // value; credit exactly what actually arrived.
            let balance_before = buy.balance_of(self_addr);
            IAvnuExchangeDispatcher { contract_address: avnu_exchange }
                .multi_route_swap(
                    sell_token,
                    sell_amount.into(),
                    out_token,
                    min_out, // target amount
                    min_out, // minimum (slippage floor)
                    self_addr, // beneficiary — output must land on us
                    0,
                    Zero::zero(),
                    routes,
                );
            let balance_after = buy.balance_of(self_addr);

            let out_amount: u128 = (balance_after - balance_before)
                .try_into()
                .expect(errors::RECEIVED_AMOUNT_OVERFLOW);
            assert(out_amount.is_non_zero(), errors::ZERO_OUT_AMOUNT);

            // Approve the pool to pull the output when it applies the deposit.
            buy.approve(pool, out_amount.into());
            [OpenNoteDeposit { note_id, token: out_token, amount: out_amount }].span()
        }

        fn get_route(self: @ContractState) -> (ContractAddress, ContractAddress) {
            (self.avnu_exchange.read(), self.out_token.read())
        }
    }
}
