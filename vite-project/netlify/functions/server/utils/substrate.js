const fs = require("fs");
const path = require("path");
const { ApiPromise, WsProvider } = require("@polkadot/api");
const { Keyring } = require("@polkadot/keyring");
const { cryptoWaitReady, decodeAddress } = require("@polkadot/util-crypto");
const { u8aToHex } = require("@polkadot/util");
const { ethers } = require("ethers");

const DEFAULT_SUBSTRATE_RPC_URL = "wss://asset-hub-paseo-rpc.n.dwellir.com";
const DEFAULT_WEIGHT_LIMIT = {
    refTime: "900000000000",
    proofSize: "5242880",
};
const DEFAULT_STORAGE_DEPOSIT_LIMIT = "5000000000000000000";

function resolveJsonPathCandidates(jsonPath) {
    const fallbackName = path.basename(jsonPath || "substrate.json");
    const candidates = [];

    if (jsonPath) {
        candidates.push(jsonPath);
        if (!path.isAbsolute(jsonPath)) {
            candidates.push(path.resolve(process.cwd(), jsonPath));
        }
    }

    candidates.push(path.join(process.cwd(), fallbackName));
    candidates.push(path.join(process.cwd(), "substrate.json"));

    return [...new Set(candidates)];
}

function findExistingJsonPath(jsonPath) {
    const candidates = resolveJsonPathCandidates(jsonPath);
    const existingPath = candidates.find((candidate) => fs.existsSync(candidate));

    return {
        existingPath: existingPath || "",
        candidates,
    };
}

function resolveSubstrateConfig(overrides = {}) {
    return {
        rpcUrl:
            overrides.rpcUrl
            || process.env.POLKADOT_SUBSTRATE_RPC_URL
            || process.env.SUBSTRATE_RPC_URL
            || DEFAULT_SUBSTRATE_RPC_URL,
        jsonPath:
            overrides.jsonPath
            || process.env.SUBSTRATE_JSON_PATH
            || path.join(process.cwd(), "substrate.json"),
        suri: overrides.suri || process.env.SUBSTRATE_SURI || "",
        password: overrides.password || process.env.SUBSTRATE_PASSWORD || "",
        type: overrides.type || process.env.SUBSTRATE_KEY_TYPE || "sr25519",
        weightLimit: {
            refTime:
                overrides.weightLimit?.refTime
                || process.env.SUBSTRATE_WEIGHT_LIMIT_REF_TIME
                || DEFAULT_WEIGHT_LIMIT.refTime,
            proofSize:
                overrides.weightLimit?.proofSize
                || process.env.SUBSTRATE_WEIGHT_LIMIT_PROOF_SIZE
                || DEFAULT_WEIGHT_LIMIT.proofSize,
        },
        storageDepositLimit:
            overrides.storageDepositLimit
            || process.env.SUBSTRATE_STORAGE_DEPOSIT_LIMIT
            || DEFAULT_STORAGE_DEPOSIT_LIMIT,
    };
}

function resolveAccountIdHex(addressOrBytes) {
    if (typeof addressOrBytes === "string") {
        if (addressOrBytes.startsWith("0x") && addressOrBytes.length === 66) {
            return addressOrBytes.toLowerCase();
        }
        return u8aToHex(decodeAddress(addressOrBytes)).toLowerCase();
    }

    return u8aToHex(addressOrBytes).toLowerCase();
}

function accountIdToEvmAddress(addressOrBytes) {
    const accountIdHex = resolveAccountIdHex(addressOrBytes);
    const accountIdBody = accountIdHex.slice(2);

    if (accountIdBody.endsWith("ee".repeat(12))) {
        return `0x${accountIdBody.slice(0, 40)}`.toLowerCase();
    }

    const digest = ethers.keccak256(accountIdHex);
    return `0x${digest.slice(-40)}`.toLowerCase();
}

async function createSubstrateApi(overrides = {}) {
    const config = resolveSubstrateConfig(overrides);
    const provider = new WsProvider(config.rpcUrl);
    const api = await ApiPromise.create({ provider });
    return { api, config };
}

async function loadSubstrateSigner(overrides = {}) {
    const config = resolveSubstrateConfig(overrides);
    await cryptoWaitReady();

    const keyring = new Keyring({ type: config.type });
    let pair;

    if (config.suri) {
        pair = keyring.addFromUri(config.suri);
    } else {
        const { existingPath, candidates } = findExistingJsonPath(config.jsonPath);
        if (!existingPath) {
            throw new Error(
                `Substrate account export not found. Checked: ${candidates.join(", ")}`
            );
        }
        if (!config.password) {
            throw new Error("SUBSTRATE_PASSWORD is required to unlock the exported account JSON");
        }

        config.jsonPath = existingPath;

        const json = JSON.parse(fs.readFileSync(config.jsonPath, "utf8"));
        pair = keyring.addFromJson(json);
        pair.decodePkcs8(config.password);
    }

    const accountIdHex = resolveAccountIdHex(pair.address);
    const evmAddress = accountIdToEvmAddress(accountIdHex);

    return {
        pair,
        accountIdHex,
        evmAddress,
        config,
    };
}

function createWeight(api, weightLimit) {
    return api.registry.createType("WeightV2", {
        refTime: weightLimit.refTime.toString(),
        proofSize: weightLimit.proofSize.toString(),
    });
}

function decodeDispatchError(api, dispatchError) {
    if (!dispatchError) {
        return "";
    }

    if (dispatchError.isModule) {
        const decoded = api.registry.findMetaError(dispatchError.asModule);
        return `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`;
    }

    return dispatchError.toString();
}

