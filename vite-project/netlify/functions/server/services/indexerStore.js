class MemoryIndexerStore {
    constructor() {
        this.assets = new Map();
        this.activities = new Map();
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
