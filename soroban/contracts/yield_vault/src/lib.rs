#![no_std]

use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, token, Address, Env, Vec,
};

#[contractclient(name = "RegistryClient")]
pub trait RegistryInterface {
    fn owner_of(env: Env, token_id: u64) -> Address;
    fn is_asset_claim_blocked(env: Env, token_id: u64) -> bool;
}

const STREAM_OPEN: u32 = 1;
const STREAM_CLOSED: u32 = 2;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Registry,
    NextStreamId,
    Stream(u64),
    AssetStreams(u64),
}

#[derive(Clone)]
#[contracttype]
pub struct YieldStream {
    pub stream_id: u64,
    pub token_id: u64,
    pub sender: Address,
    pub token: Address,
    pub total_amount: i128,
    pub withdrawn_amount: i128,
    pub flash_advance_outstanding: i128,
    pub start_time: u64,
    pub stop_time: u64,
    pub status: u32,
}

#[contract]
pub struct YieldVaultContract;

fn now(env: &Env) -> u64 {
    env.ledger().timestamp()
}

fn current_contract(env: &Env) -> Address {
    env.current_contract_address()
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .persistent()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("yield_vault_not_initialized"))
}

fn require_admin(env: &Env, admin: &Address) {
    let stored = read_admin(env);
    if stored != *admin {
        panic!("unauthorized_admin");
    }
    admin.require_auth();
}

fn registry_id(env: &Env) -> Address {
    env.storage()
        .persistent()
        .get(&DataKey::Registry)
        .unwrap_or_else(|| panic!("registry_not_configured"))
}

fn next_stream_id(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::NextStreamId)
        .unwrap_or(0u64)
}

fn read_stream(env: &Env, stream_id: u64) -> YieldStream {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .unwrap_or_else(|| panic!("yield_stream_not_found"))
}

fn write_stream(env: &Env, stream: &YieldStream) {
    env.storage()
        .persistent()
        .set(&DataKey::Stream(stream.stream_id), stream);
}

fn append_asset_stream(env: &Env, token_id: u64, stream_id: u64) {
    let key = DataKey::AssetStreams(token_id);
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    ids.push_back(stream_id);
    env.storage().persistent().set(&key, &ids);
}

fn token_client<'a>(env: &'a Env, token_address: &'a Address) -> token::TokenClient<'a> {
    token::TokenClient::new(env, token_address)
}

fn streamed_amount(stream: &YieldStream, at: u64) -> i128 {
    let effective_end = if at > stream.stop_time {
        stream.stop_time
    } else {
        at
    };
    if effective_end <= stream.start_time {
        return 0;
    }
    let duration = stream.stop_time - stream.start_time;
    let elapsed = effective_end - stream.start_time;
    (stream.total_amount * (elapsed as i128)) / (duration as i128)
}

fn available_amount(stream: &YieldStream, at: u64) -> i128 {
    let streamed = streamed_amount(stream, at);
    let reserved = stream.withdrawn_amount + stream.flash_advance_outstanding;
    if streamed <= reserved {
        0
    } else {
        streamed - reserved
    }
}

#[contractimpl]
impl YieldVaultContract {
    pub fn initialize(env: Env, admin: Address, registry: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("yield_vault_already_initialized");
        }
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Registry, &registry);
        env.storage().persistent().set(&DataKey::NextStreamId, &0u64);
    }

    pub fn get_registry(env: Env) -> Address {
        registry_id(&env)
    }

    pub fn open_stream(
        env: Env,
        sender: Address,
        token_id: u64,
        token: Address,
        total_amount: i128,
        start_time: u64,
        stop_time: u64,
    ) -> u64 {
        sender.require_auth();
        if total_amount <= 0 {
            panic!("invalid_amount");
        }
        if stop_time <= start_time {
            panic!("invalid_duration");
        }

        let registry = RegistryClient::new(&env, &registry_id(&env));
        if registry.is_asset_claim_blocked(&token_id) {
            panic!("asset_claim_blocked");
        }

        let stream_id = next_stream_id(&env) + 1;
        env.storage().persistent().set(&DataKey::NextStreamId, &stream_id);

        token_client(&env, &token).transfer(&sender, &current_contract(&env), &total_amount);

        let stream = YieldStream {
            stream_id,
            token_id,
            sender,
            token,
            total_amount,
            withdrawn_amount: 0,
            flash_advance_outstanding: 0,
            start_time,
            stop_time,
            status: STREAM_OPEN,
        };
        write_stream(&env, &stream);
        append_asset_stream(&env, token_id, stream_id);
        stream_id
    }

    pub fn get_stream(env: Env, stream_id: u64) -> YieldStream {
        read_stream(&env, stream_id)
    }

    pub fn last_stream_id(env: Env) -> u64 {
        next_stream_id(&env)
    }

    pub fn latest_stream_for_asset(env: Env, token_id: u64) -> u64 {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::AssetStreams(token_id))
            .unwrap_or(Vec::new(&env));
        ids.last().unwrap_or(0u64)
    }

    pub fn claim(env: Env, owner: Address, token_id: u64) -> i128 {
        owner.require_auth();
        let registry = RegistryClient::new(&env, &registry_id(&env));
        if registry.owner_of(&token_id) != owner {
            panic!("not_asset_owner");
        }
        if registry.is_asset_claim_blocked(&token_id) {
            panic!("asset_claim_blocked");
        }
        let stream_id = Self::latest_stream_for_asset(env.clone(), token_id);
        if stream_id == 0 {
            panic!("yield_stream_not_found");
        }
        let mut stream = read_stream(&env, stream_id);
        let claimable = available_amount(&stream, now(&env));
        if claimable <= 0 {
            panic!("nothing_to_claim");
        }
        token_client(&env, &stream.token).transfer(&current_contract(&env), &owner, &claimable);
        stream.withdrawn_amount += claimable;
        if stream.withdrawn_amount + stream.flash_advance_outstanding >= stream.total_amount {
            stream.status = STREAM_CLOSED;
        }
        write_stream(&env, &stream);
        claimable
    }

    pub fn flash_advance(env: Env, owner: Address, token_id: u64, amount: i128) -> i128 {
        owner.require_auth();
        if amount <= 0 {
            panic!("invalid_amount");
        }
        let registry = RegistryClient::new(&env, &registry_id(&env));
        if registry.owner_of(&token_id) != owner {
            panic!("not_asset_owner");
        }
        if registry.is_asset_claim_blocked(&token_id) {
            panic!("asset_claim_blocked");
        }
        let stream_id = Self::latest_stream_for_asset(env.clone(), token_id);
        if stream_id == 0 {
            panic!("yield_stream_not_found");
        }
        let mut stream = read_stream(&env, stream_id);
        let remaining = stream.total_amount - stream.withdrawn_amount - stream.flash_advance_outstanding;
        if amount > remaining {
            panic!("advance_exceeds_remaining_yield");
        }
        token_client(&env, &stream.token).transfer(&current_contract(&env), &owner, &amount);
        stream.flash_advance_outstanding += amount;
        if stream.withdrawn_amount + stream.flash_advance_outstanding >= stream.total_amount {
            stream.status = STREAM_CLOSED;
        }
        write_stream(&env, &stream);
        amount
    }

    pub fn set_registry(env: Env, admin: Address, registry: Address) {
        require_admin(&env, &admin);
        env.storage().persistent().set(&DataKey::Registry, &registry);
    }
}

mod test;
