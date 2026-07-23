use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp, spy_events,
    EventSpyAssertionsTrait,
};
use starknet::ContractAddress;
use tipjar::tipjar::{ITipJarDispatcher, ITipJarDispatcherTrait, TipJar};
use tipjar::mock_erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};

fn owner() -> ContractAddress { 'owner'.try_into().unwrap() }
fn tipper() -> ContractAddress { 'tipper'.try_into().unwrap() }

fn setup() -> (ITipJarDispatcher, IMockERC20Dispatcher) {
    let token_class = declare("MockERC20").unwrap().contract_class();
    let (token_address, _) = token_class.deploy(@array![]).unwrap();
    let token = IMockERC20Dispatcher { contract_address: token_address };

    let jar_class = declare("TipJar").unwrap().contract_class();
    let mut calldata = array![];
    owner().serialize(ref calldata);
    token_address.serialize(ref calldata);
    let (jar_address, _) = jar_class.deploy(@calldata).unwrap();
    let jar = ITipJarDispatcher { contract_address: jar_address };

    // Fund the tipper and approve the jar to spend.
    token.mint(tipper(), 100_u256);
    start_cheat_caller_address(token_address, tipper());
    token.approve(jar_address, 100_u256);
    stop_cheat_caller_address(token_address);

    (jar, token)
}

#[test]
fn test_tip_forwards_to_owner_and_counts() {
    let (jar, token) = setup();

    start_cheat_caller_address(jar.contract_address, tipper());
    jar.tip(40_u256);
    jar.tip(10_u256);
    stop_cheat_caller_address(jar.contract_address);

    assert(token.balance_of(owner()) == 50_u256, 'owner balance');
    assert(token.balance_of(tipper()) == 50_u256, 'tipper balance');
    let (total, count) = jar.get_total();
    assert(total == 50_u256, 'total');
    assert(count == 2_u64, 'count');
    assert(jar.get_owner() == owner(), 'owner');
}

#[test]
fn test_tip_emits_event() {
    let (jar, _token) = setup();
    let mut spy = spy_events();

    start_cheat_block_timestamp(jar.contract_address, 1700000000_u64);
    start_cheat_caller_address(jar.contract_address, tipper());
    jar.tip(40_u256);
    stop_cheat_caller_address(jar.contract_address);

    spy.assert_emitted(
        @array![
            (
                jar.contract_address,
                TipJar::Event::Tipped(
                    TipJar::Tipped {
                        tipper: tipper(), amount: 40_u256, timestamp: 1700000000_u64,
                    },
                ),
            ),
        ],
    );
}

#[test]
#[should_panic(expected: 'TIP_AMOUNT_ZERO')]
fn test_tip_zero_amount_panics() {
    let (jar, _token) = setup();
    start_cheat_caller_address(jar.contract_address, tipper());
    jar.tip(0_u256);
}

#[test]
#[should_panic(expected: 'INSUFFICIENT_ALLOWANCE')]
fn test_tip_beyond_allowance_panics() {
    let (jar, _token) = setup();
    start_cheat_caller_address(jar.contract_address, tipper());
    jar.tip(101_u256);
}
