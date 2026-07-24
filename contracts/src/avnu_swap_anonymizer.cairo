// AVNU swap anonymizer — a private-DeFi helper for STRK20.
//
// ⚠️ REFERENCE ONLY. This contract moves funds. It is adapted from the public
// Ekubo swap-anonymizer reference and tested here only against a mock AVNU
// exchange. It has NOT been audited and MUST NOT be deployed to mainnet without
// a security audit owned by the integrating team. See ../../docs/ANONYMIZER.md.
//
// Purpose: let a private tip land in a different token. The STRK20 pool withdraws
// the input token to this helper, calls `privacy_invoke` atomically, the helper
// swaps input → output on AVNU, and returns an `OpenNoteDeposit` so the pool
// credits the output back into a private note for the creator. The tipper's
// address is never revealed to the swap venue.
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
/// Exchange. The deployed Exchange address is a per-network integration input.
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
    /// been withdrawn here by the pool) into `buy_token` on AVNU, and return an
    /// `OpenNoteDeposit` crediting the received output to `note_id`.
    fn privacy_invoke(
        ref self: T,
        avnu_exchange: ContractAddress,
        sell_token: ContractAddress,
        sell_amount: u128,
        buy_token: ContractAddress,
        buy_min_amount: u256,
        routes: Array<Route>,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;
}

#[starknet::contract]
pub mod AvnuSwapAnonymizer {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use super::{
        IAvnuExchangeDispatcher, IAvnuExchangeDispatcherTrait, IAvnuSwapAnonymizer,
        IERC20Dispatcher, IERC20DispatcherTrait, OpenNoteDeposit, Route,
    };

    pub mod errors {
        pub const ZERO_EXCHANGE: felt252 = 'ZERO_EXCHANGE';
        pub const ZERO_SELL_TOKEN: felt252 = 'ZERO_SELL_TOKEN';
        pub const ZERO_BUY_TOKEN: felt252 = 'ZERO_BUY_TOKEN';
        pub const ZERO_SELL_AMOUNT: felt252 = 'ZERO_SELL_AMOUNT';
        pub const RECEIVED_AMOUNT_OVERFLOW: felt252 = 'RECEIVED_AMOUNT_OVERFLOW';
        pub const ZERO_OUT_AMOUNT: felt252 = 'ZERO_OUT_AMOUNT';
    }

    #[storage]
    struct Storage {}

    // Access control: intentionally PERMISSIONLESS (no `caller == pool` assert),
    // matching the stateless Ekubo/Vesu references. Safe because this helper
    // holds no funds between transactions — anything it holds mid-call is pulled
    // by the pool in the same transaction, and a direct caller would only ever
    // swap their own funds. A STATEFUL helper (e.g. an escrow) MUST instead
    // assert the caller is the privacy pool.
    #[abi(embed_v0)]
    impl AvnuSwapAnonymizerImpl of IAvnuSwapAnonymizer<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            avnu_exchange: ContractAddress,
            sell_token: ContractAddress,
            sell_amount: u128,
            buy_token: ContractAddress,
            buy_min_amount: u256,
            routes: Array<Route>,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            assert(avnu_exchange.is_non_zero(), errors::ZERO_EXCHANGE);
            assert(sell_token.is_non_zero(), errors::ZERO_SELL_TOKEN);
            assert(buy_token.is_non_zero(), errors::ZERO_BUY_TOKEN);
            assert(sell_amount.is_non_zero(), errors::ZERO_SELL_AMOUNT);

            let self_addr = get_contract_address();
            let pool = get_caller_address();
            let sell = IERC20Dispatcher { contract_address: sell_token };
            let buy = IERC20Dispatcher { contract_address: buy_token };

            // Let AVNU pull the input the pool withdrew to us.
            sell.approve(avnu_exchange, sell_amount.into());

            // Measure output by balance delta — never trust the venue's return
            // value; credit exactly what actually arrived.
            let balance_before = buy.balance_of(self_addr);
            IAvnuExchangeDispatcher { contract_address: avnu_exchange }
                .multi_route_swap(
                    sell_token,
                    sell_amount.into(),
                    buy_token,
                    buy_min_amount, // target amount
                    buy_min_amount, // minimum (slippage floor)
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
            [OpenNoteDeposit { note_id, token: buy_token, amount: out_amount }].span()
        }
    }
}
