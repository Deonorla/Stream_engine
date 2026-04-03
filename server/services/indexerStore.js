class MemoryIndexerStore {
    constructor() {
        this.assets = new Map();
        this.activities = new Map();
        this.sessions = new Map();
        this.issuerApprovals = new Map();
        this.counters = new Map();
        this.records = new Map();
        this.lastProcessedBlock = null;
        this.seenActivityKeys = new Set();
    }

    async init() {}

    async getLastProcessedBlock() {
        return this.lastProcessedBlock;
    }

    async setLastProcessedBlock(blockNumber) {
        this.lastProcessedBlock = blockNumber;
    }

    async upsertAsset(asset) {
        this.assets.set(String(asset.tokenId), { ...asset });
    }

    async getAsset(tokenId) {
        return this.assets.get(String(tokenId)) || null;
    }

    async listAssets({ owner } = {}) {
        const assets = Array.from(this.assets.values());
        if (!owner) {
            return assets.sort((left, right) => Number(left.tokenId) - Number(right.tokenId));
        }

        return assets
            .filter((asset) => asset.currentOwner?.toLowerCase() === owner.toLowerCase())
            .sort((left, right) => Number(left.tokenId) - Number(right.tokenId));
    }

    async findAssetByStreamId(streamId) {
        return Array.from(this.assets.values()).find(
            (asset) => String(asset.activeStreamId || "") === String(streamId)
        ) || null;
    }

    async recordActivity(activity) {
        const activityKey = `${activity.txHash}:${activity.logIndex}`;
        if (this.seenActivityKeys.has(activityKey)) {
            return;
        }

        this.seenActivityKeys.add(activityKey);
        const tokenKey = activity.tokenId == null ? "global" : String(activity.tokenId);
        const activities = this.activities.get(tokenKey) || [];
        activities.push({ ...activity });
        activities.sort((left, right) => {
            if (left.blockNumber !== right.blockNumber) {
                return left.blockNumber - right.blockNumber;
            }
            return left.logIndex - right.logIndex;
        });
        this.activities.set(tokenKey, activities);
    }

    async getActivities(tokenId) {
        return this.activities.get(String(tokenId)) || [];
    }

    async getSession(sessionId) {
        return this.sessions.get(String(sessionId)) || null;
    }

    async listSessions({ owner } = {}) {
        const sessions = Array.from(this.sessions.values());
        if (!owner) {
            return sessions.sort((left, right) => Number(left.id) - Number(right.id));
        }

        const normalizedOwner = owner.toLowerCase();
        return sessions
            .filter(
                (session) =>
                    session.sender?.toLowerCase() === normalizedOwner
                    || session.recipient?.toLowerCase() === normalizedOwner
            )
            .sort((left, right) => Number(left.id) - Number(right.id));
    }

    async upsertSession(session) {
        this.sessions.set(String(session.id), { ...session });
    }

    async getIssuerApproval(issuer) {
        return this.issuerApprovals.get(String(issuer).toLowerCase()) || null;
    }

    async upsertIssuerApproval(record) {
        this.issuerApprovals.set(String(record.issuer).toLowerCase(), { ...record });
    }

    async nextCounter(name) {
        const current = Number(this.counters.get(name) || 0) + 1;
        this.counters.set(name, current);
        return current;
    }

    async getRecord(key) {
        return this.records.get(String(key)) || null;
    }

    async upsertRecord(key, payload) {
        this.records.set(String(key), { ...payload });
    }

    async getAgentWallet(ownerPublicKey) {
        return this.records.get(`agent_wallet:${ownerPublicKey.toUpperCase()}`) || null;
    }

    async upsertAgentWallet(record) {
        this.records.set(`agent_wallet:${record.ownerPublicKey.toUpperCase()}`, { ...record });
    }
}

class PostgresIndexerStore {
    constructor(pool) {
        this.pool = pool;
    }

