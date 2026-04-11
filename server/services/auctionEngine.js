const { formatStellarAmount, normalizeStellarAmount } = require("./stellarAnchorService");
const { inferMarketAssetClass, isSupportedProductiveTwin } = require("./rwaAssetScope");

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function auctionKey(auctionId) {
    return `continuum:auction:${Number(auctionId)}`;
}

function auctionBidKey(auctionId, bidId) {
    return `continuum:auction:${Number(auctionId)}:bid:${Number(bidId)}`;
}

function auctionBidIndexKey(auctionId) {
    return `continuum:auction:${Number(auctionId)}:bids`;
}

function auctionIndexKey() {
    return "continuum:auctions:index";
}

function assetAuctionIndexKey(tokenId) {
    return `continuum:asset:${Number(tokenId)}:auctions`;
}

function assetTypeLabel(asset) {
    return inferMarketAssetClass(asset);
}

function normalizeAmount(value) {
    return normalizeStellarAmount(value);
}

function ensureProductiveAsset(asset) {
    if (!isSupportedProductiveTwin(asset)) {
        const error = new Error("Only productive RWA twins can enter Continuum auctions.");
        error.status = 400;
        error.code = "asset_type_not_supported";
        throw error;
    }
    if (asset?.assetPolicy?.frozen || asset?.assetPolicy?.disputed || asset?.assetPolicy?.revoked) {
        const error = new Error("This asset is blocked by policy and cannot enter an auction.");
        error.status = 400;
        error.code = "asset_policy_blocked";
        throw error;
    }
}

function chooseHighestBid(bids = []) {
    return [...bids]
        .filter((bid) => bid.status === "active")
        .sort((left, right) => {
            const amountDelta = BigInt(right.amountStroops) - BigInt(left.amountStroops);
            if (amountDelta !== 0n) {
                return amountDelta > 0n ? 1 : -1;
            }
            return Number(left.placedAt) - Number(right.placedAt);
        })[0] || null;
}

class AuctionEngine {
    constructor(config = {}) {
        this.store = config.store;
        this.chainService = config.chainService;
        this.agentWallet = config.agentWallet;
        this.agentState = config.agentState;
        this.treasuryManager = config.treasuryManager || null;
    }

    async createAuction({
        sellerOwnerPublicKey,
        tokenId,
        reservePrice,
        startTime,
        endTime,
        note = "",
    }) {
        const wallet = await this.agentWallet.getWallet(sellerOwnerPublicKey);
        if (!wallet?.publicKey) {
            throw Object.assign(new Error("Managed agent wallet not found for this seller."), {
                status: 404,
                code: "agent_wallet_not_found",
            });
        }

        const sellerAgentPublicKey = wallet.publicKey;
        const profile = await this.agentState.ensureAgentProfile({
            ownerPublicKey: sellerOwnerPublicKey,
            agentPublicKey: sellerAgentPublicKey,
        });
        const asset = await this.chainService.getAssetSnapshot(Number(tokenId));
        if (!asset) {
            throw Object.assign(new Error(`Asset ${tokenId} was not found.`), {
                status: 404,
                code: "asset_not_found",
            });
        }
        ensureProductiveAsset(asset);
        if (String(asset.currentOwner || "").toUpperCase() !== String(sellerAgentPublicKey).toUpperCase()) {
            throw Object.assign(
                new Error("The managed agent wallet must already own the twin before listing it in an auction."),
                { status: 400, code: "asset_not_owned_by_agent" }
            );
        }

        const normalizedReserve = normalizeAmount(reservePrice);
        const normalizedStart = Math.max(nowSeconds(), Number(startTime || nowSeconds()));
        const normalizedEnd = Math.max(normalizedStart + 60, Number(endTime || normalizedStart + 3600));

        const transfer = await this.agentWallet.transferAsset({
            owner: sellerOwnerPublicKey,
            tokenId: Number(tokenId),
            to: this.chainService.signer.address,
        });

        const auctionId = await this.store.nextCounter("continuumAuctionId");
        const auction = {
            auctionId,
            assetId: Number(tokenId),
            seller: sellerAgentPublicKey,
            sellerOwnerPublicKey: String(sellerOwnerPublicKey || "").toUpperCase(),
            currency: "USDC",
            reservePrice: normalizedReserve.toString(),
            reservePriceDisplay: formatStellarAmount(normalizedReserve),
            startTime: normalizedStart,
            endTime: normalizedEnd,
            status: "active",
            note,
            listedAt: nowSeconds(),
            escrowAddress: this.chainService.signer.address,
            escrowTxHash: transfer.txHash,
            winningBidId: null,
            winningBidAmount: "0",
            assetType: assetTypeLabel(asset),
            issuer: asset.issuer || "",
            title: asset.publicMetadata?.name || asset.name || `Asset #${tokenId}`,
        };
        await this.store.upsertRecord(auctionKey(auctionId), auction);

        const auctionIndex = await this.store.getRecord(auctionIndexKey()) || { auctionIds: [] };
        auctionIndex.auctionIds = Array.from(new Set([...(auctionIndex.auctionIds || []), auctionId]));
        await this.store.upsertRecord(auctionIndexKey(), auctionIndex);

        const assetIndex = await this.store.getRecord(assetAuctionIndexKey(tokenId)) || { auctionIds: [] };
        assetIndex.auctionIds = Array.from(new Set([...(assetIndex.auctionIds || []), auctionId]));
        await this.store.upsertRecord(assetAuctionIndexKey(tokenId), assetIndex);

        await this.store.upsertRecord(auctionBidIndexKey(auctionId), { bidIds: [] });
        await this.agentState.appendDecision(profile.agentId, {
            type: "action",
            message: `Auction #${auctionId} opened`,
            detail: `Twin #${tokenId} moved into escrow with reserve ${auction.reservePriceDisplay} USDC.`,
        });

        return this.getAuction(auctionId);
    }

