const {
    Asset,
    BASE_FEE,
    LiquidityPoolAsset,
    LiquidityPoolFeeV18,
    Operation,
    TransactionBuilder,
    getLiquidityPoolId,
} = require("@stellar/stellar-sdk");
const { formatStellarAmount, normalizeStellarAmount } = require("./stellarAnchorService");

const DEFAULT_CAPS = {
    safe_yield: 60,
    blend_lending: 25,
    stellar_amm: 15,
};

const DEFAULT_RECALL_PRIORITY = {
    stellar_amm: 1,
    blend_lending: 2,
    safe_yield: 3,
};

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function parseEnvJson(name, fallback = []) {
    try {
        const raw = process.env[name];
        if (!raw) {
            return fallback;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function toBigIntAmount(value) {
    return normalizeStellarAmount(value || "0");
}

function sortVenuesByYield(venues = []) {
    return [...venues].sort((left, right) => {
        const apyDelta = Number(right.projectedNetApy || 0) - Number(left.projectedNetApy || 0);
        if (Math.abs(apyDelta) >= 1) {
            return apyDelta > 0 ? 1 : -1;
        }
        const riskDelta = Number(left.riskScore || 0) - Number(right.riskScore || 0);
        if (riskDelta !== 0) {
            return riskDelta;
        }
        return Number(right.liquidityScore || 0) - Number(left.liquidityScore || 0);
    });
}

function assetFromDescriptor(assetCode, assetIssuer) {
    if (!assetCode || String(assetCode).toUpperCase() === "XLM" || !assetIssuer) {
        return Asset.native();
    }
    return new Asset(String(assetCode).toUpperCase(), String(assetIssuer));
}

function parseSorobanArgs(args = [], context = {}) {
    return args.map((arg) => {
        if (typeof arg !== "object" || !arg) {
            return arg;
        }
        let value = arg.value;
        if (typeof value === "string" && value.startsWith("$")) {
            value = context[value.slice(1)];
        }
        return { ...arg, value };
    });
}

function sumAllocated(positions = []) {
    return positions.reduce(
        (sum, position) => sum + BigInt(position?.allocatedAmount || "0"),
        0n
    );
}

function amountToPct(amount, capitalBase) {
    const base = BigInt(capitalBase || "0");
    if (base <= 0n) {
        return 0;
    }
    return Number((BigInt(amount || "0") * 10000n) / base) / 100;
}

function projectedAnnualReturnForPosition(position) {
    const amount = BigInt(position?.allocatedAmount || "0");
    const bps = BigInt(Math.round(Number(position?.projectedNetApy || 0) * 100));
    return (amount * bps) / 10000n;
}

function venueIdentifier(venue = {}, fallback = "unknown") {
    return venue.id || venue.label || venue.contractId || venue.liquidityPoolId || fallback;
}

class TreasuryManager {
    constructor(config = {}) {
        this.chainService = config.chainService;
        this.agentWallet = config.agentWallet;
        this.agentState = config.agentState;
        this.runtime = config.runtime || {};
        this.safeYieldVenues = parseEnvJson("CONTINUUM_SAFE_YIELD_VENUES", []);
        this.blendVenues = parseEnvJson("CONTINUUM_BLEND_VENUES", []);
        this.ammVenues = parseEnvJson("CONTINUUM_AMM_VENUES", []);
    }

    getVenueCatalog() {
        return {
            safe_yield: sortVenuesByYield(this.safeYieldVenues).map((venue) => ({
                ...venue,
                family: "safe_yield",
                capPct: Number(venue.capPct ?? DEFAULT_CAPS.safe_yield),
                recallPriority: DEFAULT_RECALL_PRIORITY.safe_yield,
            })),
            blend_lending: sortVenuesByYield(this.blendVenues).map((venue) => ({
                ...venue,
                family: "blend_lending",
                capPct: Number(venue.capPct ?? DEFAULT_CAPS.blend_lending),
                recallPriority: DEFAULT_RECALL_PRIORITY.blend_lending,
            })),
            stellar_amm: sortVenuesByYield(this.ammVenues).map((venue) => ({
                ...venue,
                family: "stellar_amm",
                capPct: Number(venue.capPct ?? DEFAULT_CAPS.stellar_amm),
                recallPriority: DEFAULT_RECALL_PRIORITY.stellar_amm,
            })),
        };
    }

    healthCheck() {
        const catalog = this.getVenueCatalog();
        const safeYield = {
            ok: catalog.safe_yield.length > 0,
            venues: catalog.safe_yield.map((venue) => venue.id || venue.label || "safe-yield"),
        };
        const blendLending = {
            ok: catalog.blend_lending.length > 0,
            venues: catalog.blend_lending.map((venue) => venue.id || venue.contractId || "blend"),
        };
        const stellarAmm = {
            ok: catalog.stellar_amm.length > 0,
            venues: catalog.stellar_amm.map((venue) => venue.id || venue.liquidityPoolId || "amm"),
        };
        return {
            ok: safeYield.ok && blendLending.ok && stellarAmm.ok,
            configuredFamilies: [
                safeYield.ok ? "safe_yield" : null,
                blendLending.ok ? "blend_lending" : null,
                stellarAmm.ok ? "stellar_amm" : null,
            ].filter(Boolean),
            safeYield,
            blendLending,
            stellarAmm,
        };
    }

    buildSummary({
        positions = [],
        liquidBalance = "0",
        reserved = "0",
        targetReserve = "0",
        capitalBase = "0",
    }) {
        const openPositions = positions.filter((position) => position?.status !== "closed");
        const deployed = sumAllocated(openPositions);
        const projectedAnnualReturn = openPositions.reduce(
            (sum, position) => sum + projectedAnnualReturnForPosition(position),
            0n
        );
        const allocationsByFamily = openPositions.reduce((acc, position) => {
            const family = String(position.strategyFamily || "unknown");
            const current = acc[family] || {
                allocatedAmount: "0",
                projectedAnnualReturn: "0",
                positionCount: 0,
            };
            const nextAllocated = BigInt(current.allocatedAmount) + BigInt(position.allocatedAmount || "0");
            const nextProjected = BigInt(current.projectedAnnualReturn) + projectedAnnualReturnForPosition(position);
            acc[family] = {
                allocatedAmount: nextAllocated.toString(),
                projectedAnnualReturn: nextProjected.toString(),
                allocationPct: amountToPct(nextAllocated, capitalBase),
                positionCount: Number(current.positionCount || 0) + 1,
            };
            return acc;
        }, {});
        const weightedProjectedNetApy = deployed > 0n
            ? Number((projectedAnnualReturn * 10000n) / deployed) / 100
            : 0;

        return {
            liquidBalance: String(liquidBalance),
            reserved: String(reserved),
            targetReserve: String(targetReserve),
            deployed: deployed.toString(),
            deployedPct: amountToPct(deployed, capitalBase),
            liquidPct: amountToPct(BigInt(liquidBalance || "0"), capitalBase),
            projectedAnnualReturn: projectedAnnualReturn.toString(),
            weightedProjectedNetApy,
            openPositions: openPositions.length,
            allocationsByFamily,
            health: this.healthCheck(),
        };
    }

    buildOptimizationReport({
        reason = "rebalanced",
        mandate = {},
        capitalBase = "0",
        deployable = "0",
        liquidBalance = "0",
        reserved = "0",
        targetReserve = "0",
        currentPositions = [],
        nextPositions = [],
        familyPlans = [],
        executedPositions = [],
    }) {
        const before = this.buildSummary({
            positions: currentPositions,
            liquidBalance,
            reserved,
            targetReserve,
            capitalBase,
        });
        const after = this.buildSummary({
            positions: nextPositions,
            liquidBalance,
            reserved,
            targetReserve,
            capitalBase,
        });
        const executedByKey = new Map(
            executedPositions.map((position) => [
                `${position.strategyFamily}:${position.venueId}`,
                position,
            ]),
        );
        return {
            evaluatedAt: nowSeconds(),
            objective: "highest_approved_return_first",
            reason,
            capitalBase: String(capitalBase),
            deployableAmount: String(deployable),
            reservedAmount: String(reserved),
            targetReserve: String(targetReserve),
            allowedStrategies: mandate.allowedTreasuryStrategies || [],
            reservePolicy: mandate.reservePolicy || {
                minLiquidPct: 10,
                targetLiquidPct: 20,
                maxLiquidPct: 30,
            },
            familyCaps: {
                safe_yield: DEFAULT_CAPS.safe_yield,
                blend_lending: DEFAULT_CAPS.blend_lending,
                stellar_amm: DEFAULT_CAPS.stellar_amm,
            },
            recallOrder: ["stellar_amm", "blend_lending", "safe_yield"],
            candidates: familyPlans.map((plan) => {
                const venueId = venueIdentifier(plan.venue, plan.family);
                const selected = executedByKey.get(`${plan.family}:${venueId}`) || null;
                return {
                    strategyFamily: plan.family,
                    venueId,
                    label: plan.venue.label || venueId,
                    projectedNetApy: Number(plan.projectedNetApy || 0),
                    remainingCap: String(plan.remainingCap || "0"),
                    selected: Boolean(selected),
                    allocatedAmount: selected?.allocatedAmount || "0",
                    recallPriority: DEFAULT_RECALL_PRIORITY[plan.family] || 99,
                };
            }),
            execution: {
                deploymentCount: executedPositions.length,
                deployedAmount: executedPositions.reduce(
                    (sum, position) => sum + BigInt(position?.allocatedAmount || "0"),
                    0n,
                ).toString(),
                deployedVenues: executedPositions.map((position) => ({
                    strategyFamily: position.strategyFamily,
                    venueId: position.venueId,
                    allocatedAmount: position.allocatedAmount,
                    projectedNetApy: Number(position.projectedNetApy || 0),
                    txHash: position.txHash || "",
                })),
            },
            before,
            after,
        };
    }

    async rebalance({ ownerPublicKey, agentId }) {
        const mandate = await this.agentState.getMandate(agentId);
        const treasury = await this.agentState.getTreasury(agentId);
        const allowed = new Set(mandate.allowedTreasuryStrategies || []);
        const catalog = this.getVenueCatalog();
        const currentPositions = (treasury.positions || []).filter((position) => position?.status !== "closed");
        const liquidBalance = toBigIntAmount(await this.agentWallet.getBalanceForAsset({
            owner: ownerPublicKey,
            assetCode: "USDC",
            assetIssuer: this.runtime.paymentAssetIssuer || "",
        }));
        const reservations = await this.agentState.listOpenReservations(agentId);
        const reserved = reservations.reduce(
            (sum, reservation) => sum + BigInt(reservation.reservedAmount || "0"),
            0n
        );
        const capitalBase = toBigIntAmount(mandate.capitalBase || "1000");
        const targetReserve = (capitalBase * BigInt(mandate.reservePolicy?.targetLiquidPct || 20)) / 100n;
        const currentDeployed = sumAllocated(currentPositions);
        const liquidDeployable = liquidBalance > reserved + targetReserve
            ? liquidBalance - reserved - targetReserve
            : 0n;
        const capitalDeployable = capitalBase > currentDeployed + reserved + targetReserve
            ? capitalBase - currentDeployed - reserved - targetReserve
            : 0n;
        const deployable = liquidDeployable < capitalDeployable
            ? liquidDeployable
            : capitalDeployable;

        if (deployable <= 0n) {
            const reason = liquidBalance <= reserved + targetReserve
                ? "reserve_floor_blocked"
                : "capital_base_exhausted";
            return this.agentState.setTreasury(agentId, {
                positions: treasury.positions || [],
                reservePolicy: mandate.reservePolicy,
                summary: this.buildSummary({
                    positions: treasury.positions || [],
                    liquidBalance: liquidBalance.toString(),
                    reserved: reserved.toString(),
                    targetReserve: targetReserve.toString(),
                    capitalBase: capitalBase.toString(),
                }),
                optimization: this.buildOptimizationReport({
                    reason,
                    mandate,
                    capitalBase: capitalBase.toString(),
                    deployable: "0",
                    liquidBalance: liquidBalance.toString(),
                    reserved: reserved.toString(),
                    targetReserve: targetReserve.toString(),
                    currentPositions,
                    nextPositions: treasury.positions || [],
                    familyPlans: [],
                    executedPositions: [],
                }),
            });
        }

        const familyPlans = [];
        const familyAllocated = currentPositions.reduce((acc, position) => {
            const family = String(position.strategyFamily || "");
            acc[family] = (acc[family] || 0n) + BigInt(position.allocatedAmount || "0");
            return acc;
        }, {});
        for (const [family, venues] of Object.entries(catalog)) {
            if (!allowed.has(family) || venues.length === 0) {
                continue;
            }
            const capPct = BigInt(Number(venues[0].capPct || DEFAULT_CAPS[family] || 0));
            const capAmount = (capitalBase * capPct) / 100n;
            const currentFamilyAllocated = BigInt(familyAllocated[family] || 0n);
            const remainingCap = capAmount > currentFamilyAllocated
                ? capAmount - currentFamilyAllocated
                : 0n;
            if (remainingCap <= 0n) {
                continue;
            }
            familyPlans.push({
                family,
                venue: venues[0],
                projectedNetApy: Number(venues[0].projectedNetApy || 0),
                remainingCap,
            });
        }
        familyPlans.sort((left, right) => Number(right.projectedNetApy) - Number(left.projectedNetApy));

        let remaining = deployable;
        const nextPositions = [];
        for (const plan of familyPlans) {
            if (remaining <= 0n) {
                break;
            }
            const allocation = remaining > plan.remainingCap ? plan.remainingCap : remaining;
            if (allocation <= 0n) {
                continue;
            }
            let position;
            try {
                position = await this.deployToVenue({
                    ownerPublicKey,
                    agentId,
                    family: plan.family,
                    venue: plan.venue,
                    amount: allocation,
                });
            } catch (deployErr) {
                // Skip venues that fail (misconfigured destination, network error, etc.)
                // Don't crash the whole tick — just log and continue
                console.warn(`[TreasuryManager] Skipping venue ${plan.venue?.id || plan.family}: ${deployErr?.message}`);
                continue;
            }
            nextPositions.push(position);
            remaining -= allocation;
        }

        const allPositions = [...(treasury.positions || []), ...nextPositions];
        return this.agentState.setTreasury(agentId, {
            positions: allPositions,
            reservePolicy: mandate.reservePolicy,
            summary: this.buildSummary({
                positions: allPositions,
                liquidBalance: liquidBalance.toString(),
                reserved: reserved.toString(),
                targetReserve: targetReserve.toString(),
                capitalBase: capitalBase.toString(),
            }),
            optimization: this.buildOptimizationReport({
                reason: nextPositions.length > 0 ? "rebalanced" : "no_eligible_venues",
                mandate,
                capitalBase: capitalBase.toString(),
                deployable: deployable.toString(),
                liquidBalance: liquidBalance.toString(),
                reserved: reserved.toString(),
                targetReserve: targetReserve.toString(),
                currentPositions,
                nextPositions: allPositions,
                familyPlans,
                executedPositions: nextPositions,
            }),
        });
    }

    async recallLiquidity({ ownerPublicKey, agentId, requiredAmount }) {
        let remaining = BigInt(requiredAmount || "0");
        if (remaining <= 0n) {
            return { recalledAmount: "0", recalls: [] };
        }

        const treasury = await this.agentState.getTreasury(agentId);
        const positions = [...(treasury.positions || [])]
            .filter((position) => position.status !== "closed")
            .sort((left, right) => Number(left.recallPriority || 99) - Number(right.recallPriority || 99));

        const recalls = [];
        for (const position of positions) {
            if (remaining <= 0n) {
                break;
            }
            const recall = await this.recallPosition({
                ownerPublicKey,
                position,
                requestedAmount: remaining,
            });
            if (!recall || BigInt(recall.recalledAmount || "0") <= 0n) {
                continue;
            }
            remaining -= BigInt(recall.recalledAmount);
            recalls.push(recall);
        }

        const nextPositions = (treasury.positions || []).map((position) => {
            const recall = recalls.find((entry) => entry.positionId === position.positionId);
            if (!recall) {
                return position;
            }
            const nextAmount = BigInt(position.allocatedAmount || "0") - BigInt(recall.recalledAmount || "0");
            return {
                ...position,
                allocatedAmount: nextAmount > 0n ? nextAmount.toString() : "0",
                status: nextAmount > 0n ? position.status : "closed",
                updatedAt: nowSeconds(),
            };
        });
        await this.agentState.setTreasury(agentId, {
            positions: nextPositions,
            reservePolicy: treasury.reservePolicy,
            summary: this.buildSummary({
                positions: nextPositions,
                liquidBalance: treasury.summary?.liquidBalance || "0",
                reserved: treasury.summary?.reserved || "0",
                targetReserve: treasury.summary?.targetReserve || "0",
                capitalBase: String((await this.agentState.getMandate(agentId)).capitalBase || "0"),
            }),
        });

        return {
            recalledAmount: recalls.reduce(
                (sum, recall) => sum + BigInt(recall.recalledAmount || "0"),
                0n
            ).toString(),
            recalls,
        };
    }

    async deployToVenue({ ownerPublicKey, agentId, family, venue, amount }) {
        if (family === "safe_yield") {
            return this.deploySafeYield({ ownerPublicKey, agentId, venue, amount });
        }
        if (family === "blend_lending") {
            return this.deployBlend({ ownerPublicKey, agentId, venue, amount });
        }
        return this.deployAmm({ ownerPublicKey, agentId, venue, amount });
    }

    async deploySafeYield({ ownerPublicKey, agentId, venue, amount }) {
        const destination = String(
            venue.destination
            || venue.treasuryAddress
            || this.chainService.signer.address
            || ""
        );
        if (!destination) {
            throw Object.assign(new Error("Safe Yield venue is missing a destination account."), {
                status: 400,
                code: "safe_yield_destination_missing",
            });
        }
        const payment = await this.agentWallet.sendAssetPayment({
            owner: ownerPublicKey,
            destination,
            assetCode: "USDC",
            assetIssuer: this.runtime.paymentAssetIssuer || "",
            amount: formatStellarAmount(amount),
            memoText: `safe:${venue.id || "yield"}`,
        });
        await this.agentState.appendDecision(agentId, {
            type: "action",
            message: `Treasury deployed to ${venue.label || venue.id || "Safe Yield"}`,
            detail: `${formatStellarAmount(amount)} USDC allocated to the Safe Yield family.`,
            amount: `-${formatStellarAmount(amount)}`,
        });
        return {
            positionId: `${familyPositionPrefix("safe_yield")}-${Date.now()}`,
            agentId,
            ownerPublicKey,
            strategyFamily: "safe_yield",
            venueId: venue.id || venue.label || "safe_yield",
            assetOrPool: destination,
            allocatedAmount: amount.toString(),
            projectedNetApy: Number(venue.projectedNetApy || 0),
            recallPriority: DEFAULT_RECALL_PRIORITY.safe_yield,
            status: "open",
            txHash: payment.txHash,
            openedAt: nowSeconds(),
        };
    }

    async deployBlend({ ownerPublicKey, agentId, venue, amount }) {
        const kp = await this.agentWallet.resolveKeypair(ownerPublicKey);
        const args = parseSorobanArgs(venue.depositArgs || [
            { type: "address", value: "$agentPublicKey" },
            { type: "i128", value: "$amount" },
        ], {
            agentPublicKey: kp.publicKey(),
            amount,
            amountString: amount.toString(),
        });
        const write = await this.chainService.contractService.invokeWrite({
            contractId: venue.contractId,
            method: venue.depositMethod || "deposit",
            args,
            sourceAccount: kp.publicKey(),
            signerSecret: kp.secret(),
        });
        await this.agentState.appendDecision(agentId, {
            type: "action",
            message: `Treasury deployed to ${venue.label || venue.id || "Blend"}`,
            detail: `${formatStellarAmount(amount)} USDC supplied to the Blend family.`,
            amount: `-${formatStellarAmount(amount)}`,
        });
        return {
            positionId: `${familyPositionPrefix("blend_lending")}-${Date.now()}`,
            agentId,
            ownerPublicKey,
            strategyFamily: "blend_lending",
            venueId: venue.id || venue.contractId,
            assetOrPool: venue.contractId,
            allocatedAmount: amount.toString(),
            projectedNetApy: Number(venue.projectedNetApy || 0),
            recallPriority: DEFAULT_RECALL_PRIORITY.blend_lending,
            status: "open",
            txHash: write.txHash,
            venueConfig: venue,
            openedAt: nowSeconds(),
        };
    }

    async deployAmm({ ownerPublicKey, agentId, venue, amount }) {
        const kp = await this.agentWallet.resolveKeypair(ownerPublicKey);
        const cs = this.chainService.contractService;
        if (!cs.horizonServer || !cs.networkPassphrase) {
            throw Object.assign(new Error("Horizon is required for AMM treasury operations."), {
                status: 503,
                code: "horizon_not_configured",
            });
        }

        const account = await cs.horizonServer.loadAccount(kp.publicKey());
        const assetA = assetFromDescriptor(venue.assetA?.code || "USDC", venue.assetA?.issuer || this.runtime.paymentAssetIssuer || "");
        const assetB = assetFromDescriptor(venue.assetB?.code || "XLM", venue.assetB?.issuer || "");
        const orderedAssets = Asset.compare(assetA, assetB) === 1 ? [assetB, assetA] : [assetA, assetB];
        const lpAsset = new LiquidityPoolAsset(orderedAssets[0], orderedAssets[1], LiquidityPoolFeeV18);
        const liquidityPoolId = venue.liquidityPoolId || getLiquidityPoolId(lpAsset).toString("hex");

        const trustTx = new TransactionBuilder(account, {
            fee: String(BASE_FEE),
            networkPassphrase: cs.networkPassphrase,
        })
            .addOperation(Operation.changeTrust({ asset: lpAsset }))
            .setTimeout(30)
            .build();
        trustTx.sign(kp);
        try {
            await cs.horizonServer.submitTransaction(trustTx);
        } catch {
            // Share trustline may already exist.
        }

        const refreshed = await cs.horizonServer.loadAccount(kp.publicKey());
        const amountA = formatStellarAmount(amount);
        const amountB = String(venue.maxAmountB || "1");
        const depositTx = new TransactionBuilder(refreshed, {
            fee: String(BASE_FEE),
            networkPassphrase: cs.networkPassphrase,
        })
            .addOperation(Operation.liquidityPoolDeposit({
                liquidityPoolId,
                maxAmountA: amountA,
                maxAmountB: amountB,
                minPrice: venue.minPrice || "0.0000001",
                maxPrice: venue.maxPrice || "10000000",
            }))
            .setTimeout(30)
            .build();
        depositTx.sign(kp);
        const result = await cs.horizonServer.submitTransaction(depositTx);

        await this.agentState.appendDecision(agentId, {
            type: "action",
            message: `Treasury deployed to ${venue.label || venue.id || "Stellar AMM"}`,
            detail: `${amountA} USDC routed into the AMM family.`,
            amount: `-${amountA}`,
        });
        return {
            positionId: `${familyPositionPrefix("stellar_amm")}-${Date.now()}`,
            agentId,
            ownerPublicKey,
            strategyFamily: "stellar_amm",
            venueId: venue.id || liquidityPoolId,
            assetOrPool: liquidityPoolId,
            allocatedAmount: amount.toString(),
            projectedNetApy: Number(venue.projectedNetApy || 0),
            recallPriority: DEFAULT_RECALL_PRIORITY.stellar_amm,
            status: "open",
            txHash: result.hash,
            liquidityPoolId,
            venueConfig: venue,
            openedAt: nowSeconds(),
        };
    }

    async recallPosition({ ownerPublicKey, position, requestedAmount }) {
        if (position.strategyFamily === "safe_yield") {
            return this.recallSafeYield({ ownerPublicKey, position, requestedAmount });
        }
        if (position.strategyFamily === "blend_lending") {
            return this.recallBlend({ ownerPublicKey, position, requestedAmount });
        }
        return this.recallAmm({ ownerPublicKey, position, requestedAmount });
    }

    async recallSafeYield({ position, requestedAmount }) {
        const amount = BigInt(position.allocatedAmount || "0");
        const recalledAmount = requestedAmount < amount ? requestedAmount : amount;
        const payment = await this.chainService.anchorService.submitPayment({
            destination: position.agentId || this.chainService.signer.address,
            amount: formatStellarAmount(recalledAmount),
            assetCode: "USDC",
            assetIssuer: this.runtime.paymentAssetIssuer || "",
            memoText: `recall:${position.venueId || "safe"}`,
        });
        return {
            positionId: position.positionId,
            recalledAmount: recalledAmount.toString(),
            txHash: payment.txHash,
        };
    }

    async recallBlend({ ownerPublicKey, position, requestedAmount }) {
        const kp = await this.agentWallet.resolveKeypair(ownerPublicKey);
        const venue = position.venueConfig || {};
        const amount = BigInt(position.allocatedAmount || "0");
        const recalledAmount = requestedAmount < amount ? requestedAmount : amount;
        const args = parseSorobanArgs(venue.withdrawArgs || [
            { type: "address", value: "$agentPublicKey" },
            { type: "i128", value: "$amount" },
        ], {
            agentPublicKey: kp.publicKey(),
            amount: recalledAmount,
            amountString: recalledAmount.toString(),
        });
        const write = await this.chainService.contractService.invokeWrite({
            contractId: position.assetOrPool,
            method: venue.withdrawMethod || "withdraw",
            args,
            sourceAccount: kp.publicKey(),
            signerSecret: kp.secret(),
        });
        return {
            positionId: position.positionId,
            recalledAmount: recalledAmount.toString(),
            txHash: write.txHash,
        };
    }

    async recallAmm({ ownerPublicKey, position }) {
        const kp = await this.agentWallet.resolveKeypair(ownerPublicKey);
        const cs = this.chainService.contractService;
        const venue = position.venueConfig || {};
        const assetA = assetFromDescriptor(venue.assetA?.code || "USDC", venue.assetA?.issuer || this.runtime.paymentAssetIssuer || "");
        const assetB = assetFromDescriptor(venue.assetB?.code || "XLM", venue.assetB?.issuer || "");
        const orderedAssets = Asset.compare(assetA, assetB) === 1 ? [assetB, assetA] : [assetA, assetB];
        const lpAsset = new LiquidityPoolAsset(orderedAssets[0], orderedAssets[1], LiquidityPoolFeeV18);
        const account = await cs.horizonServer.loadAccount(kp.publicKey());
        const shareBalance = (account.balances || []).find(
            (balance) => balance.asset_type === "liquidity_pool_shares" && balance.liquidity_pool_id === position.assetOrPool
        );
        if (!shareBalance || Number(shareBalance.balance || "0") <= 0) {
            return {
                positionId: position.positionId,
                recalledAmount: "0",
                txHash: "",
            };
        }
        const withdrawTx = new TransactionBuilder(account, {
            fee: String(BASE_FEE),
            networkPassphrase: cs.networkPassphrase,
        })
            .addOperation(Operation.liquidityPoolWithdraw({
                liquidityPoolId: position.assetOrPool,
                amount: String(shareBalance.balance),
                minAmountA: "0",
                minAmountB: "0",
            }))
            .setTimeout(30)
            .build();
        withdrawTx.sign(kp);
        const result = await cs.horizonServer.submitTransaction(withdrawTx);
        return {
            positionId: position.positionId,
            recalledAmount: position.allocatedAmount || "0",
            txHash: result.hash,
        };
    }
}

function familyPositionPrefix(family) {
    if (family === "safe_yield") return "safe";
    if (family === "blend_lending") return "blend";
    return "amm";
}

module.exports = {
    TreasuryManager,
};