    async init() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS rwa_indexer_state (
                id SMALLINT PRIMARY KEY DEFAULT 1,
                last_processed_block BIGINT
            );
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS rwa_assets (
                token_id TEXT PRIMARY KEY,
                stream_id TEXT,
                owner_address TEXT,
                asset_payload JSONB NOT NULL
            );
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS rwa_activities (
                activity_key TEXT PRIMARY KEY,
                token_id TEXT,
                block_number BIGINT NOT NULL,
                log_index BIGINT NOT NULL,
                payload JSONB NOT NULL
            );
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS rwa_sessions (
                session_id TEXT PRIMARY KEY,
                sender_address TEXT,
                recipient_address TEXT,
                session_payload JSONB NOT NULL
            );
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS rwa_issuer_approvals (
                issuer_address TEXT PRIMARY KEY,
                payload JSONB NOT NULL
            );
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS rwa_counters (
                counter_name TEXT PRIMARY KEY,
                counter_value BIGINT NOT NULL
            );
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS rwa_records (
                record_key TEXT PRIMARY KEY,
                payload JSONB NOT NULL
            );
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS agent_wallets (
                owner_public_key TEXT PRIMARY KEY,
                agent_public_key TEXT NOT NULL,
                encrypted_secret TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
    }

    async getLastProcessedBlock() {
        const result = await this.pool.query("SELECT last_processed_block FROM rwa_indexer_state WHERE id = 1");
        return result.rows[0]?.last_processed_block == null
            ? null
            : Number(result.rows[0].last_processed_block);
    }

    async setLastProcessedBlock(blockNumber) {
        await this.pool.query(
            `
                INSERT INTO rwa_indexer_state (id, last_processed_block)
                VALUES (1, $1)
                ON CONFLICT (id)
                DO UPDATE SET last_processed_block = EXCLUDED.last_processed_block
            `,
            [blockNumber]
        );
    }

    async upsertAsset(asset) {
        await this.pool.query(
            `
                INSERT INTO rwa_assets (token_id, stream_id, owner_address, asset_payload)
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (token_id)
                DO UPDATE SET
                    stream_id = EXCLUDED.stream_id,
                    owner_address = EXCLUDED.owner_address,
                    asset_payload = EXCLUDED.asset_payload
            `,
            [
                String(asset.tokenId),
                asset.activeStreamId == null ? null : String(asset.activeStreamId),
                asset.currentOwner || null,
                JSON.stringify(asset),
            ]
        );
    }

    async getAsset(tokenId) {
        const result = await this.pool.query(
            "SELECT asset_payload FROM rwa_assets WHERE token_id = $1",
            [String(tokenId)]
        );
        return result.rows[0]?.asset_payload || null;
    }

    async listAssets({ owner } = {}) {
        const result = owner
            ? await this.pool.query(
                "SELECT asset_payload FROM rwa_assets WHERE lower(owner_address) = lower($1) ORDER BY token_id::bigint ASC",
                [owner]
            )
            : await this.pool.query(
                "SELECT asset_payload FROM rwa_assets ORDER BY token_id::bigint ASC"
            );

        return result.rows.map((row) => row.asset_payload);
    }

    async findAssetByStreamId(streamId) {
        const result = await this.pool.query(
            "SELECT asset_payload FROM rwa_assets WHERE stream_id = $1 LIMIT 1",
            [String(streamId)]
        );
        return result.rows[0]?.asset_payload || null;
    }

    async recordActivity(activity) {
        const activityKey = `${activity.txHash}:${activity.logIndex}`;
        await this.pool.query(
            `
                INSERT INTO rwa_activities (activity_key, token_id, block_number, log_index, payload)
                VALUES ($1, $2, $3, $4, $5::jsonb)
                ON CONFLICT (activity_key) DO NOTHING
            `,
            [
                activityKey,
                activity.tokenId == null ? null : String(activity.tokenId),
                activity.blockNumber,
                activity.logIndex,
                JSON.stringify(activity),
            ]
        );
    }

    async getActivities(tokenId) {
        const result = await this.pool.query(
            "SELECT payload FROM rwa_activities WHERE token_id = $1 ORDER BY block_number ASC, log_index ASC",
            [String(tokenId)]
        );
        return result.rows.map((row) => row.payload);
    }

    async getSession(sessionId) {
        const result = await this.pool.query(
            "SELECT session_payload FROM rwa_sessions WHERE session_id = $1",
            [String(sessionId)]
        );
        return result.rows[0]?.session_payload || null;
    }

