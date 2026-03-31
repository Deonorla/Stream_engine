#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn registers_and_revokes_attestation() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let attestor = Address::generate(&env);
    let contract_id = env.register(AttestationRegistryContract, ());
    let client = AttestationRegistryContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.set_policy(&admin, &1, &2, &true, &86400);

    let id = client.register_attestation(
        &attestor,
        &7,
        &2,
        &String::from_str(&env, "0xdeed"),
        &String::from_str(&env, "title_review_complete"),
        &0,
    );

    let record = client.get_attestation(&id);
    assert_eq!(record.token_id, 7);
    assert_eq!(record.role, 2);
    assert_eq!(client.has_required_policies(&1), true);

    client.revoke_attestation(&attestor, &id, &String::from_str(&env, "superseded"));
    let revoked = client.get_attestation(&id);
    assert_eq!(revoked.revoked, true);
}
