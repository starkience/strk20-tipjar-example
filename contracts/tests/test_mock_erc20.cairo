use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, stop_cheat_caller_address};
use starknet::ContractAddress;
use tipjar::mock_erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};

fn alice() -> ContractAddress { 'alice'.try_into().unwrap() }
fn bob() -> ContractAddress { 'bob'.try_into().unwrap() }
fn spender() -> ContractAddress { 'spender'.try_into().unwrap() }

fn deploy_mock() -> IMockERC20Dispatcher {
    let contract = declare("MockERC20").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![]).unwrap();
    IMockERC20Dispatcher { contract_address: address }
}

#[test]
fn test_mint_and_balance() {
    let token = deploy_mock();
    token.mint(alice(), 100_u256);
    assert(token.balance_of(alice()) == 100_u256, 'wrong balance');
}

#[test]
fn test_approve_and_transfer_from() {
    let token = deploy_mock();
    token.mint(alice(), 100_u256);

    start_cheat_caller_address(token.contract_address, alice());
    token.approve(spender(), 60_u256);
    stop_cheat_caller_address(token.contract_address);

    start_cheat_caller_address(token.contract_address, spender());
    token.transfer_from(alice(), bob(), 40_u256);
    stop_cheat_caller_address(token.contract_address);

    assert(token.balance_of(alice()) == 60_u256, 'alice balance');
    assert(token.balance_of(bob()) == 40_u256, 'bob balance');
    assert(token.allowance(alice(), spender()) == 20_u256, 'allowance left');
}

#[test]
#[should_panic(expected: 'INSUFFICIENT_ALLOWANCE')]
fn test_transfer_from_without_allowance_panics() {
    let token = deploy_mock();
    token.mint(alice(), 100_u256);
    start_cheat_caller_address(token.contract_address, spender());
    token.transfer_from(alice(), bob(), 1_u256);
}
