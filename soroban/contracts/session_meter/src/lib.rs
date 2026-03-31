#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, BytesN, Env, String, Vec,
};

const SESSION_OPEN: u32 = 1;
const SESSION_CANCELED: u32 = 2;
const SESSION_CLOSED: u32 = 3;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    NextSessionId,
    Session(u64),
    PayerSessions(Address),
    RecipientSessions(Address),
}

#[derive(Clone)]
#[contracttype]
pub struct SessionRecord {
    pub session_id: u64,
    pub payer: Address,
    pub recipient: Address,
    pub token: Address,
    pub asset_code: String,
    pub asset_issuer: String,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub start_time: u64,
    pub stop_time: u64,
    pub frozen: bool,
    pub status: u32,
    pub metadata_hash: BytesN<32>,
    pub canceled_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct SessionSettlement {
    pub claimable_amount: i128,
    pub refundable_amount: i128,
}

#[contract]
pub struct SessionMeterContract;

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
        .unwrap_or_else(|| panic!("session_meter_not_initialized"))
}

fn require_admin(env: &Env, admin: &Address) {
    let stored = read_admin(env);
    if stored != *admin {
        panic!("unauthorized_admin");
    }
    admin.require_auth();
}

fn next_session_id(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::NextSessionId)
        .unwrap_or(0u64)
}

fn read_session(env: &Env, session_id: u64) -> SessionRecord {
    env.storage()
        .persistent()
        .get(&DataKey::Session(session_id))
        .unwrap_or_else(|| panic!("session_not_found"))
}

fn write_session(env: &Env, session: &SessionRecord) {
    env.storage()
        .persistent()
        .set(&DataKey::Session(session.session_id), session);
}

fn append_session_index(env: &Env, key: DataKey, session_id: u64) {
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    ids.push_back(session_id);
    env.storage().persistent().set(&key, &ids);
}

fn streamed_amount(session: &SessionRecord, at: u64) -> i128 {
    let effective_end = if at > session.stop_time {
        session.stop_time
    } else {
        at
    };
    if effective_end <= session.start_time {
        return 0;
    }
    let duration = session.stop_time - session.start_time;
    let elapsed = effective_end - session.start_time;
    (session.total_amount * (elapsed as i128)) / (duration as i128)
}

fn claimable_amount(session: &SessionRecord, at: u64) -> i128 {
    let streamed = streamed_amount(session, at);
    if streamed <= session.claimed_amount {
        0
    } else {
        streamed - session.claimed_amount
    }
}

fn refundable_amount(session: &SessionRecord, at: u64) -> i128 {
    let streamed = streamed_amount(session, at);
    if session.total_amount <= streamed {
        0
    } else {
        session.total_amount - streamed
    }
}

fn token_client<'a>(env: &'a Env, token_address: &'a Address) -> token::TokenClient<'a> {
    token::TokenClient::new(env, token_address)
}

#[contractimpl]
impl SessionMeterContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("session_meter_already_initialized");
        }
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::NextSessionId, &0u64);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn open_session(
        env: Env,
        payer: Address,
        recipient: Address,
        token: Address,
        asset_code: String,
        asset_issuer: String,
        total_amount: i128,
        start_time: u64,
        stop_time: u64,
        metadata_hash: BytesN<32>,
    ) -> u64 {
        payer.require_auth();
        if total_amount <= 0 {
            panic!("invalid_amount");
        }
        if stop_time <= start_time {
            panic!("invalid_duration");
        }

        let session_id = next_session_id(&env) + 1;
        env.storage().persistent().set(&DataKey::NextSessionId, &session_id);

        token_client(&env, &token).transfer(&payer, &current_contract(&env), &total_amount);

        let session = SessionRecord {
            session_id,
            payer: payer.clone(),
            recipient: recipient.clone(),
            token,
            asset_code,
            asset_issuer,
            total_amount,
            claimed_amount: 0,
            start_time,
            stop_time,
            frozen: false,
            status: SESSION_OPEN,
            metadata_hash,
            canceled_at: 0,
        };

        write_session(&env, &session);
        append_session_index(&env, DataKey::PayerSessions(payer), session_id);
        append_session_index(&env, DataKey::RecipientSessions(recipient), session_id);
        session_id
    }

    pub fn get_session(env: Env, session_id: u64) -> SessionRecord {
        read_session(&env, session_id)
    }

    pub fn last_session_id(env: Env) -> u64 {
        next_session_id(&env)
    }

    pub fn list_payer_sessions(env: Env, payer: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::PayerSessions(payer))
            .unwrap_or(Vec::new(&env))
    }

    pub fn list_recipient_sessions(env: Env, recipient: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RecipientSessions(recipient))
            .unwrap_or(Vec::new(&env))
    }

    pub fn claim(env: Env, recipient: Address, session_id: u64) -> i128 {
        recipient.require_auth();
        let mut session = read_session(&env, session_id);
        if session.recipient != recipient {
            panic!("not_session_recipient");
        }
        if session.frozen {
            panic!("session_frozen");
        }
        let claimable = claimable_amount(&session, now(&env));
        if claimable <= 0 {
            panic!("nothing_to_claim");
        }
        token_client(&env, &session.token).transfer(&current_contract(&env), &recipient, &claimable);
        session.claimed_amount += claimable;
        if session.claimed_amount >= session.total_amount {
            session.status = SESSION_CLOSED;
        }
        write_session(&env, &session);
        claimable
    }

    pub fn cancel(env: Env, payer: Address, session_id: u64) -> SessionSettlement {
        payer.require_auth();
        let mut session = read_session(&env, session_id);
        if session.payer != payer {
            panic!("not_session_payer");
        }
        if session.status != SESSION_OPEN {
            panic!("session_not_open");
        }

        let now = now(&env);
        let claimable = claimable_amount(&session, now);
        let refundable = refundable_amount(&session, now);

        if claimable > 0 {
            token_client(&env, &session.token).transfer(
                &current_contract(&env),
                &session.recipient,
                &claimable,
            );
        }
        if refundable > 0 {
            token_client(&env, &session.token).transfer(
                &current_contract(&env),
                &payer,
                &refundable,
            );
        }

        session.claimed_amount += claimable;
        session.status = SESSION_CANCELED;
        session.canceled_at = now;
        write_session(&env, &session);

        SessionSettlement {
            claimable_amount: claimable,
            refundable_amount: refundable,
        }
    }

    pub fn freeze_session(env: Env, admin: Address, session_id: u64, frozen: bool) {
        require_admin(&env, &admin);
        let mut session = read_session(&env, session_id);
        session.frozen = frozen;
        write_session(&env, &session);
    }

    pub fn is_session_active(env: Env, session_id: u64) -> bool {
        let session = read_session(&env, session_id);
        session.status == SESSION_OPEN && !session.frozen
    }
}

mod test;
