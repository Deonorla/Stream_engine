const { ethers } = require('ethers');
const {
    createSubstrateApi,
    loadSubstrateSigner,
    ensureMapped,
    reviveRead,
} = require('../../utils/substrate');

/**
 * FlowPay x402 Express Middleware
 * @param {Object} config Middleware configuration
 * @param {Object} config.routes Map of routes to pricing config
 * @param {string} config.paymentTokenAddress ERC-20 compatible payment token address
 * @param {string} config.recipientAddress Recipient address for payments
 * @param {string} config.flowPayContractAddress FlowPayStream Contract Address
 * @param {string} config.rpcUrl RPC URL for blockchain connection
 * @param {string} config.tokenSymbol Display symbol for payment token
 * @param {number} config.tokenDecimals Decimal precision for payment token
 * @param {string} config.apiKey Optional API Key for authentication
 * @param {string} config.privateKey Optional private key for server-side signing if needed (not used for verification)
 */
const flowPayMiddleware = (config) => {
    const paymentTokenAddress = config.paymentTokenAddress || config.mneeAddress || '';
    const tokenSymbol = config.tokenSymbol || 'USDC';
    const tokenDecimals = Number.isFinite(Number(config.tokenDecimals)) ? Number(config.tokenDecimals) : 6;
    const useSubstrateReads = Boolean(
        config.useSubstrateReads
        || process.env.FLOWPAY_USE_SUBSTRATE_READS === 'true'
        || process.env.FLOWPAY_USE_SUBSTRATE_WRITES === 'true'
    );
    const flowPayInterface = new ethers.Interface([
        "function isStreamActive(uint256 streamId) external view returns (bool)",
        "function getClaimableBalance(uint256 streamId) external view returns (uint256)",
        "function streams(uint256 streamId) external view returns (address sender, address recipient, uint256 totalAmount, uint256 flowRate, uint256 startTime, uint256 stopTime, uint256 amountWithdrawn, bool isActive, string metadata)"
    ]);
    // Initialize provider and contract OR use mock
    let flowPayContract;
    let substrateReadyPromise = null;

    if (config.mockContract) {
        flowPayContract = config.mockContract;
    } else {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        flowPayContract = new ethers.Contract(
            config.flowPayContractAddress,
            flowPayInterface.fragments,
            provider
        );
    }

    async function getSubstrateState() {
        if (!substrateReadyPromise) {
            substrateReadyPromise = (async () => {
                const { api, config: substrateConfig } = await createSubstrateApi();
                const { pair, evmAddress } = await loadSubstrateSigner();
                await ensureMapped(api, pair, evmAddress);
                return { api, pair, substrateConfig };
            })();
        }

        return substrateReadyPromise;
    }

    async function readFlowPay(functionName, args = []) {
        if (config.mockContract) {
            return flowPayContract[functionName](...args);
        }

        if (!useSubstrateReads) {
            return flowPayContract[functionName](...args);
        }

        const { api, pair, substrateConfig } = await getSubstrateState();
        const result = await reviveRead(api, pair.address, {
            dest: config.flowPayContractAddress,
            data: flowPayInterface.encodeFunctionData(functionName, args),
            weightLimit: substrateConfig.weightLimit,
            storageDepositLimit: substrateConfig.storageDepositLimit,
        });
        const decoded = flowPayInterface.decodeFunctionResult(functionName, result.data);
        return decoded.length === 1 ? decoded[0] : decoded;
    }

    return async (req, res, next) => {
        const path = req.path;

        // Find matching route config
        // Simple exact match or simple prefix match logic
        let routeConfig = config.routes[path];
        if (!routeConfig) {
            // Try finding a matching prefix if exact match fails
            const matchingKey = Object.keys(config.routes).find(key => path.startsWith(key));
            if (matchingKey) {
                routeConfig = config.routes[matchingKey];
            }
        }

        // If route is not configured for payment, proceed freely
        if (!routeConfig) {
            return next();
        }

        // 0. API Key Authentication (Requirement 3.4)
        if (config.apiKey) {
            const clientKey = req.headers['x-api-key'];
            if (!clientKey || clientKey !== config.apiKey) {
                return res.status(401).json({ error: "Unauthorized: Invalid or missing API Key" });
            }
        }

        const streamIdHeader = req.headers['x-flowpay-stream-id'];
        const txHashHeader = req.headers['x-flowpay-tx-hash'];
        const isFreeRoute =
            routeConfig.mode === 'free'
            || Number(routeConfig.price || '0') <= 0;

        if (isFreeRoute) {
            req.flowPay = { mode: 'free' };
            return next();
        }

        // 1. Check for Direct Payment (Tx Hash) (Requirement: Hybrid Mode)
        if (txHashHeader) {
            try {
                // In a real implementation, we would:
                // 1. Fetch tx receipt from provider
                // 2. Verify receiver == configured payment token recipient
                // 3. Verify amount >= routeConfig.price
                // 4. Verify status == 1 (success)
                // 5. Verify tx hash hasn't been used before (replay protection)

                // For Hackathon/Mock: We assume if the hash matches a pattern/mock or just exists, it's valid if using mockContract
                // Or if we have a provider, we could attempt to look it up. 
                // Let's implement a basic mock verification if config.mockContract exists.

                let isValidPayment = false;
                if (config.mockContract) {
                    // Mock validation
                    isValidPayment = true;
                    console.log(`[FlowPay] Validated Direct Payment Tx: ${txHashHeader}`);
                } else {
                    // Real provider validation (TODO: Implement full verification)
                    // For now, optimistic acceptance for valid-looking hashes
                    if (txHashHeader.startsWith('0x') && txHashHeader.length === 66) {
                        isValidPayment = true;
                    }
                }

                if (isValidPayment) {
                    console.log(`[FlowPay] Request accepted for ${path} using Direct Payment Tx: ${txHashHeader}`);
                    req.flowPay = { txHash: txHashHeader, mode: 'direct' };
                    return next();
                }
            } catch (e) {
                console.error("Direct payment verification failed:", e);
            }
        }

        // Calculate required amount from route config
        const requiredAmount = ethers.parseUnits(routeConfig.price || '0', tokenDecimals);

        // 2. Check for Stream ID Header
        if (!streamIdHeader) {
            return send402Response(res, routeConfig, config, requiredAmount);
        }

        try {
            // 2. Verify Stream ID
            const streamId = BigInt(streamIdHeader);
            const isActive = await readFlowPay('isStreamActive', [streamId]);

            if (!isActive) {
                // Stream exists but is inactive
                return res.status(402).json({
                    error: "Stream is inactive",
                    detail: "The provided stream ID is not active. Please open a new stream or top up."
                });
            }

            if (config.recipientAddress && typeof flowPayContract.streams === 'function') {
                const stream = await readFlowPay('streams', [streamId]);
                const streamRecipient = stream.recipient || stream[1];
                if (
                    streamRecipient &&
                    streamRecipient.toLowerCase() !== config.recipientAddress.toLowerCase()
                ) {
                    return res.status(402).json({
                        error: "Stream recipient mismatch",
                        detail: "The provided stream does not pay this service recipient."
                    });
                }
            }

            // Track metrics (simple console log for MVP)
            console.log(`[FlowPay] Request accepted for ${path} using Stream #${streamId}`);

            // Attach stream info to request for downstream use
            req.flowPay = {
                streamId: streamId.toString()
            };

            next();
        } catch (error) {
            console.error("[FlowPay] Stream verification failed:", error);
            // Fallback to 402 if verification crashes (safe default)
            const requiredAmountFallback = ethers.parseUnits(routeConfig.price || '0', tokenDecimals);
            return send402Response(res, routeConfig, config, requiredAmountFallback);
        }
    };
};

