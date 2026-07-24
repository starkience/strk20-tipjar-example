// AVNU v2 swap-routing models — vendored verbatim from AVNU's open-source
// exchange so this reference is ABI-accurate to the real `multi_route_swap`.
//
// Source: https://github.com/avnu-labs/avnu-contracts-v2 (src/models.cairo).
// NOTE the custom `Serde` for `RouteSwap`: the `Direct` variant serializes with
// NO variant prefix (a derived Serde would prepend `0` and be wire-incompatible),
// and `Branch` is tagged with `BRANCH_MARKER` for backward compatibility. This
// is exactly why "verify the real ABI" is a hard blocker — a hand-rolled Route
// would silently mis-serialize.
//
// For production, prefer depending on AVNU's package over vendoring this copy.

use starknet::ContractAddress;

// hex("branch") == 0x6272616e6368 == 108243400418152
const BRANCH_MARKER: felt252 = 108243400418152;

#[derive(Drop, Serde, Clone)]
pub struct Route {
    pub sell_token: ContractAddress,
    pub buy_token: ContractAddress,
    pub swap: RouteSwap,
}

#[derive(Drop, Clone)]
pub enum RouteSwap {
    Direct: DirectSwap,
    Branch: BranchSwap,
}

impl RouteSwapSerde of Serde<RouteSwap> {
    fn serialize(self: @RouteSwap, ref output: Array<felt252>) {
        match self {
            RouteSwap::Direct(route) => Serde::serialize(route, ref output),
            RouteSwap::Branch(route) => {
                // Marker keeps this retro-compatible with the original single-variant encoding.
                output.append(BRANCH_MARKER);
                Serde::serialize(route, ref output)
            },
        }
    }

    fn deserialize(ref serialized: Span<felt252>) -> Option<RouteSwap> {
        let optional_marker = serialized.get(0)?.unbox().clone();

        Option::Some(
            if optional_marker == BRANCH_MARKER {
                // Consume the marker first.
                let _: felt252 = Serde::deserialize(ref serialized)?;
                RouteSwap::Branch(Serde::deserialize(ref serialized)?)
            } else {
                RouteSwap::Direct(Serde::deserialize(ref serialized)?)
            },
        )
    }
}

#[derive(Drop, Serde, Clone)]
pub struct DirectSwap {
    pub exchange_address: ContractAddress,
    pub percent: u128,
    pub additional_swap_params: Array<felt252>,
}

#[derive(Drop, Serde, Clone)]
pub struct AlternativeSwap {
    pub exchange_address: ContractAddress,
    pub percent: u128,
    pub additional_swap_params: Array<felt252>,
}

#[derive(Drop, Serde, Clone)]
pub struct BranchSwap {
    pub principal: DirectSwap,
    pub alternatives: Array<AlternativeSwap>,
}