    async listAuctions({ tokenId, status } = {}) {
        const ids = tokenId
            ? (await this.store.getRecord(assetAuctionIndexKey(tokenId)))?.auctionIds || []
            : (await this.store.getRecord(auctionIndexKey()))?.auctionIds || [];
        const auctions = [];
        for (const id of ids) {
            const auction = await this.getAuction(id);
            if (!auction) {
                continue;
            }
            if (status && auction.status !== status) {
                continue;
            }
            auctions.push(auction);
        }
        return auctions.sort((left, right) => Number(right.listedAt || 0) - Number(left.listedAt || 0));
    }

    async getAuction(auctionId) {
        const auction = await this.store.getRecord(auctionKey(auctionId));
        if (!auction) {
            return null;
        }
        const bidIndex = await this.store.getRecord(auctionBidIndexKey(auctionId)) || { bidIds: [] };
        const bids = [];
        for (const bidId of bidIndex.bidIds || []) {
            const bid = await this.store.getRecord(auctionBidKey(auctionId, bidId));
            if (bid) {
                bids.push(bid);
            }
        }
        const highestBid = chooseHighestBid(bids);
        return {
            ...auction,
            bids,
            highestBid,
            highestBidDisplay: highestBid ? formatStellarAmount(highestBid.amountStroops) : null,
            reserveMet: highestBid ? BigInt(highestBid.amountStroops) >= BigInt(auction.reservePrice || "0") : false,
        };
    }