function send402Response(res, routeConfig, config, requiredAmount) {
    const paymentTokenAddress = config.paymentTokenAddress || config.mneeAddress || '';
    const tokenSymbol = config.tokenSymbol || 'USDC';
    const tokenDecimals = Number.isFinite(Number(config.tokenDecimals)) ? Number(config.tokenDecimals) : 6;

    res.set('X-Payment-Required', 'true');
    res.set('X-FlowPay-Mode', routeConfig.mode || 'streaming');
    res.set('X-FlowPay-Rate', ethers.formatUnits(requiredAmount, tokenDecimals));
    res.set('X-FlowPay-Token', paymentTokenAddress);
    res.set('X-FlowPay-Token-Decimals', String(tokenDecimals));
    res.set('X-Payment-Currency', tokenSymbol);
    res.set('X-MNEE-Address', paymentTokenAddress);
    res.set('X-FlowPay-Contract', config.flowPayContractAddress || '');
    res.set('X-FlowPay-Recipient', config.recipientAddress || '');

    res.status(402).json({
        message: "Payment Required",
        requirements: {
            mode: routeConfig.mode || 'streaming',
            price: ethers.formatUnits(requiredAmount, tokenDecimals),
            currency: tokenSymbol,
            contract: config.flowPayContractAddress,
            recipient: config.recipientAddress,
            token: paymentTokenAddress,
            decimals: tokenDecimals,
        }
    });
}

module.exports = flowPayMiddleware;
