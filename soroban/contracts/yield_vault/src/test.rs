#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

mod registry_contract {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[derive(Clone)]
    #[contracttype]
    pub struct RegistryState {
        pub owner: Address,
        pub blocked: bool,
    }

    #[contract]
    pub struct TestRegistry;

    #[contractimpl]
    impl TestRegistry {
        pub fn initialize(env: Env, owner: Address) {
            env.storage().instance().set(&0u32, &RegistryState { owner, blocked: false });
        }

        pub fn owner_of(env: Env, _token_id: u64) -> Address {
            let state: RegistryState = env.storage().instance().get(&0u32).unwrap();
            state.owner
        }

        pub fn is_asset_claim_blocked(env: Env, _token_id: u64) -> bool {
            let state: RegistryState = env.storage().instance().get(&0u32).unwrap();
            state.blocked
        }
    }
}

#[test]
fn funds_and_claims_yield() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let owner = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let registry_id = env.register(registry_contract::TestRegistry, ());
    let registry_client = registry_contract::TestRegistryClient::new(&env, &registry_id);
    registry_client.initialize(&owner);

    let vault_id = env.register(YieldVaultContract, ());
    let vault = YieldVaultContractClient::new(&env, &vault_id);
    vault.initialize(&admin, &registry_id);

    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token = TokenClient::new(&env, &sac.address());
    let token_admin_client = StellarAssetClient::new(&env, &sac.address());
    token_admin_client.mint(&sender, &1_000_000_000i128);

    env.ledger().set_timestamp(10);
    let stream_id = vault.open_stream(
        &sender,
        &7,
        &sac.address(),
        &900_000_000i128,
        &10u64,
        &110u64,
    );

    assert_eq!(stream_id, 1);
    assert_eq!(token.balance(&sender), 100_000_000i128);

    env.ledger().set_timestamp(60);
    let claimed = vault.claim(&owner, &7);
    assert_eq!(claimed, 450_000_000i128);
    assert_eq!(token.balance(&owner), 450_000_000i128);

    let advanced = vault.flash_advance(&owner, &7, &100_000_000i128);
    assert_eq!(advanced, 100_000_000i128);
    assert_eq!(token.balance(&owner), 550_000_000i128);
}
