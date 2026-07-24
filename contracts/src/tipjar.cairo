// TipJar — a deliberately tiny, non-custodial tip contract.
//
// This is the PUBLIC baseline of the STRK20 example. `tip(amount)` pulls STRK
// from the caller and forwards it straight to the fixed `owner` (the creator),
// counting the total and emitting a `Tipped` event. The contract never holds
// funds: there is no balance to steal, no `withdraw`, no admin, no upgrade path.
//
// Everything here is fully public on-chain — the `Tipped` event is exactly what
// the frontend's "LATEST TIPS" wall reads, and anyone can see tipper -> owner,
// amount, and time. Part 2 of this repo adds a PRIVATE tipping path with STRK20
// that bypasses this contract entirely (a pool-internal private transfer to the
// creator), so private tips never touch `tip()` and never emit this event.
//
// See ../../docs/STRK20_INTEGRATION.md for the privacy integration.

use starknet::ContractAddress;

#[starknet::interface]
pub trait ITipJar<TContractState> {
    /// Pull `amount` STRK from the caller and forward it to the owner.
    /// Requires the caller to have approved this contract on the STRK token
    /// first (the frontend batches `approve` + `tip` into one multicall).
    fn tip(ref self: TContractState, amount: u256);
    /// Returns (total STRK tipped, number of tips).
    fn get_total(self: @TContractState) -> (u256, u64);
    /// The creator address that every tip is forwarded to (set at deploy).
    fn get_owner(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod TipJar {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    // We only ever call `transfer_from` on the token, and that selector/signature
    // is identical across every ERC-20 (including STRK). Rather than declare a
    // second interface, we reuse the test token's dispatcher as a minimal
    // ERC-20 client. In production you would import a shared IERC20 interface.
    use crate::mock_erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        token: ContractAddress,
        total_tipped: u256,
        tip_count: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Tipped: Tipped,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Tipped {
        #[key]
        pub tipper: ContractAddress,
        pub amount: u256,
        pub timestamp: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, token: ContractAddress) {
        self.owner.write(owner);
        self.token.write(token);
    }

    #[abi(embed_v0)]
    impl TipJarImpl of super::ITipJar<ContractState> {
        fn tip(ref self: ContractState, amount: u256) {
            assert(amount > 0_u256, 'TIP_AMOUNT_ZERO');
            let tipper = get_caller_address();
            // Forward directly to the owner — the jar never holds funds.
            IMockERC20Dispatcher { contract_address: self.token.read() }
                .transfer_from(tipper, self.owner.read(), amount);
            self.total_tipped.write(self.total_tipped.read() + amount);
            self.tip_count.write(self.tip_count.read() + 1_u64);
            self.emit(Tipped { tipper, amount, timestamp: get_block_timestamp() });
        }

        fn get_total(self: @ContractState) -> (u256, u64) {
            (self.total_tipped.read(), self.tip_count.read())
        }

        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }
    }
}
