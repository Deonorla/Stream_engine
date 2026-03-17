require("dotenv").config();

const { ethers } = require("ethers");
const createApp = require("../server");
const request = require("../server/node_modules/supertest");
const { IPFSService } = require("../server/services/ipfsService");
const { createFlowPayRuntimeConfig } = require("../utils/polkadot");
const {
    createSubstrateApi,
    loadSubstrateSigner,
    ensureMapped,
    reviveCall,
    reviveRead,
} = require("../utils/substrate");

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
];

const FLOWPAY_STREAM_ABI = [
    "event StreamCreated(uint256 indexed streamId, address indexed sender, address indexed recipient, uint256 totalAmount, uint256 startTime, uint256 stopTime, string metadata)",
    "function streams(uint256 streamId) external view returns (address sender, address recipient, uint256 totalAmount, uint256 flowRate, uint256 startTime, uint256 stopTime, uint256 amountWithdrawn, bool isActive, string metadata)",
    "function createStream(address recipient, uint256 duration, uint256 amount, string metadata) external",
];

const HUB_ABI = [
    "event AssetMinted(uint256 indexed tokenId, address indexed issuer, uint8 indexed assetType, string metadataURI)",
    "function mintAsset(string metadataURI, uint8 assetType, bytes32 cidHash, bytes32 tagHash, address issuer) external returns (uint256 tokenId)",
    "function setCompliance(address user, uint8 assetType, bool approved, uint64 expiry, string jurisdiction) external",
    "function createAssetYieldStream(uint256 tokenId, uint256 totalAmount, uint256 duration) external returns (uint256 streamId)",
    "function flashAdvance(uint256 tokenId, uint256 amount) external",
    "function claimYield(uint256 tokenId) external returns (uint256 amountClaimed)",
    "function getAssetStream(uint256 tokenId) external view returns (uint256 streamId, address sender, uint8 assetType, uint256 totalAmount, uint256 flowRate, uint256 startTime, uint256 stopTime, uint256 amountWithdrawn, bool isActive, bool isFrozen)",
];

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

function parseAmount(value, decimals) {
    return ethers.parseUnits(String(value), decimals);
}

