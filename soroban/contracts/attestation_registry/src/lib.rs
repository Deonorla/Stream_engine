#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    NextAttestationId,
    Attestation(u64),
    TokenAttestations(u64),
    Policy(u32, u32),
    PolicyRoles(u32),
}

#[derive(Clone)]
#[contracttype]
pub struct AttestationRecord {
    pub attestation_id: u64,
    pub token_id: u64,
    pub role: u32,
    pub attestor: Address,
    pub evidence_hash: String,
    pub statement_type: String,
    pub issued_at: u64,
    pub expiry: u64,
    pub revoked: bool,
    pub revocation_reason: String,
}

#[derive(Clone)]
#[contracttype]
pub struct AttestationPolicy {
    pub asset_type: u32,
    pub role: u32,
    pub required: bool,
    pub max_age: u64,
}

#[contract]
pub struct AttestationRegistryContract;

fn now(env: &Env) -> u64 {
    env.ledger().timestamp()
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .persistent()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("attestation_registry_not_initialized"))
}

fn require_admin(env: &Env, admin: &Address) {
    let stored = read_admin(env);
    if stored != *admin {
        panic!("unauthorized_admin");
    }
    admin.require_auth();
}

fn next_attestation_id(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::NextAttestationId)
        .unwrap_or(0u64)
}

fn append_token_attestation(env: &Env, token_id: u64, attestation_id: u64) {
    let key = DataKey::TokenAttestations(token_id);
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    ids.push_back(attestation_id);
    env.storage().persistent().set(&key, &ids);
}

fn push_policy_role(env: &Env, asset_type: u32, role: u32) {
    let key = DataKey::PolicyRoles(asset_type);
    let mut roles: Vec<u32> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    if !roles.contains(role) {
        roles.push_back(role);
        env.storage().persistent().set(&key, &roles);
    }
}

#[contractimpl]
impl AttestationRegistryContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("attestation_registry_already_initialized");
        }
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::NextAttestationId, &0u64);
    }

    pub fn set_policy(
        env: Env,
        admin: Address,
        asset_type: u32,
        role: u32,
        required: bool,
        max_age: u64,
    ) {
        require_admin(&env, &admin);
        let policy = AttestationPolicy {
            asset_type,
            role,
            required,
            max_age,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Policy(asset_type, role), &policy);
        push_policy_role(&env, asset_type, role);
    }

    pub fn get_policies(env: Env, asset_type: u32) -> Vec<AttestationPolicy> {
        let roles: Vec<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::PolicyRoles(asset_type))
            .unwrap_or(Vec::new(&env));
        let mut policies = Vec::new(&env);
        for role in roles.iter() {
            if let Some(policy) = env
                .storage()
                .persistent()
                .get::<_, AttestationPolicy>(&DataKey::Policy(asset_type, role))
            {
                policies.push_back(policy);
            }
        }
        policies
    }

    pub fn has_required_policies(env: Env, asset_type: u32) -> bool {
        let policies = Self::get_policies(env, asset_type);
        for policy in policies.iter() {
            if policy.required {
                return true;
            }
        }
        false
    }

    pub fn register_attestation(
        env: Env,
        attestor: Address,
        token_id: u64,
        role: u32,
        evidence_hash: String,
        statement_type: String,
        expiry: u64,
    ) -> u64 {
        attestor.require_auth();
        let next = next_attestation_id(&env) + 1;
        env.storage().persistent().set(&DataKey::NextAttestationId, &next);

        let record = AttestationRecord {
            attestation_id: next,
            token_id,
            role,
            attestor,
            evidence_hash,
            statement_type,
            issued_at: now(&env),
            expiry,
            revoked: false,
            revocation_reason: String::from_str(&env, ""),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Attestation(next), &record);
        append_token_attestation(&env, token_id, next);
        next
    }

    pub fn revoke_attestation(
        env: Env,
        attestor: Address,
        attestation_id: u64,
        reason: String,
    ) {
        attestor.require_auth();
        let mut record: AttestationRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Attestation(attestation_id))
            .unwrap_or_else(|| panic!("attestation_not_found"));
        if record.attestor != attestor {
            panic!("not_attestor");
        }
        record.revoked = true;
        record.revocation_reason = reason;
        env.storage()
            .persistent()
            .set(&DataKey::Attestation(attestation_id), &record);
    }

    pub fn get_attestation(env: Env, attestation_id: u64) -> AttestationRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Attestation(attestation_id))
            .unwrap_or_else(|| panic!("attestation_not_found"))
    }

    pub fn last_attestation_id(env: Env) -> u64 {
        next_attestation_id(&env)
    }

    pub fn list_for_token(env: Env, token_id: u64) -> Vec<AttestationRecord> {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::TokenAttestations(token_id))
            .unwrap_or(Vec::new(&env));
        let mut records = Vec::new(&env);
        for attestation_id in ids.iter() {
            let record: AttestationRecord = env
                .storage()
                .persistent()
                .get(&DataKey::Attestation(attestation_id))
                .unwrap_or_else(|| panic!("attestation_not_found"));
            records.push_back(record);
        }
        records
    }
}

mod test;