    async placeBid({ auctionId, bidderOwnerPublicKey, amount, note = "" }) {
        const auction = await this.getAuction(auctionId);
        if (!auction) {
            throw Object.assign(new Error(`Auction ${auctionId} was not found.`), {
                status: 404,
                code: "auction_not_found",
            });
        }
        const currentTime = nowSeconds();
        if (auction.status !== "active" || currentTime < Number(auction.startTime) || currentTime > Number(auction.endTime)) {
            throw Object.assign(new Error("This auction is not currently accepting bids."), {
                status: 400,
                code: "auction_not_active",
            });
        }

        const previousHighestBid = auction.highestBid
            ? {
                ...auction.highestBid,
                bidderOwnerPublicKey: auction.highestBid.bidderOwnerPublicKey || "",
            }
            : null;
        const wallet = await this.agentWallet.getWallet(bidderOwnerPublicKey);
        if (!wallet?.publicKey) {
            throw Object.assign(new Error("Managed agent wallet not found for this bidder."), {
                status: 404,
                code: "agent_wallet_not_found",
            });
        }
        if (String(wallet.publicKey).toUpperCase() === String(auction.seller).toUpperCase()) {
            throw Object.assign(new Error("Seller cannot bid on their own auction."), {
                status: 400,
                code: "seller_bid_blocked",
            });
        }

        const profile = await this.agentState.ensureAgentProfile({
            ownerPublicKey: bidderOwnerPublicKey,
            agentPublicKey: wallet.publicKey,
        });
        const asset = await this.chainService.getAssetSnapshot(Number(auction.assetId));
        if (!asset) {
            throw Object.assign(new Error("Auction asset no longer exists."), {
                status: 404,
                code: "auction_asset_missing",
            });
        }
        ensureProductiveAsset(asset);
        const assetName =
            asset?.publicMetadata?.name
            || asset?.metadata?.name
            || auction?.title
            || `Twin #${Number(auction.assetId)}`;

        const mandate = await this.agentState.getMandate(profile.agentId);
        if (!mandate.approvedAssetClasses.includes(assetTypeLabel(asset))) {
            throw Object.assign(new Error("This mandate does not allow bidding on this asset class."), {
                status: 400,
                code: "mandate_asset_class_blocked",
            });
        }

        const bidAmount = normalizeAmount(amount);
        const highestBid = chooseHighestBid(auction.bids);
        if (highestBid && bidAmount <= BigInt(highestBid.amountStroops || "0")) {
            throw Object.assign(new Error("Bid must be higher than the current winning bid."), {
                status: 400,
                code: "bid_too_low",
            });
        }

        const capitalBase = normalizeAmount(mandate.capitalBase || "1000");
        if (capitalBase > 0n) {
            const assetExposurePct = Number((bidAmount * 10000n) / capitalBase) / 100;
            if (assetExposurePct > Number(mandate.assetCapPct || 25)) {
                throw Object.assign(new Error("Bid would exceed the mandate asset concentration cap."), {
                    status: 400,
                    code: "asset_cap_exceeded",
                    details: { assetExposurePct, assetCapPct: mandate.assetCapPct },
                });
            }
        }
        if (bidAmount > normalizeAmount(mandate.approvalThreshold || "250")) {
            throw Object.assign(new Error("Bid exceeds the mandate approval threshold."), {
                status: 400,
                code: "approval_threshold_exceeded",
            });
        }

        const openReservations = await this.agentState.listOpenReservations(profile.agentId);
        const currentReservation = openReservations.find(
            (reservation) => Number(reservation.auctionId) === Number(auctionId)
        );
        const sameIssuerReserved = openReservations
            .filter((reservation) => String(reservation.issuer || "") === String(asset.issuer || ""))
            .reduce((sum, reservation) => sum + BigInt(reservation.reservedAmount || "0"), 0n);
        if (capitalBase > 0n) {
            const issuerExposureBase = sameIssuerReserved - BigInt(currentReservation?.reservedAmount || "0");
            const issuerExposurePct = Number(((issuerExposureBase + bidAmount) * 10000n) / capitalBase) / 100;
            if (issuerExposurePct > Number(mandate.issuerCapPct || 40)) {
                throw Object.assign(new Error("Bid would exceed the mandate issuer concentration cap."), {
                    status: 400,
                    code: "issuer_cap_exceeded",
                    details: { issuerExposurePct, issuerCapPct: mandate.issuerCapPct },
                });
            }
        }
        const currentlyReserved = BigInt(currentReservation?.reservedAmount || "0");
        if (bidAmount <= currentlyReserved) {
            throw Object.assign(new Error("Bid must be higher than your current reserved bid."), {
                status: 400,
                code: "bid_not_above_existing_reserve",
            });
        }
        const additionalReserve = bidAmount - currentlyReserved;

        let onchainBalance = normalizeAmount(await this.agentWallet.getBalanceForAsset({
            owner: bidderOwnerPublicKey,
            assetCode: "USDC",
            assetIssuer: this.chainService.runtime?.paymentAssetIssuer || "",
        }));

        if (additionalReserve > onchainBalance && this.treasuryManager) {
            await this.treasuryManager.recallLiquidity({
                ownerPublicKey: bidderOwnerPublicKey,
                agentId: profile.agentId,
                requiredAmount: additionalReserve.toString(),
            });
            onchainBalance = normalizeAmount(await this.agentWallet.getBalanceForAsset({
                owner: bidderOwnerPublicKey,
                assetCode: "USDC",
                assetIssuer: this.chainService.runtime?.paymentAssetIssuer || "",
            }));
        }

        const remainingAfterAdditional = onchainBalance - additionalReserve;
        const liquidityFloorAmount = (capitalBase * BigInt(Number(mandate.liquidityFloorPct || 10))) / 100n;
        if (remainingAfterAdditional < 0n || remainingAfterAdditional < liquidityFloorAmount) {
            throw Object.assign(new Error("Bid would violate the mandate liquidity floor."), {
                status: 400,
                code: "liquidity_floor_exceeded",
                details: {
                    requiredFloor: liquidityFloorAmount.toString(),
                    remainingAfterAdditional: remainingAfterAdditional.toString(),
                },
            });
        }

        const payment = additionalReserve > 0n
            ? await this.agentWallet.sendAssetPayment({
                owner: bidderOwnerPublicKey,
                destination: this.chainService.signer.address,
                assetCode: "USDC",
                assetIssuer: this.chainService.runtime?.paymentAssetIssuer || "",
                amount: formatStellarAmount(additionalReserve),
                memoText: `bid:${auctionId}`,
            })
            : { txHash: "" };

        const bidId = await this.store.nextCounter("continuumBidId");
        const bid = {
            bidId,
            auctionId: Number(auctionId),
            assetId: Number(auction.assetId),
            bidder: wallet.publicKey,
            bidderOwnerPublicKey: String(bidderOwnerPublicKey || "").toUpperCase(),
            amountStroops: bidAmount.toString(),
            amountDisplay: formatStellarAmount(bidAmount),
            placedAt: nowSeconds(),
            status: "active",
            note,
            txHash: payment.txHash || currentReservation?.txHash || "",
        };

        if (currentReservation?.bidId) {
            const previousBid = await this.store.getRecord(auctionBidKey(auctionId, currentReservation.bidId));
            if (previousBid) {
                previousBid.status = "superseded";
                previousBid.supersededAt = nowSeconds();
                await this.store.upsertRecord(auctionBidKey(auctionId, currentReservation.bidId), previousBid);
            }
        }

        await this.store.upsertRecord(auctionBidKey(auctionId, bidId), bid);
        const bidIndex = await this.store.getRecord(auctionBidIndexKey(auctionId)) || { bidIds: [] };
        bidIndex.bidIds = [...(bidIndex.bidIds || []), bidId];
        await this.store.upsertRecord(auctionBidIndexKey(auctionId), bidIndex);

        await this.agentState.upsertReservation(profile.agentId, {
            bidId,
            auctionId: Number(auctionId),
            assetId: Number(auction.assetId),
            issuer: asset.issuer || "",
            reservedAmount: bidAmount.toString(),
            txHash: payment.txHash || currentReservation?.txHash || "",
            status: "reserved",
        });

        await this.agentState.recordTradeExecution(profile.agentId, {
            side: "bid",
            tokenId: Number(auction.assetId),
            auctionId: Number(auctionId),
            amount: bid.amountStroops,
            txHash: bid.txHash || "",
            assetName,
            metadata: {
                bidId,
                note,
            },
        });

        const updatedAuction = await this.getAuction(auctionId);
        updatedAuction.winningBidId = updatedAuction.highestBid?.bidId || null;
        updatedAuction.winningBidAmount = updatedAuction.highestBid?.amountStroops || "0";
        await this.store.upsertRecord(auctionKey(auctionId), {
            ...auction,
            winningBidId: updatedAuction.winningBidId,
            winningBidAmount: updatedAuction.winningBidAmount,
            updatedAt: nowSeconds(),
        });

        return {
            bid,
            auction: await this.getAuction(auctionId),
            previousHighestBid,
        };
    }

