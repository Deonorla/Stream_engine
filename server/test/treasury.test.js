const { expect } = require("chai");

const { MemoryIndexerStore } = require("../services/indexerStore");
const { AgentStateService } = require("../services/agentStateService");
const { TreasuryManager } = require("../services/treasuryManager");

describe("TreasuryManager", function () {
    const originalSafeYield = process.env.CONTINUUM_SAFE_YIELD_VENUES;
    const originalBlend = process.env.CONTINUUM_BLEND_VENUES;
    const originalAmm = process.env.CONTINUUM_AMM_VENUES;

    afterEach(() => {
        process.env.CONTINUUM_SAFE_YIELD_VENUES = originalSafeYield;
        process.env.CONTINUUM_BLEND_VENUES = originalBlend;
        process.env.CONTINUUM_AMM_VENUES = originalAmm;
    });

    it("summarizes allocations and avoids duplicate deployments across repeated rebalances", async () => {
        process.env.CONTINUUM_SAFE_YIELD_VENUES = JSON.stringify([
            { id: "safe-core", label: "Safe Core", projectedNetApy: 11.2, capPct: 60, destination: "GSAFEYIELD" },
        ]);
        process.env.CONTINUUM_BLEND_VENUES = JSON.stringify([
            { id: "blend-core", contractId: "CBLEND", projectedNetApy: 13.5, capPct: 25 },
        ]);
        process.env.CONTINUUM_AMM_VENUES = JSON.stringify([
            {
                id: "amm-usdc-xlm",
                liquidityPoolId: "POOL-1",
                projectedNetApy: 12.1,
                capPct: 15,
                assetA: { code: "USDC", issuer: "GUSDCISSUER" },
                assetB: { code: "XLM", issuer: "" },
            },
        ]);

        const store = new MemoryIndexerStore();
        await store.init();
        const agentState = new AgentStateService({ store });
        const ownerPublicKey = "GOWNERPUBLICKEY";
        const agentId = "GAGENTPUBLICKEY";
        await agentState.ensureAgentProfile({
            ownerPublicKey,
            agentPublicKey: agentId,
        });

        const manager = new TreasuryManager({
            runtime: { paymentAssetIssuer: "GUSDCISSUER" },
            chainService: {
                signer: { address: "GSERVICE" },
                runtime: { paymentAssetIssuer: "GUSDCISSUER" },
            },
            agentWallet: {
                async getBalanceForAsset() {
                    return "1000";
                },
            },
            agentState,
        });

        manager.deploySafeYield = async ({ amount, venue, agentId: currentAgentId, ownerPublicKey: currentOwner }) => ({
            positionId: `safe-${Date.now()}`,
            agentId: currentAgentId,
            ownerPublicKey: currentOwner,
            strategyFamily: "safe_yield",
            venueId: venue.id,
            assetOrPool: venue.destination,
            allocatedAmount: amount.toString(),
            projectedNetApy: Number(venue.projectedNetApy || 0),
            recallPriority: 3,
            status: "open",
            txHash: "safe-tx",
            openedAt: Math.floor(Date.now() / 1000),
        });
        manager.deployBlend = async ({ amount, venue, agentId: currentAgentId, ownerPublicKey: currentOwner }) => ({
            positionId: `blend-${Date.now()}`,
            agentId: currentAgentId,
            ownerPublicKey: currentOwner,
            strategyFamily: "blend_lending",
            venueId: venue.id,
            assetOrPool: venue.contractId,
            allocatedAmount: amount.toString(),
            projectedNetApy: Number(venue.projectedNetApy || 0),
            recallPriority: 2,
            status: "open",
            txHash: "blend-tx",
            openedAt: Math.floor(Date.now() / 1000),
        });
        manager.deployAmm = async ({ amount, venue, agentId: currentAgentId, ownerPublicKey: currentOwner }) => ({
            positionId: `amm-${Date.now()}`,
            agentId: currentAgentId,
            ownerPublicKey: currentOwner,
            strategyFamily: "stellar_amm",
            venueId: venue.id,
            assetOrPool: venue.liquidityPoolId,
            allocatedAmount: amount.toString(),
            projectedNetApy: Number(venue.projectedNetApy || 0),
            recallPriority: 1,
            status: "open",
            txHash: "amm-tx",
            openedAt: Math.floor(Date.now() / 1000),
        });

        const first = await manager.rebalance({ ownerPublicKey, agentId });
        expect(first.positions).to.have.length(3);
        expect(first.summary.deployed).to.equal("7500000000");
        expect(first.summary.projectedAnnualReturn).to.equal("911000000");
        expect(first.summary.weightedProjectedNetApy).to.be.closeTo(12.14, 0.01);
        expect(first.summary.allocationsByFamily.safe_yield.allocatedAmount).to.equal("3500000000");
        expect(first.summary.allocationsByFamily.blend_lending.allocatedAmount).to.equal("2500000000");
        expect(first.summary.allocationsByFamily.stellar_amm.allocatedAmount).to.equal("1500000000");
        expect(first.summary.health.ok).to.equal(true);
        expect(first.summary.health.configuredFamilies).to.have.members([
            "safe_yield",
            "blend_lending",
            "stellar_amm",
        ]);
        expect(first.optimization.objective).to.equal("highest_approved_return_first");
        expect(first.optimization.reason).to.equal("rebalanced");
        expect(first.optimization.candidates).to.have.length(3);
        expect(first.optimization.execution.deploymentCount).to.equal(3);
        expect(first.optimization.execution.deployedAmount).to.equal("7500000000");

        const second = await manager.rebalance({ ownerPublicKey, agentId });
        expect(second.positions).to.have.length(3);
        expect(second.summary.deployed).to.equal("7500000000");
        expect(second.summary.openPositions).to.equal(3);
        expect(second.optimization.reason).to.equal("capital_base_exhausted");
        expect(second.optimization.execution.deploymentCount).to.equal(0);
    });
});
