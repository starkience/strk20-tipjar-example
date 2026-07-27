use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;
use tipjar::avnu_models::{DirectSwap, Route, RouteSwap};
use tipjar::avnu_swap_anonymizer::{
    IAvnuSwapAnonymizerDispatcher, IAvnuSwapAnonymizerDispatcherTrait,
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

fn deploy_exchange(rate: u128) -> ContractAddress {
    let c = declare("MockAvnuExchange").unwrap().contract_class();
    let mut calldata = array![];
    rate.serialize(ref calldata);
    let (addr, _) = c.deploy(@calldata).unwrap();
    addr
}

/// Deploys the anonymizer pinned to (exchange, strk) — the "any token -> STRK" route.
fn deploy_anonymizer(
    exchange: ContractAddress, strk: ContractAddress,
) -> IAvnuSwapAnonymizerDispatcher {
    let c = declare("AvnuSwapAnonymizer").unwrap().contract_class();
    let mut calldata = array![];
    exchange.serialize(ref calldata);
    strk.serialize(ref calldata);
    let (addr, _) = c.deploy(@calldata).unwrap();
    IAvnuSwapAnonymizerDispatcher { contract_address: addr }
}

/// A real AVNU v2 route shape (the mock ignores it, but this exercises the
/// vendored Route/RouteSwap/DirectSwap types and their custom Serde).
fn route(
    sell: ContractAddress, buy: ContractAddress, exchange: ContractAddress,
) -> Array<Route> {
    array![
        Route {
            sell_token: sell,
            buy_token: buy,
            swap: RouteSwap::Direct(
                DirectSwap {
                    exchange_address: exchange,
                    percent: 1000000000000_u128,
                    additional_swap_params: array![],
                },
            ),
        },
    ]
}

#[test]
fn test_privacy_invoke_swaps_any_token_to_strk() {
    let sell = deploy_token(); // the tipper's token
    let strk = deploy_token(); // the pinned output
    let exchange = deploy_exchange(2); // 1 sell -> 2 STRK
    let anon = deploy_anonymizer(exchange, strk.contract_address);

    // The pinned route is readable for verification.
    let (pinned_exchange, pinned_out) = anon.get_route();
    assert(pinned_exchange == exchange, 'pinned exchange');
    assert(pinned_out == strk.contract_address, 'pinned out token');

    // Simulate the pool withdrawing 100 of the tipper's token to the anonymizer.
    sell.mint(anon.contract_address, 100_u256);

    start_cheat_caller_address(anon.contract_address, pool());
    let deposits = anon
        .privacy_invoke(
            sell.contract_address,
            100_u128,
            0_u256,
            route(sell.contract_address, strk.contract_address, exchange),
            42,
        );
    stop_cheat_caller_address(anon.contract_address);

    // One deposit crediting STRK to the requested note.
    assert(deposits.len() == 1, 'one deposit');
    let d = *deposits.at(0);
    assert(d.note_id == 42, 'note id');
    assert(d.token == strk.contract_address, 'credits STRK');
    assert(d.amount == 200_u128, 'out amount');

    // The anonymizer received the STRK and approved the pool to pull it.
    assert(strk.balance_of(anon.contract_address) == 200_u256, 'anon holds STRK');
    assert(strk.allowance(anon.contract_address, pool()) == 200_u256, 'pool allowance');
    // The input was pulled from the anonymizer by the exchange.
    assert(sell.balance_of(anon.contract_address) == 0_u256, 'input consumed');
}

#[test]
#[should_panic(expected: 'ZERO_OUT_AMOUNT')]
fn test_zero_output_reverts() {
    let sell = deploy_token();
    let strk = deploy_token();
    let exchange = deploy_exchange(0); // yields no output
    let anon = deploy_anonymizer(exchange, strk.contract_address);
    sell.mint(anon.contract_address, 100_u256);

    start_cheat_caller_address(anon.contract_address, pool());
    anon
        .privacy_invoke(
            sell.contract_address,
            100_u128,
            0_u256,
            route(sell.contract_address, strk.contract_address, exchange),
            42,
        );
}

#[test]
#[should_panic(expected: 'ZERO_SELL_AMOUNT')]
fn test_zero_sell_amount_reverts() {
    let sell = deploy_token();
    let strk = deploy_token();
    let exchange = deploy_exchange(2);
    let anon = deploy_anonymizer(exchange, strk.contract_address);

    start_cheat_caller_address(anon.contract_address, pool());
    anon
        .privacy_invoke(
            sell.contract_address,
            0_u128,
            0_u256,
            route(sell.contract_address, strk.contract_address, exchange),
            42,
        );
}

#[test]
#[should_panic(expected: 'SAME_TOKEN')]
fn test_selling_the_output_token_reverts() {
    let strk = deploy_token();
    let exchange = deploy_exchange(2);
    let anon = deploy_anonymizer(exchange, strk.contract_address);
    strk.mint(anon.contract_address, 100_u256);

    // Selling STRK for STRK is a no-op swap — the caller wants a plain private
    // transfer, not this helper.
    start_cheat_caller_address(anon.contract_address, pool());
    anon
        .privacy_invoke(
            strk.contract_address,
            100_u128,
            0_u256,
            route(strk.contract_address, strk.contract_address, exchange),
            42,
        );
}
