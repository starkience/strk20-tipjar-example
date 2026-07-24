// Mock AVNU exchange for tests. Implements the `IAvnuExchange::multi_route_swap`
// entrypoint the anonymizer calls: pulls the sell token from the caller (the
// anonymizer, which approved it) and mints the buy token to the beneficiary at a
// fixed rate. `rate = 0` simulates a zero-output swap. Ignores `routes` — real
// routing is off-chain; this only needs to move balances so the anonymizer's
// balance-delta logic can be exercised.

#[starknet::interface]
pub trait IMockAvnuControl<T> {
    fn set_rate(ref self: T, rate: u128);
}

#[starknet::contract]
pub mod MockAvnuExchange {
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use crate::avnu_models::Route;
    use crate::avnu_swap_anonymizer::IAvnuExchange;
    use crate::mock_erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};
    use super::IMockAvnuControl;

    #[storage]
    struct Storage {
        // buy tokens minted per sell token (fixed rate for tests).
        rate: u128,
    }

    #[constructor]
    fn constructor(ref self: ContractState, rate: u128) {
        self.rate.write(rate);
    }

    #[abi(embed_v0)]
    impl ControlImpl of IMockAvnuControl<ContractState> {
        fn set_rate(ref self: ContractState, rate: u128) {
            self.rate.write(rate);
        }
    }

    #[abi(embed_v0)]
    impl ExchangeImpl of IAvnuExchange<ContractState> {
        fn multi_route_swap(
            ref self: ContractState,
            sell_token_address: ContractAddress,
            sell_token_amount: u256,
            buy_token_address: ContractAddress,
            buy_token_amount: u256,
            buy_token_min_amount: u256,
            beneficiary: ContractAddress,
            integrator_fee_amount_bps: u128,
            integrator_fee_recipient: ContractAddress,
            routes: Array<Route>,
        ) -> bool {
            let caller = get_caller_address();
            // Pull the sell tokens the caller approved us for.
            IMockERC20Dispatcher { contract_address: sell_token_address }
                .transfer_from(caller, get_contract_address(), sell_token_amount);
            // Deliver the output at the fixed rate.
            let out = sell_token_amount * self.rate.read().into();
            if out != 0_u256 {
                IMockERC20Dispatcher { contract_address: buy_token_address }
                    .mint(beneficiary, out);
            }
            true
        }
    }
}