async function pause(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNativeAssetBalance(api, assetId, account) {
    const assetAccount = await api.query.assets.account(assetId, account);
    if (assetAccount.isNone) {
        return 0n;
    }

    const unwrapped = assetAccount.unwrap();
    return BigInt(unwrapped.balance.toString());
}

async function readContract(api, account, iface, contractAddress, functionName, args, config) {
    const result = await reviveRead(api, account, {
        dest: contractAddress,
        data: iface.encodeFunctionData(functionName, args),
        weightLimit: config.weightLimit,
        storageDepositLimit: config.storageDepositLimit,
    });
    const decoded = iface.decodeFunctionResult(functionName, result.data);
    return decoded.length === 1 ? decoded[0] : decoded;
}

async function findLatestStreamId(api, account, flowPayInterface, flowPayContractAddress, config, maxScan = 128) {
    let latestStreamId = 0;
    for (let streamId = 1; streamId <= maxScan; streamId += 1) {
        const stream = await readContract(
            api,
            account,
            flowPayInterface,
            flowPayContractAddress,
            "streams",
            [streamId],
            config
        );
        if (!stream.sender || stream.sender === ethers.ZeroAddress) {
            break;
        }
        latestStreamId = streamId;
    }
    return latestStreamId;
}

async function main() {
    const runtime = createFlowPayRuntimeConfig();
    const provider = new ethers.JsonRpcProvider(runtime.rpcUrl);
    const currentBlock = await provider.getBlockNumber();
    let app = null;
    const recipientAddress = requireEnv("FLOWPAY_RECIPIENT_ADDRESS");
    const flowPayContractAddress = requireEnv("FLOWPAY_CONTRACT_ADDRESS");
    const rwaHubAddress = requireEnv("FLOWPAY_RWA_HUB_ADDRESS");
    const assetNFTAddress = requireEnv("FLOWPAY_RWA_ASSET_NFT_ADDRESS");
    const assetStreamAddress = requireEnv("FLOWPAY_RWA_ASSET_STREAM_ADDRESS");

    const { api } = await createSubstrateApi();
    const { pair, accountIdHex, evmAddress, config } = await loadSubstrateSigner();

    try {
        const mapping = await ensureMapped(api, pair, evmAddress);
        console.log("Smoke: mapped account");

        const tokenInterface = new ethers.Interface(ERC20_ABI);
        const flowPayInterface = new ethers.Interface(FLOWPAY_STREAM_ABI);
        const assetNftInterface = new ethers.Interface(["function nextTokenId() external view returns (uint256)"]);
        const hubInterface = new ethers.Interface(HUB_ABI);

        const [substrateBalance, usdcBalance] = await Promise.all([
            api.query.system.account(pair.address),
            getNativeAssetBalance(api, runtime.paymentAssetId, pair.address),
        ]);
        console.log("Smoke: loaded balances");

        const paymentAmount = parseAmount(process.env.SUBSTRATE_PAYMENT_TEST_AMOUNT || "0.1", runtime.paymentTokenDecimals);
        const rwaStreamAmount = parseAmount(process.env.SUBSTRATE_RWA_TEST_AMOUNT || "0.2", runtime.paymentTokenDecimals);
        const flashAdvanceAmount = parseAmount(process.env.SUBSTRATE_RWA_FLASH_ADVANCE_AMOUNT || "0.02", runtime.paymentTokenDecimals);

        if (usdcBalance < paymentAmount + rwaStreamAmount) {
            throw new Error(
                `Substrate mapped account ${evmAddress} has insufficient USDC for smoke tests. Balance=${ethers.formatUnits(usdcBalance, runtime.paymentTokenDecimals)}`
            );
        }

        await reviveCall(api, pair, {
            dest: runtime.paymentTokenAddress,
            data: tokenInterface.encodeFunctionData("approve", [flowPayContractAddress, paymentAmount]),
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log("Smoke: approved payment contract");

        const previousLatestStreamId = await findLatestStreamId(
            api,
            pair.address,
            flowPayInterface,
            flowPayContractAddress,
            config
        );
        await reviveCall(api, pair, {
            dest: flowPayContractAddress,
            data: flowPayInterface.encodeFunctionData("createStream", [
                recipientAddress,
                Number(process.env.SUBSTRATE_PAYMENT_TEST_DURATION || 120),
                paymentAmount,
                JSON.stringify({ mode: "substrate-smoke", account: evmAddress }),
            ]),
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log("Smoke: created payment stream");
        const paymentStreamId = previousLatestStreamId + 1;
        const paymentStream = await readContract(
            api,
            pair.address,
            flowPayInterface,
            flowPayContractAddress,
            "streams",
            [paymentStreamId],
            config
        );
        if (
            !paymentStream.sender
            || paymentStream.sender.toLowerCase() !== evmAddress.toLowerCase()
            || paymentStream.recipient.toLowerCase() !== recipientAddress.toLowerCase()
            || !paymentStream.isActive
        ) {
            throw new Error("Payment smoke test did not create an active stream");
        }

        const ipfsService = new IPFSService();
        const testMetadata = {
            name: `FlowPay RWA Smoke ${Date.now()}`,
            description: "Live Polkadot Hub RWA smoke test asset",
            image: "https://flowpay.dev/rwa-smoke.png",
            attributes: [
                { trait_type: "network", value: runtime.networkName },
                { trait_type: "owner", value: evmAddress },
            ],
        };
        const pinResult = await ipfsService.pinJSON(testMetadata);
        console.log("Smoke: pinned IPFS metadata");
        const tagHash = ethers.keccak256(ethers.toUtf8Bytes(`smoke:${evmAddress}:${pinResult.uri}`));
        const cidHash = ethers.keccak256(ethers.toUtf8Bytes(pinResult.uri));

        const complianceExpiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
        await reviveCall(api, pair, {
            dest: rwaHubAddress,
            data: hubInterface.encodeFunctionData("setCompliance", [evmAddress, 1, true, complianceExpiry, "NG"]),
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log("Smoke: set compliance");

        const tokenId = Number(await readContract(
            api,
            pair.address,
            assetNftInterface,
            assetNFTAddress,
            "nextTokenId",
            [],
            config
        ));
        await reviveCall(api, pair, {
            dest: rwaHubAddress,
            data: hubInterface.encodeFunctionData("mintAsset", [pinResult.uri, 1, cidHash, tagHash, evmAddress]),
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log(`Smoke: minted asset ${tokenId}`);

        await reviveCall(api, pair, {
            dest: runtime.paymentTokenAddress,
            data: tokenInterface.encodeFunctionData("approve", [assetStreamAddress, rwaStreamAmount]),
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log("Smoke: approved asset stream");

        await reviveCall(api, pair, {
            dest: rwaHubAddress,
            data: hubInterface.encodeFunctionData("createAssetYieldStream", [
                tokenId,
                rwaStreamAmount,
                Number(process.env.SUBSTRATE_RWA_TEST_DURATION || 60),
            ]),
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log("Smoke: created asset yield stream");

        if (flashAdvanceAmount > 0n) {
            await reviveCall(api, pair, {
                dest: rwaHubAddress,
                data: hubInterface.encodeFunctionData("flashAdvance", [tokenId, flashAdvanceAmount]),
                weightLimit: config.weightLimit,
                storageDepositLimit: config.storageDepositLimit,
            });
            console.log("Smoke: executed flash advance");
        }

        await pause(Number(process.env.SUBSTRATE_RWA_CLAIM_DELAY_MS || 15000));
        console.log("Smoke: waited for claim window");

        await reviveCall(api, pair, {
            dest: rwaHubAddress,
            data: hubInterface.encodeFunctionData("claimYield", [tokenId]),
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log("Smoke: claimed yield");

        const liveAssetStream = await readContract(
            api,
            pair.address,
            hubInterface,
            rwaHubAddress,
            "getAssetStream",
            [tokenId],
            config
        );
        const boundedStartBlock = Math.max(
            0,
            currentBlock - Number(process.env.SUBSTRATE_SMOKE_INDEXER_BLOCK_WINDOW || 32)
        );
        app = createApp({
            services: {
                ipfsService,
            },
            rwa: {
                startBlock: boundedStartBlock,
            },
        });
        await app.locals.ready;
        console.log("Smoke: app ready");
        const client = request(app);

        const paywallResponse = await client.get("/api/weather");
        console.log("Smoke: paywall checked");
        const assetResponse = await client.get(`/api/rwa/assets/${tokenId}`);
        console.log("Smoke: asset endpoint checked");
        const verifyResponse = await client.post("/api/rwa/verify").send({
            tokenId,
            uri: pinResult.uri,
            tagHash,
        });
        console.log("Smoke: verify endpoint checked");
        const activityResponse = await client.get(`/api/rwa/assets/${tokenId}/activity`);
        console.log("Smoke: activity endpoint checked");

        if (paywallResponse.status !== 402) {
            throw new Error(`Expected /api/weather to return 402, received ${paywallResponse.status}`);
        }
        if (assetResponse.status !== 200) {
            throw new Error(`Expected /api/rwa/assets/${tokenId} to return 200, received ${assetResponse.status}`);
        }
        if (verifyResponse.status !== 200 || !verifyResponse.body?.authentic) {
            throw new Error(`Verification failed for token ${tokenId}`);
        }
        if (activityResponse.status !== 200) {
            throw new Error(`Expected /api/rwa/assets/${tokenId}/activity to return 200, received ${activityResponse.status}`);
        }

        console.log(JSON.stringify({
            network: runtime.networkName,
            chainId: String(runtime.chainId),
            substrateAccount: pair.address,
            accountIdHex,
            evmAddress,
            mapping,
            balances: {
                pas: substrateBalance.data.free.toString(),
                usdc: ethers.formatUnits(usdcBalance, runtime.paymentTokenDecimals),
            },
            payment: {
                streamId: paymentStreamId,
                recipient: recipientAddress,
                amount: ethers.formatUnits(paymentAmount, runtime.paymentTokenDecimals),
                paywallHeaders: {
                    token: paywallResponse.headers["x-flowpay-token"],
                    recipient: paywallResponse.headers["x-flowpay-recipient"],
                    currency: paywallResponse.headers["x-payment-currency"],
                },
            },
            rwa: {
                tokenId,
                metadataURI: pinResult.uri,
                verificationAuthentic: verifyResponse.body.authentic,
                activityCount: activityResponse.body.activity.length,
                stream: {
                    streamId: liveAssetStream.streamId.toString(),
                    totalAmount: liveAssetStream.totalAmount.toString(),
                    amountWithdrawn: liveAssetStream.amountWithdrawn.toString(),
                    isActive: liveAssetStream.isActive,
                    isFrozen: liveAssetStream.isFrozen,
                },
            },
        }, null, 2));
    } finally {
        if (app?.locals?.services?.chainService?.substrateApi && app.locals.services.chainService.substrateApi !== api) {
            await app.locals.services.chainService.substrateApi.disconnect();
        }
        if (app?.locals?.services?.chainService?.provider?.destroy) {
            app.locals.services.chainService.provider.destroy();
        }
        if (app?.locals?.services?.store?.pool?.end) {
            await app.locals.services.store.pool.end();
        }
        if (provider?.destroy) {
            provider.destroy();
        }
        await api.disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