    async settleAuction({ auctionId }) {
        const auction = await this.getAuction(auctionId);
        if (!auction) {
            throw Object.assign(new Error(`Auction ${auctionId} was not found.`), {
                status: 404,
                code: "auction_not_found",
            });
        }
        if (!["active", "closing"].includes(auction.status)) {
            throw Object.assign(new Error("Auction has already been settled."), {
                status: 400,
                code: "auction_already_settled",
            });
        }
        if (nowSeconds() < Number(auction.endTime)) {
            throw Object.assign(new Error("Auction is still running."), {
                status: 400,
                code: "auction_still_open",
            });
        }

        const asset = await this.chainService.getAssetSnapshot(Number(auction.assetId));
        if (!asset) {
            throw Object.assign(new Error("Auction asset no longer exists."), {
                status: 404,
                code: "auction_asset_missing",
            });
        }
        ensureProductiveAsset(asset);
        const assetName =
            asset?.publicMetadata?.name
            || asset?.metadata?.name
            || auction?.title
            || `Twin #${Number(auction.assetId)}`;

        const highestBid = chooseHighestBid(auction.bids);
        const winningBid = highestBid && BigInt(highestBid.amountStroops) >= BigInt(auction.reservePrice || "0")
            ? highestBid
            : null;

        const refunds = [];
        for (const bid of auction.bids.filter((entry) => entry.status === "active")) {
            if (winningBid && Number(bid.bidId) === Number(winningBid.bidId)) {
                continue;
            }
            const refund = await this.chainService.anchorService.submitPayment({
                destination: bid.bidder,
                amount: formatStellarAmount(bid.amountStroops),
                assetCode: "USDC",
                assetIssuer: this.chainService.runtime?.paymentAssetIssuer || "",
                memoText: `refund:${auctionId}`,
            });
            bid.status = "refunded";
            bid.refundedAt = nowSeconds();
            bid.refundTxHash = refund.txHash;
            await this.store.upsertRecord(auctionBidKey(auctionId, bid.bidId), bid);
            await this.agentState.resolveReservation(String(bid.bidder).toUpperCase(), bid.bidId, {
                status: "released",
                releasedAt: nowSeconds(),
                refundTxHash: refund.txHash,
            });
            const losingProfile = await this.agentState.getAgentProfile(String(bid.bidder).toUpperCase());
            if (losingProfile) {
                await this.agentState.recordAuctionOutcome(losingProfile.agentId, {
                    outcome: "loss",
                    amount: bid.amountStroops,
                    metadata: {
                        auctionId: Number(auctionId),
                        assetId: Number(auction.assetId),
                        releasedAmount: bid.amountStroops,
                    },
                });
                await this.agentState.appendDecision(losingProfile.agentId, {
                    type: "info",
                    message: `Auction #${auctionId} closed without a win`,
                    detail: `${bid.amountDisplay} USDC was released back to the agent wallet.`,
                });
            }
            refunds.push({ bidId: bid.bidId, txHash: refund.txHash, amount: bid.amountDisplay });
        }

        if (!winningBid) {
            const transferBack = await this.chainService.contractService.invokeWrite({
                contractId: this.chainService.assetRegistryAddress,
                method: "transfer_asset",
                args: [
                    { type: "address", value: this.chainService.signer.address },
                    { type: "u64", value: BigInt(Number(auction.assetId)) },
                    { type: "address", value: auction.seller },
                ],
            });
            const noSale = {
                ...auction,
                status: "no_sale",
                settledAt: nowSeconds(),
                settlementTxHash: transferBack.txHash,
            };
            await this.store.upsertRecord(auctionKey(auctionId), noSale);
            await this.agentState.appendDecision(String(auction.seller).toUpperCase(), {
                type: "info",
                message: `Auction #${auctionId} closed without a sale`,
                detail: `Twin #${auction.assetId} returned from escrow to the seller wallet.`,
            });
            return {
                auction: await this.getAuction(auctionId),
                refunds,
                settlement: {
                    txHash: transferBack.txHash,
                    status: "no_sale",
                },
            };
        }

        const payout = await this.chainService.anchorService.submitPayment({
            destination: auction.seller,
            amount: winningBid.amountDisplay,
            assetCode: "USDC",
            assetIssuer: this.chainService.runtime?.paymentAssetIssuer || "",
            memoText: `sale:${auctionId}`,
        });
        const transfer = await this.chainService.contractService.invokeWrite({
            contractId: this.chainService.assetRegistryAddress,
            method: "transfer_asset",
            args: [
                { type: "address", value: this.chainService.signer.address },
                { type: "u64", value: BigInt(Number(auction.assetId)) },
                { type: "address", value: winningBid.bidder },
            ],
        });

        winningBid.status = "won";
        winningBid.settledAt = nowSeconds();
        winningBid.settlementTxHash = transfer.txHash;
        winningBid.payoutTxHash = payout.txHash;
        await this.store.upsertRecord(auctionBidKey(auctionId, winningBid.bidId), winningBid);
        await this.agentState.resolveReservation(String(winningBid.bidder).toUpperCase(), winningBid.bidId, {
            status: "settled",
            settledAt: nowSeconds(),
            settlementTxHash: transfer.txHash,
            payoutTxHash: payout.txHash,
        });

        const winnerProfile = await this.agentState.getAgentProfile(String(winningBid.bidder).toUpperCase());
        if (winnerProfile) {
            await this.agentState.recordTradeExecution(winnerProfile.agentId, {
                side: "buy",
                tokenId: Number(auction.assetId),
                auctionId: Number(auctionId),
                amount: winningBid.amountStroops,
                txHash: transfer.txHash || winningBid.settlementTxHash || "",
                assetName,
                metadata: {
                    bidId: Number(winningBid.bidId),
                    payoutTxHash: payout.txHash || "",
                },
            });
            await this.agentState.recordAuctionOutcome(winnerProfile.agentId, {
                outcome: "win",
                amount: winningBid.amountStroops,
                metadata: {
                    auctionId: Number(auctionId),
                    assetId: Number(auction.assetId),
                    assetName,
                    winningBidAmount: winningBid.amountStroops,
                },
            });
            await this.agentState.appendDecision(winnerProfile.agentId, {
                type: "profit",
                message: `Auction #${auctionId} won`,
                detail: `${assetName} (twin #${auction.assetId}) transferred into the agent portfolio.`,
            });
        }
        const sellerProfile = await this.agentState.getAgentProfile(String(auction.seller).toUpperCase());
        if (sellerProfile) {
            const sellerPerformance = await this.agentState.recordTradeExecution(sellerProfile.agentId, {
                side: "sell",
                tokenId: Number(auction.assetId),
                auctionId: Number(auctionId),
                amount: winningBid.amountStroops,
                txHash: payout.txHash || "",
                assetName,
                metadata: {
                    settlementTxHash: transfer.txHash || "",
                    buyer: winningBid.bidder,
                },
            });
            await this.agentState.appendDecision(sellerProfile.agentId, {
                type: "profit",
                message: `Auction #${auctionId} sold`,
                detail: `${assetName} sold for ${winningBid.amountDisplay} USDC · realized trade PnL ${sellerPerformance.realizedTradePnL || "0"} stroops.`,
                amount: `+${winningBid.amountDisplay}`,
            });
        } else {
            await this.agentState.appendDecision(String(auction.seller).toUpperCase(), {
                type: "profit",
                message: `Auction #${auctionId} sold`,
                detail: `${assetName} sold for ${winningBid.amountDisplay} USDC.`,
                amount: `+${winningBid.amountDisplay}`,
            });
        }

        const nextAuction = {
            ...auction,
            status: "settled",
            winningBidId: winningBid.bidId,
            winningBidAmount: winningBid.amountStroops,
            settledAt: nowSeconds(),
            settlementTxHash: transfer.txHash,
            sellerPayoutTxHash: payout.txHash,
        };
        await this.store.upsertRecord(auctionKey(auctionId), nextAuction);

        const refreshedAsset = await this.chainService.getAssetSnapshot(Number(auction.assetId));
        if (refreshedAsset) {
            await this.chainService.store.upsertAsset(refreshedAsset);
        }

        return {
            auction: await this.getAuction(auctionId),
            winningBid,
            refunds,
            settlement: {
                txHash: transfer.txHash,
                payoutTxHash: payout.txHash,
                status: "settled",
            },
        };
    }
}

module.exports = {
    AuctionEngine,
};
