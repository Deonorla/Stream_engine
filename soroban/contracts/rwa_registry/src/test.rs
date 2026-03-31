#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn mints_after_issuer_onboarding() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let contract_id = env.register(RwaRegistryContract, ());
    let client = RwaRegistryContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.set_asset_type_policy(&admin, &1, &true);
    client.set_issuer_approval(
        &admin,
        &issuer,
        &true,
        &String::from_str(&env, "demo issuer"),
    );

    let token_id = client.mint_asset(
        &issuer,
        &1,
        &1,
        &String::from_str(&env, "ipfs://asset"),
        &String::from_str(&env, "meta"),
        &String::from_str(&env, "evidence"),
        &String::from_str(&env, "manifest"),
        &String::from_str(&env, "property"),
        &String::from_str(&env, "NG-LA"),
        &String::from_str(&env, "cid"),
        &String::from_str(&env, "tag"),
        &String::from_str(&env, ""),
    );

    let asset = client.get_asset(&token_id);
    assert_eq!(asset.current_owner, issuer);
    assert_eq!(asset.verification_status, STATUS_PENDING_ATTESTATION);
    assert_eq!(asset.active_stream_id, 0);
}

#[test]
fn transfer_updates_owner_index() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let contract_id = env.register(RwaRegistryContract, ());
    let client = RwaRegistryContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.set_issuer_approval(
        &admin,
        &issuer,
        &true,
        &String::from_str(&env, "issuer"),
    );

    let token_id = client.mint_asset(
        &issuer,
        &1,
        &1,
        &String::from_str(&env, "ipfs://asset"),
        &String::from_str(&env, "meta"),
        &String::from_str(&env, "evidence"),
        &String::from_str(&env, "manifest"),
        &String::from_str(&env, "property"),
        &String::from_str(&env, "NG-LA"),
        &String::from_str(&env, "cid"),
        &String::from_str(&env, "tag"),
        &String::from_str(&env, ""),
    );

    client.transfer_asset(&issuer, &token_id, &buyer);

    assert_eq!(client.owner_of(&token_id), buyer);
    assert_eq!(client.list_owned_assets(&issuer).len(), 0);
    assert_eq!(client.list_owned_assets(&buyer).len(), 1);
}
