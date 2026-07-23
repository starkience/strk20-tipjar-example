use starknet::ContractAddress;

#[starknet::interface]
pub trait ITipJar<TContractState> {
    fn tip(ref self: TContractState, amount: u256);
    fn get_total(self: @TContractState) -> (u256, u64);
    fn get_owner(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod TipJar {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
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