    async listSessions({ owner } = {}) {
        const result = owner
            ? await this.pool.query(
                `
                    SELECT session_payload
                    FROM rwa_sessions
                    WHERE lower(sender_address) = lower($1) OR lower(recipient_address) = lower($1)
                    ORDER BY session_id::bigint ASC
                `,
                [owner]
            )
            : await this.pool.query(
                "SELECT session_payload FROM rwa_sessions ORDER BY session_id::bigint ASC"
            );

        return result.rows.map((row) => row.session_payload);
    }

    async upsertSession(session) {
        await this.pool.query(
            `
                INSERT INTO rwa_sessions (session_id, sender_address, recipient_address, session_payload)
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (session_id)
                DO UPDATE SET
                    sender_address = EXCLUDED.sender_address,
                    recipient_address = EXCLUDED.recipient_address,
                    session_payload = EXCLUDED.session_payload
            `,
            [
                String(session.id),
                session.sender || null,
                session.recipient || null,
                JSON.stringify(session),
            ]
        );
    }

    async getIssuerApproval(issuer) {
        const result = await this.pool.query(
            "SELECT payload FROM rwa_issuer_approvals WHERE issuer_address = lower($1)",
            [String(issuer)]
        );
        return result.rows[0]?.payload || null;
    }

    async upsertIssuerApproval(record) {
        await this.pool.query(
            `
                INSERT INTO rwa_issuer_approvals (issuer_address, payload)
                VALUES (lower($1), $2::jsonb)
                ON CONFLICT (issuer_address)
                DO UPDATE SET payload = EXCLUDED.payload
            `,
            [record.issuer, JSON.stringify(record)]
        );
    }

    async nextCounter(name) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const existing = await client.query(
                "SELECT counter_value FROM rwa_counters WHERE counter_name = $1 FOR UPDATE",
                [name]
            );
            const nextValue = Number(existing.rows[0]?.counter_value || 0) + 1;
            await client.query(
                `
                    INSERT INTO rwa_counters (counter_name, counter_value)
                    VALUES ($1, $2)
                    ON CONFLICT (counter_name)
                    DO UPDATE SET counter_value = EXCLUDED.counter_value
                `,
                [name, nextValue]
            );
            await client.query("COMMIT");
            return nextValue;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getRecord(key) {
        const result = await this.pool.query(
            "SELECT payload FROM rwa_records WHERE record_key = $1",
            [String(key)]
        );
        return result.rows[0]?.payload || null;
    }

    async upsertRecord(key, payload) {
        await this.pool.query(
            `
                INSERT INTO rwa_records (record_key, payload)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (record_key)
                DO UPDATE SET payload = EXCLUDED.payload
            `,
            [String(key), JSON.stringify(payload)]
        );
    }

    async getAgentWallet(ownerPublicKey) {
        const result = await this.pool.query(
            "SELECT owner_public_key, agent_public_key, encrypted_secret FROM agent_wallets WHERE owner_public_key = upper($1)",
            [ownerPublicKey]
        );
        if (!result.rows[0]) return null;
        const row = result.rows[0];
        return { ownerPublicKey: row.owner_public_key, agentPublicKey: row.agent_public_key, encryptedSecret: row.encrypted_secret };
    }

    async upsertAgentWallet(record) {
        await this.pool.query(
            `
                INSERT INTO agent_wallets (owner_public_key, agent_public_key, encrypted_secret)
                VALUES (upper($1), $2, $3)
                ON CONFLICT (owner_public_key) DO NOTHING
            `,
            [record.ownerPublicKey, record.agentPublicKey, record.encryptedSecret]
        );
    }
}

async function createIndexerStore(config = {}) {
    const preferPostgres = Boolean(config.postgresUrl || process.env.POSTGRES_URL);
    if (!preferPostgres) {
        const store = new MemoryIndexerStore();
        await store.init();
        return store;
    }

    try {
        const { Pool } = require("pg");
        const pool = new Pool({
            connectionString: config.postgresUrl || process.env.POSTGRES_URL,
        });
        const store = new PostgresIndexerStore(pool);
        await store.init();
        return store;
    } catch (error) {
        const store = new MemoryIndexerStore();
        await store.init();
        return store;
    }
}

module.exports = {
    MemoryIndexerStore,
    PostgresIndexerStore,
    createIndexerStore,
};