async function signAndSend(api, pair, tx) {
    return new Promise((resolve, reject) => {
        let unsub = null;
        let completed = false;
        const debug = process.env.DEBUG_SUBSTRATE_TX_STATUS === "true";
        const timeoutMs = Number(process.env.SUBSTRATE_TX_TIMEOUT_MS || 90000);
        const finish = (fn) => {
            if (completed) {
                return;
            }
            completed = true;
            clearTimeout(timeoutHandle);
            if (unsub) {
                unsub();
            }
            fn();
        };
        const timeoutHandle = setTimeout(() => {
            finish(() => reject(new Error(`Timed out waiting for extrinsic status after ${timeoutMs}ms`)));
        }, timeoutMs);

        tx.signAndSend(pair, (result) => {
            if (debug) {
                console.log(`[substrate-tx] status=${result.status.type}`);
            }

            if (result.dispatchError) {
                finish(() => reject(new Error(decodeDispatchError(api, result.dispatchError))));
                return;
            }

            const failedEvent = result.events.find(
                ({ event }) => event.section === "system" && event.method === "ExtrinsicFailed"
            );
            if (failedEvent) {
                const [dispatchError] = failedEvent.event.data;
                finish(() => reject(new Error(decodeDispatchError(api, dispatchError))));
                return;
            }

            if (result.status.isInBlock || result.status.isFinalized) {
                const events = result.events.map(({ event }) => ({
                    section: event.section,
                    method: event.method,
                    data: event.data.toJSON(),
                }));

                finish(() => resolve({
                    blockHash: result.status.isFinalized
                        ? result.status.asFinalized.toString()
                        : result.status.asInBlock.toString(),
                    txHash: tx.hash.toHex(),
                    events,
                }));
            }
        })
            .then((nextUnsub) => {
                unsub = nextUnsub;
            })
            .catch((error) => finish(() => reject(error)));
    });
}

async function ensureMapped(api, pair, evmAddress) {
    if (!api.query.revive?.originalAccount || !api.tx.revive?.mapAccount) {
        return { mapped: false, alreadyMapped: false };
    }

    const existing = await api.query.revive.originalAccount(evmAddress);
    if (existing.isSome) {
        return { mapped: true, alreadyMapped: true };
    }

    await signAndSend(api, pair, api.tx.revive.mapAccount());
    return { mapped: true, alreadyMapped: false };
}

async function reviveCall(api, pair, { dest, data, value = 0n, weightLimit, storageDepositLimit }) {
    const effectiveWeightLimit = weightLimit || DEFAULT_WEIGHT_LIMIT;
    const effectiveStorageLimit =
        storageDepositLimit != null ? storageDepositLimit.toString() : DEFAULT_STORAGE_DEPOSIT_LIMIT;

    const tx = api.tx.revive.call(
        dest,
        value.toString(),
        createWeight(api, effectiveWeightLimit),
        effectiveStorageLimit,
        data
    );

    return signAndSend(api, pair, tx);
}

async function reviveRead(api, origin, { dest, data, value = 0n, weightLimit, storageDepositLimit }) {
    const effectiveWeightLimit = weightLimit || DEFAULT_WEIGHT_LIMIT;
    const effectiveStorageLimit =
        storageDepositLimit != null ? storageDepositLimit.toString() : DEFAULT_STORAGE_DEPOSIT_LIMIT;

    const result = await api.call.reviveApi.call(
        origin,
        dest,
        value.toString(),
        createWeight(api, effectiveWeightLimit),
        effectiveStorageLimit,
        data
    );

    if (result.result.isErr) {
        throw new Error(decodeDispatchError(api, result.result.asErr));
    }

    const execution = result.result.asOk;
    const flags = execution.flags?.bits?.toString?.() || "0";
    if (flags !== "0") {
        throw new Error(`Contract reverted with flags=${flags} data=${execution.data.toHex()}`);
    }

    return {
        data: execution.data.toHex(),
        gasConsumed: result.gasConsumed?.toJSON ? result.gasConsumed.toJSON() : result.gasConsumed,
        gasRequired: result.gasRequired?.toJSON ? result.gasRequired.toJSON() : result.gasRequired,
        storageDeposit: result.storageDeposit?.toJSON ? result.storageDeposit.toJSON() : result.storageDeposit,
    };
}

async function instantiateWithCode(
    api,
    pair,
    {
        code,
        data = "0x",
        value = 0n,
        weightLimit,
        storageDepositLimit,
        salt = null,
    }
) {
    const effectiveWeightLimit = weightLimit || DEFAULT_WEIGHT_LIMIT;
    const effectiveStorageLimit =
        storageDepositLimit != null ? storageDepositLimit.toString() : DEFAULT_STORAGE_DEPOSIT_LIMIT;

    const tx = api.tx.revive.instantiateWithCode(
        value.toString(),
        createWeight(api, effectiveWeightLimit),
        effectiveStorageLimit,
        code,
        data,
        salt
    );

    const result = await signAndSend(api, pair, tx);
    const instantiatedEvent = result.events.find(
        (event) => event.section === "revive" && event.method === "Instantiated"
    );

    return {
        ...result,
        contractAddress: instantiatedEvent ? instantiatedEvent.data[1] : null,
    };
}

module.exports = {
    DEFAULT_SUBSTRATE_RPC_URL,
    DEFAULT_WEIGHT_LIMIT,
    DEFAULT_STORAGE_DEPOSIT_LIMIT,
    resolveSubstrateConfig,
    resolveAccountIdHex,
    accountIdToEvmAddress,
    createSubstrateApi,
    loadSubstrateSigner,
    ensureMapped,
    reviveCall,
    reviveRead,
    instantiateWithCode,
    signAndSend,
};
