#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String,
};

#[test]
fn opens_claims_and_cancels_session() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let payer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let contract_id = env.register(SessionMeterContract, ());
    let client = SessionMeterContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token = TokenClient::new(&env, &sac.address());
    let token_admin_client = StellarAssetClient::new(&env, &sac.address());
    token_admin_client.mint(&payer, &1_000_000_000i128);

    env.ledger().set_timestamp(1_000);
    let session_id = client.open_session(
        &payer,
        &recipient,
        &sac.address(),
        &String::from_str(&env, "USDC"),
        &String::from_str(&env, "issuer"),
        &700_000_000i128,
        &1_000u64,
        &1_100u64,
        &BytesN::from_array(&env, &[0; 32]),
    );

    assert_eq!(token.balance(&payer), 300_000_000i128);
    assert_eq!(token.balance(&contract_id), 700_000_000i128);

    env.ledger().set_timestamp(1_050);
    let claimed = client.claim(&recipient, &session_id);
    assert_eq!(claimed, 350_000_000i128);
    assert_eq!(token.balance(&recipient), 350_000_000i128);

    env.ledger().set_timestamp(1_060);
    let settlement = client.cancel(&payer, &session_id);
    assert_eq!(settlement.claimable_amount, 70_000_000i128);
    assert_eq!(settlement.refundable_amount, 280_000_000i128);
    assert_eq!(token.balance(&recipient), 420_000_000i128);
    assert_eq!(token.balance(&payer), 580_000_000i128);
}
