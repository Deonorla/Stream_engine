const { ethers } = require("ethers");

function serializeValue(value) {
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return value.map(serializeValue);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [key, serializeValue(nestedValue)])
        );
    }
    return value;
}

class RWAIndexer {
    constructor({ chainService, store, startBlock = null }) {
        this.chainService = chainService;
        this.store = store;
        this.startBlock = startBlock ?? Number(process.env.RWA_INDEXER_START_BLOCK || 0);
    }

    async sync() {
        if (!this.chainService?.isConfigured()) {
            return { indexed: 0, fromBlock: null, toBlock: null };
        }

        const currentBlock = await this.chainService.getCurrentBlockNumber();
        let fromBlock = await this.store.getLastProcessedBlock();
        fromBlock = fromBlock == null ? this.startBlock : fromBlock + 1;

        if (fromBlock > currentBlock) {
            return { indexed: 0, fromBlock, toBlock: currentBlock };
        }

        const timestampCache = new Map();
        const affectedTokenIds = new Set();
        const pendingStreamLinks = [];
        let indexed = 0;

        if (this.chainService.useSubstrateReads || this.chainService.useSubstrateWrites) {
            indexed += await this.indexSubstrateEvents({
                fromBlock,
                toBlock: currentBlock,
                timestampCache,
                affectedTokenIds,
                pendingStreamLinks,
            });
        } else {
            indexed += await this.indexEvmLogs({
                fromBlock,
                toBlock: currentBlock,
                timestampCache,
                affectedTokenIds,
                pendingStreamLinks,
            });
        }

        for (const streamLink of pendingStreamLinks) {
            const linkedAsset = await this.store.getAsset(streamLink.tokenId);
            if (linkedAsset) {
                linkedAsset.activeStreamId = Number(streamLink.streamId);
                await this.store.upsertAsset(linkedAsset);
            }
        }

        for (const tokenId of affectedTokenIds) {
            try {
                const snapshot = await this.chainService.getAssetSnapshot(tokenId);
                if (snapshot) {
                    await this.store.upsertAsset(snapshot);
                }
            } catch (error) {
                // Continue indexing even if one snapshot fails.
            }
        }

        await this.store.setLastProcessedBlock(currentBlock);
        return { indexed, fromBlock, toBlock: currentBlock };
    }

    async indexEvmLogs({ fromBlock, toBlock, timestampCache, affectedTokenIds, pendingStreamLinks }) {
        let indexed = 0;

        for (const source of this.chainService.getEventSources()) {
            const logs = await this.chainService.provider.getLogs({
                address: source.address,
                fromBlock,
                toBlock,
            });

            for (const log of logs) {
                let parsed;
                try {
                    parsed = source.interface.parseLog(log);
                } catch (error) {
                    continue;
                }
                if (!parsed) {
                    continue;
                }

                indexed += await this.recordParsedActivity({
                    source,
                    parsed,
                    blockNumber: Number(log.blockNumber),
                    txHash: log.transactionHash,
                    logIndex: Number(log.index),
                    timestampCache,
                    affectedTokenIds,
                    pendingStreamLinks,
                });
            }
        }

        return indexed;
    }

    async indexSubstrateEvents({ fromBlock, toBlock, timestampCache, affectedTokenIds, pendingStreamLinks }) {
        await this.chainService.init();
        const api = this.chainService.substrateApi;
        const sources = new Map(
            this.chainService
                .getEventSources()
                .map((source) => [source.address.toLowerCase(), source])
        );
        let indexed = 0;

        for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += 1) {
            const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
            const [events, timestampRaw] = await Promise.all([
                api.query.system.events.at(blockHash),
                api.query.timestamp.now.at(blockHash),
            ]);
            const timestampValue = Number(timestampRaw.toString());
            timestampCache.set(
                blockNumber,
                timestampValue > 1e12 ? Math.floor(timestampValue / 1000) : timestampValue
            );

            const relevantEvents = [];

            for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
                const record = events[eventIndex];
                const event = record.event;
                if (event.section !== "revive" || event.method !== "ContractEmitted") {
                    continue;
                }

                const contractAddress = event.data[0].toString().toLowerCase();
                const source = sources.get(contractAddress);
                if (!source) {
                    continue;
                }

                 relevantEvents.push({ eventIndex, record, event, source });
            }

            if (relevantEvents.length === 0) {
                continue;
            }

            const block = await api.rpc.chain.getBlock(blockHash);
            const txHashes = block.block.extrinsics.map((extrinsic) => extrinsic.hash.toHex());

            for (const { eventIndex, record, event, source } of relevantEvents) {

                let parsed;
                try {
                    parsed = source.interface.parseLog({
                        data: event.data[1].toHex(),
                        topics: event.data[2].map((topic) => topic.toString()),
                    });
                } catch (error) {
                    continue;
                }
                if (!parsed) {
                    continue;
                }

                const txHash = record.phase.isApplyExtrinsic
                    ? txHashes[record.phase.asApplyExtrinsic.toNumber()] || null
                    : null;

                indexed += await this.recordParsedActivity({
                    source,
                    parsed,
                    blockNumber,
                    txHash,
                    logIndex: eventIndex,
                    timestampCache,
                    affectedTokenIds,
                    pendingStreamLinks,
                });
            }
        }

        return indexed;
    }

    async recordParsedActivity({
        source,
        parsed,
        blockNumber,
        txHash,
        logIndex,
        timestampCache,
        affectedTokenIds,
        pendingStreamLinks,
    }) {
        if (!timestampCache.has(blockNumber)) {
            timestampCache.set(blockNumber, await this.chainService.getBlockTimestamp(blockNumber));
        }

        const args = serializeValue(parsed.args.toObject ? parsed.args.toObject() : parsed.args);
        const activity = {
            source: source.name,
            eventName: parsed.name,
            tokenId: args.tokenId != null ? Number(args.tokenId) : null,
            streamId: args.streamId != null ? String(args.streamId) : null,
            actor: args.owner || args.recipient || args.issuer || args.user || args.sender || args.updatedBy || null,
            metadata: args,
            txHash,
            blockNumber,
            logIndex,
            timestamp: timestampCache.get(blockNumber),
            contractAddress: source.address,
        };

        if (activity.tokenId != null) {
            affectedTokenIds.add(activity.tokenId);
        }

        if (parsed.name === "AssetStreamLinked") {
            pendingStreamLinks.push({
                streamId: String(args.streamId),
                tokenId: Number(args.tokenId),
            });
        }

        if (parsed.name === "StreamFreezeUpdated" && activity.tokenId == null) {
            const linkedAsset = await this.store.findAssetByStreamId(activity.streamId);
            if (linkedAsset) {
                activity.tokenId = Number(linkedAsset.tokenId);
                affectedTokenIds.add(activity.tokenId);
            }
        }

        await this.store.recordActivity(activity);
        return 1;
    }
}

module.exports = {
    RWAIndexer,
};
