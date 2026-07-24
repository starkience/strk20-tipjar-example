use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;
use tipjar::avnu_swap_anonymizer::{
    IAvnuSwapAnonymizerDispatcher, IAvnuSwapAnonymizerDispatcherTrait, Route,
};
use tipjar::mock_erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};

fn pool() -> ContractAddress {
    'pool'.try_into().unwrap()
}

fn deploy_token() -> IMockERC20Dispatcher {
    let c = declare("MockERC20").unwrap().contract_class();
    let (addr, _) = c.deploy(@array![]).unwrap();
    IMockERC20Dispatcher { contract_address: addr }
}

fn deploy_anonymizer() -> IAvnuSwapAnonymizerDispatcher {
    let c = declare("AvnuSwapAnonymizer").unwrap().contract_class();
    let (addr, _) = c.deploy(@array![]).unwrap();
    IAvnuSwapAnonymizerDispatcher { contract_address: addr }
}

fn deploy_exchange(rate: u128) -> ContractAddress {
    let c = declare("MockAvnuExchange").unwrap().contract_class();
    let mut calldata = array![];
    rate.serialize(ref calldata);
    let (addr, _) = c.deploy(@calldata).unwrap();
    addr
}

#[test]
fn test_privacy_invoke_swaps_and_credits_open_note() {
    let sell = deploy_token();
    let buy = deploy_token();
    let exchange = deploy_exchange(2); // 1 sell -> 2 buy
    let anon = deploy_anonymizer();

    // Simulate the pool withdrawing 100 sell tokens to the anonymizer.
    sell.mint(anon.contract_address, 100_u256);

    let routes: Array<Route> = array![];
    start_cheat_caller_address(anon.contract_address, pool());
    let deposits = anon
        .privacy_invoke(
            exchange, sell.contract_address, 100_u128, buy.contract_address, 0_u256, routes, 42,
        );
    stop_cheat_caller_address(anon.contract_address);

    // One deposit crediting the buy token to the requested note.
    assert(deposits.len() == 1, 'one deposit');
    let d = *deposits.at(0);
    assert(d.note_id == 42, 'note id');
    assert(d.token == buy.contract_address, 'buy token');
    assert(d.amount == 200_u128, 'out amount');

    // The anonymizer received the output and approved the pool to pull it.
    assert(buy.balance_of(anon.contract_address) == 200_u256, 'anon holds output');
    assert(buy.allowance(anon.contract_address, pool()) == 200_u256, 'pool allowance');
    // The input was pulled from the anonymizer by the exchange.
    assert(sell.balance_of(anon.contract_address) == 0_u256, 'input consumed');
}

#[test]
#[should_panic(expected: 'ZERO_OUT_AMOUNT')]
fn test_zero_output_reverts() {
    let sell = deploy_token();
    let buy = deploy_token();
    let exchange = deploy_exchange(0); // yields no output
    let anon = deploy_anonymizer();
    sell.mint(anon.contract_address, 100_u256);

    let routes: Array<Route> = array![];
    start_cheat_caller_address(anon.contract_address, pool());
    anon
        .privacy_invoke(
            exchange, sell.contract_address, 100_u128, buy.contract_address, 0_u256, routes, 42,
        );
}

#[test]
#[should_panic(expected: 'ZERO_SELL_AMOUNT')]
fn test_zero_sell_amount_reverts() {
    let sell = deploy_token();
    let buy = deploy_token();
    let exchange = deploy_exchange(2);
    let anon = deploy_anonymizer();

    let routes: Array<Route> = array![];
    start_cheat_caller_address(anon.contract_address, pool());
    anon
        .privacy_invoke(
            exchange, sell.contract_address, 0_u128, buy.contract_address, 0_u256, routes, 42,
        );
}
