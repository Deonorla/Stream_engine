#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

const SCHEMA_VERSION: u32 = 2;
const STATUS_DRAFT: u32 = 0;
const STATUS_PENDING_ATTESTATION: u32 = 1;
const STATUS_VERIFIED: u32 = 2;
const STATUS_VERIFIED_WITH_WARNINGS: u32 = 3;
const STATUS_STALE: u32 = 4;
const STATUS_FROZEN: u32 = 5;
const STATUS_REVOKED: u32 = 6;
const STATUS_DISPUTED: u32 = 7;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    NextTokenId,
    Issuer(Address),
    Compliance(Address, u32),
    Asset(u64),
    OwnerAssets(Address),
    AssetTypePolicy(u32),
}

#[derive(Clone)]
#[contracttype]
pub struct IssuerApproval {
    pub approved: bool,
    pub note: String,
    pub updated_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct ComplianceRecord {
    pub approved: bool,
    pub expiry: u64,
    pub jurisdiction: String,
    pub updated_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct AssetTypePolicy {
    pub requires_attestation: bool,
    pub updated_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct AssetPolicy {
    pub frozen: bool,
    pub disputed: bool,
    pub revoked: bool,
    pub reason: String,
    pub updated_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct AssetRecord {
    pub token_id: u64,
    pub schema_version: u32,
    pub asset_type: u32,
    pub rights_model: u32,
    pub verification_status: u32,
    pub status_reason: String,
    pub public_metadata_uri: String,
    pub public_metadata_hash: String,
    pub evidence_root: String,
    pub evidence_manifest_hash: String,
    pub property_ref_hash: String,
    pub jurisdiction: String,
    pub cid_hash: String,
    pub tag_hash: String,
    pub issuer: Address,
    pub current_owner: Address,
    pub active_stream_id: u64,
    pub created_at: u64,
    pub updated_at: u64,
    pub verification_updated_at: u64,
}

#[contract]
pub struct RwaRegistryContract;

fn now(env: &Env) -> u64 {
    env.ledger().timestamp()
}

fn storage_get_or_default<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
    default: T,
) -> T
where
    T: Clone + soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
{
    env.storage().persistent().get(key).unwrap_or(default)
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .persistent()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("registry_not_initialized"))
}

fn require_admin(env: &Env, admin: &Address) {
    let stored = read_admin(env);
    if stored != *admin {
        panic!("unauthorized_admin")
    }
    admin.require_auth();
}

fn get_next_token_id(env: &Env) -> u64 {
    storage_get_or_default(env, &DataKey::NextTokenId, 0u64)
}

fn empty_string(env: &Env) -> String {
    String::from_str(env, "")
}

fn read_asset(env: &Env, token_id: u64) -> AssetRecord {
    env.storage()
        .persistent()
        .get(&DataKey::Asset(token_id))
        .unwrap_or_else(|| panic!("asset_not_found"))
}

fn write_asset(env: &Env, asset: &AssetRecord) {
    env.storage()
        .persistent()
        .set(&DataKey::Asset(asset.token_id), asset);
}

fn append_owned_asset(env: &Env, owner: &Address, token_id: u64) {
    let key = DataKey::OwnerAssets(owner.clone());
    let mut assets: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    if !assets.contains(token_id) {
        assets.push_back(token_id);
        env.storage().persistent().set(&key, &assets);
    }
}

fn remove_owned_asset(env: &Env, owner: &Address, token_id: u64) {
    let key = DataKey::OwnerAssets(owner.clone());
    let current: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    let mut next = Vec::new(env);
    for id in current.iter() {
        if id != token_id {
            next.push_back(id);
        }
    }
    env.storage().persistent().set(&key, &next);
}

fn asset_type_policy(env: &Env, asset_type: u32) -> AssetTypePolicy {
    env.storage()
        .persistent()
        .get(&DataKey::AssetTypePolicy(asset_type))
        .unwrap_or(AssetTypePolicy {
            requires_attestation: false,
            updated_at: 0,
        })
}

fn compute_status(policy: &AssetTypePolicy) -> u32 {
    if policy.requires_attestation {
        STATUS_PENDING_ATTESTATION
    } else {
        STATUS_VERIFIED
    }
}

fn verification_status_from_policy(policy: &AssetPolicy, default_status: u32) -> u32 {
    if policy.revoked {
        STATUS_REVOKED
    } else if policy.disputed {
        STATUS_DISPUTED
    } else if policy.frozen {
        STATUS_FROZEN
    } else {
        default_status
    }
}

#[contractimpl]
impl RwaRegistryContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("registry_already_initialized");
        }
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::NextTokenId, &0u64);
    }

    pub fn set_issuer_approval(
        env: Env,
        admin: Address,
        issuer: Address,
        approved: bool,
        note: String,
    ) {
        require_admin(&env, &admin);
        let record = IssuerApproval {
            approved,
            note,
            updated_at: now(&env),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Issuer(issuer), &record);
    }

    pub fn get_issuer_approval(env: Env, issuer: Address) -> IssuerApproval {
        env.storage()
            .persistent()
            .get(&DataKey::Issuer(issuer))
            .unwrap_or(IssuerApproval {
                approved: false,
                note: empty_string(&env),
                updated_at: 0,
            })
    }

    pub fn set_compliance(
        env: Env,
        admin: Address,
        user: Address,
        asset_type: u32,
        approved: bool,
        expiry: u64,
        jurisdiction: String,
    ) {
        require_admin(&env, &admin);
        let record = ComplianceRecord {
            approved,
            expiry,
            jurisdiction,
            updated_at: now(&env),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Compliance(user, asset_type), &record);
    }

    pub fn get_compliance(env: Env, user: Address, asset_type: u32) -> ComplianceRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Compliance(user, asset_type))
            .unwrap_or(ComplianceRecord {
                approved: false,
                expiry: 0,
                jurisdiction: empty_string(&env),
                updated_at: 0,
            })
    }

    pub fn set_asset_type_policy(
        env: Env,
        admin: Address,
        asset_type: u32,
        requires_attestation: bool,
    ) {
        require_admin(&env, &admin);
        env.storage().persistent().set(
            &DataKey::AssetTypePolicy(asset_type),
            &AssetTypePolicy {
                requires_attestation,
                updated_at: now(&env),
            },
        );
    }

    pub fn get_asset_type_policy(env: Env, asset_type: u32) -> AssetTypePolicy {
        asset_type_policy(&env, asset_type)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn mint_asset(
        env: Env,
        issuer: Address,
        asset_type: u32,
        rights_model: u32,
        public_metadata_uri: String,
        public_metadata_hash: String,
        evidence_root: String,
        evidence_manifest_hash: String,
        property_ref_hash: String,
        jurisdiction: String,
        cid_hash: String,
        tag_hash: String,
        status_reason: String,
    ) -> u64 {
        issuer.require_auth();

        let approval = Self::get_issuer_approval(env.clone(), issuer.clone());
        if !approval.approved {
            panic!("issuer_not_onboarded");
        }

        let token_id = get_next_token_id(&env) + 1;
        env.storage().persistent().set(&DataKey::NextTokenId, &token_id);

        let type_policy = asset_type_policy(&env, asset_type);
        let verification_status = compute_status(&type_policy);
        let default_reason = if verification_status == STATUS_PENDING_ATTESTATION {
            String::from_str(&env, "Awaiting required attestations")
        } else {
            String::from_str(&env, "Verified productive rental twin")
        };

        let asset = AssetRecord {
            token_id,
            schema_version: SCHEMA_VERSION,
            asset_type,
            rights_model,
            verification_status,
            status_reason: if status_reason.is_empty() {
                default_reason
            } else {
                status_reason
            },
            public_metadata_uri,
            public_metadata_hash,
            evidence_root,
            evidence_manifest_hash,
            property_ref_hash,
            jurisdiction,
            cid_hash,
            tag_hash,
            issuer: issuer.clone(),
            current_owner: issuer.clone(),
            active_stream_id: 0,
            created_at: now(&env),
            updated_at: now(&env),
            verification_updated_at: now(&env),
        };

        write_asset(&env, &asset);
        append_owned_asset(&env, &issuer, token_id);
        token_id
    }

    pub fn get_asset(env: Env, token_id: u64) -> AssetRecord {
        read_asset(&env, token_id)
    }

    pub fn last_token_id(env: Env) -> u64 {
        get_next_token_id(&env)
    }

    pub fn list_owned_assets(env: Env, owner: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerAssets(owner))
            .unwrap_or(Vec::new(&env))
    }

    pub fn owner_of(env: Env, token_id: u64) -> Address {
        read_asset(&env, token_id).current_owner
    }

    pub fn is_asset_claim_blocked(env: Env, token_id: u64) -> bool {
        let asset = read_asset(&env, token_id);
        matches!(
            asset.verification_status,
            STATUS_FROZEN | STATUS_REVOKED | STATUS_DISPUTED
        )
    }

    pub fn transfer_asset(env: Env, owner: Address, token_id: u64, to: Address) {
        owner.require_auth();
        let mut asset = read_asset(&env, token_id);
        if asset.current_owner != owner {
            panic!("not_asset_owner");
        }
        remove_owned_asset(&env, &asset.current_owner, token_id);
        asset.current_owner = to.clone();
        asset.updated_at = now(&env);
        write_asset(&env, &asset);
        append_owned_asset(&env, &to, token_id);
    }

    pub fn set_verification_status(
        env: Env,
        admin: Address,
        token_id: u64,
        status: u32,
        reason: String,
    ) {
        require_admin(&env, &admin);
        let mut asset = read_asset(&env, token_id);
        asset.verification_status = status;
        asset.status_reason = reason;
        asset.updated_at = now(&env);
        asset.verification_updated_at = now(&env);
        write_asset(&env, &asset);
    }

    pub fn set_asset_policy(
        env: Env,
        admin: Address,
        token_id: u64,
        frozen: bool,
        disputed: bool,
        revoked: bool,
        reason: String,
    ) {
        require_admin(&env, &admin);
        let mut asset = read_asset(&env, token_id);
        let policy = AssetPolicy {
            frozen,
            disputed,
            revoked,
            reason: reason.clone(),
            updated_at: now(&env),
        };
        let base_status = if asset.verification_status == STATUS_DRAFT {
            STATUS_PENDING_ATTESTATION
        } else {
            asset.verification_status
        };
        asset.verification_status = verification_status_from_policy(&policy, base_status);
        asset.status_reason = if reason.is_empty() {
            asset.status_reason
        } else {
            reason
        };
        asset.updated_at = now(&env);
        asset.verification_updated_at = now(&env);
        write_asset(&env, &asset);
    }

    pub fn update_asset_metadata(
        env: Env,
        owner: Address,
        token_id: u64,
        metadata_uri: String,
        cid_hash: String,
        public_metadata_hash: String,
    ) {
        owner.require_auth();
        let mut asset = read_asset(&env, token_id);
        if asset.current_owner != owner {
            panic!("not_asset_owner");
        }
        asset.public_metadata_uri = metadata_uri;
        asset.cid_hash = cid_hash;
        asset.public_metadata_hash = public_metadata_hash;
        asset.updated_at = now(&env);
        write_asset(&env, &asset);
    }

    pub fn update_asset_evidence(
        env: Env,
        owner: Address,
        token_id: u64,
        evidence_root: String,
        evidence_manifest_hash: String,
    ) {
        owner.require_auth();
        let mut asset = read_asset(&env, token_id);
        if asset.current_owner != owner {
            panic!("not_asset_owner");
        }
        asset.evidence_root = evidence_root;
        asset.evidence_manifest_hash = evidence_manifest_hash;
        asset.updated_at = now(&env);
        write_asset(&env, &asset);
    }

    pub fn update_verification_tag(
        env: Env,
        owner: Address,
        token_id: u64,
        tag_hash: String,
    ) {
        owner.require_auth();
        let mut asset = read_asset(&env, token_id);
        if asset.current_owner != owner {
            panic!("not_asset_owner");
        }
        asset.tag_hash = tag_hash;
        asset.updated_at = now(&env);
        write_asset(&env, &asset);
    }

    pub fn bind_active_stream(env: Env, admin: Address, token_id: u64, stream_id: u64) {
        require_admin(&env, &admin);
        let mut asset = read_asset(&env, token_id);
        asset.active_stream_id = stream_id;
        asset.updated_at = now(&env);
        write_asset(&env, &asset);
    }
}

mod test;
