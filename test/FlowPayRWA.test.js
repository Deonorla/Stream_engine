const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlowPay RWA Module", function () {
    let owner;
    let issuer;
    let buyer;
    let otherAccount;
    let mockUSDC;
    let assetNFT;
    let registry;
    let guard;
    let assetStream;
    let hub;

    const ASSET_TYPE_RENTAL = 1;
    const parseUsdc = (value) => ethers.parseUnits(value, 6);

    async function mintAsset(metadataURI = "ipfs://bafy-flowpay-asset", tagLabel = "tag-a") {
        const cidHash = ethers.keccak256(ethers.toUtf8Bytes(metadataURI));
        const tagHash = ethers.keccak256(ethers.toUtf8Bytes(tagLabel));

        const tx = await hub.mintAsset(metadataURI, ASSET_TYPE_RENTAL, cidHash, tagHash, issuer.address);
        await tx.wait();

        return { tokenId: 1, cidHash, tagHash, metadataURI };
    }

    beforeEach(async function () {
        [owner, issuer, buyer, otherAccount] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        mockUSDC = await MockUSDC.deploy();
        await mockUSDC.waitForDeployment();

        const FlowPayAssetNFT = await ethers.getContractFactory("FlowPayAssetNFT");
        assetNFT = await FlowPayAssetNFT.deploy("FlowPay Rental Asset", "FPRA");
        await assetNFT.waitForDeployment();

        const FlowPayAssetRegistry = await ethers.getContractFactory("FlowPayAssetRegistry");
        registry = await FlowPayAssetRegistry.deploy();
        await registry.waitForDeployment();

        const FlowPayComplianceGuard = await ethers.getContractFactory("FlowPayComplianceGuard");
        guard = await FlowPayComplianceGuard.deploy();
        await guard.waitForDeployment();

        const FlowPayAssetStream = await ethers.getContractFactory("FlowPayAssetStream");
        assetStream = await FlowPayAssetStream.deploy(await mockUSDC.getAddress(), await assetNFT.getAddress());
        await assetStream.waitForDeployment();

        const FlowPayRWAHub = await ethers.getContractFactory("FlowPayRWAHub");
        hub = await FlowPayRWAHub.deploy(
            await assetNFT.getAddress(),
            await registry.getAddress(),
            await guard.getAddress(),
            await assetStream.getAddress()
        );
        await hub.waitForDeployment();

        await assetNFT.setController(await hub.getAddress());
        await registry.setController(await hub.getAddress());
        await guard.setController(await hub.getAddress());
        await assetStream.setHub(await hub.getAddress());
        await assetStream.setComplianceGuard(await guard.getAddress());

        await mockUSDC.mint(issuer.address, parseUsdc("1000"));
        await mockUSDC.mint(buyer.address, parseUsdc("1000"));

        const validUntil = (await ethers.provider.getBlock("latest")).timestamp + 3600;
        await hub.setCompliance(issuer.address, ASSET_TYPE_RENTAL, true, validUntil, "NG");
        await hub.setCompliance(buyer.address, ASSET_TYPE_RENTAL, true, validUntil, "NG");
        await hub.setCompliance(otherAccount.address, ASSET_TYPE_RENTAL, true, validUntil, "US");
    });

    it("mints an asset with IPFS metadata and verification hashes", async function () {
        const { tokenId, cidHash, tagHash, metadataURI } = await mintAsset();

        expect(await assetNFT.ownerOf(tokenId)).to.equal(issuer.address);
        expect(await assetNFT.tokenURI(tokenId)).to.equal(metadataURI);

        const asset = await hub.getAsset(tokenId);
        expect(asset.assetType).to.equal(ASSET_TYPE_RENTAL);
        expect(asset.cidHash).to.equal(cidHash);
        expect(asset.tagHash).to.equal(tagHash);
        expect(asset.issuer).to.equal(issuer.address);
        expect(asset.currentOwner).to.equal(issuer.address);
        expect(asset.metadataURI).to.equal(metadataURI);

        const verification = await hub.getVerificationStatus(tokenId, cidHash, tagHash);
        expect(verification.assetExists).to.equal(true);
        expect(verification.cidMatches).to.equal(true);
        expect(verification.tagMatches).to.equal(true);
    });

    it("streams yield to the current NFT owner after a secondary transfer", async function () {
        const { tokenId } = await mintAsset();
        const deposit = parseUsdc("120");

        await mockUSDC.connect(issuer).approve(await assetStream.getAddress(), deposit);
        await hub.connect(issuer).createAssetYieldStream(tokenId, deposit, 120);

        await ethers.provider.send("evm_increaseTime", [30]);
        await ethers.provider.send("evm_mine");

        const issuerBalanceBefore = await mockUSDC.balanceOf(issuer.address);
        await hub.connect(issuer).claimYield(tokenId);
        const issuerBalanceAfter = await mockUSDC.balanceOf(issuer.address);

        expect(issuerBalanceAfter - issuerBalanceBefore).to.be.closeTo(
            parseUsdc("30"),
            parseUsdc("1")
        );

        await assetNFT.connect(issuer).transferFrom(issuer.address, buyer.address, tokenId);

        await ethers.provider.send("evm_increaseTime", [30]);
        await ethers.provider.send("evm_mine");

        const buyerBalanceBefore = await mockUSDC.balanceOf(buyer.address);
        await hub.connect(buyer).claimYield(tokenId);
        const buyerBalanceAfter = await mockUSDC.balanceOf(buyer.address);

        expect(buyerBalanceAfter - buyerBalanceBefore).to.be.closeTo(
            parseUsdc("30"),
            parseUsdc("3")
        );
    });

    it("reduces future claimable yield after a flash advance until time catches up", async function () {
        const { tokenId } = await mintAsset();
        const deposit = parseUsdc("100");

        await mockUSDC.connect(issuer).approve(await assetStream.getAddress(), deposit);
        await hub.connect(issuer).createAssetYieldStream(tokenId, deposit, 100);

        await hub.connect(issuer).flashAdvance(tokenId, parseUsdc("40"));
        expect(await hub.claimableYield(tokenId)).to.equal(0);

        await ethers.provider.send("evm_increaseTime", [20]);
        await ethers.provider.send("evm_mine");
        expect(await hub.claimableYield(tokenId)).to.equal(0);

        await ethers.provider.send("evm_increaseTime", [25]);
        await ethers.provider.send("evm_mine");

        const claimable = await hub.claimableYield(tokenId);
        expect(claimable).to.be.closeTo(parseUsdc("5"), parseUsdc("1"));
    });

    it("blocks claims and flash advances when compliance is frozen or expired, then restores access", async function () {
        const { tokenId } = await mintAsset();
        const deposit = parseUsdc("100");

        await mockUSDC.connect(issuer).approve(await assetStream.getAddress(), deposit);
        await hub.connect(issuer).createAssetYieldStream(tokenId, deposit, 100);

        await ethers.provider.send("evm_increaseTime", [20]);
        await ethers.provider.send("evm_mine");

        const streamData = await hub.getAssetStream(tokenId);
        await hub.freezeStream(streamData.streamId, true, "KYC review");

        await expect(hub.connect(issuer).claimYield(tokenId)).to.be.revertedWith("FlowPayAssetStream: stream frozen");

        await hub.freezeStream(streamData.streamId, false, "review passed");

        const pastExpiry = (await ethers.provider.getBlock("latest")).timestamp - 1;
        await hub.setCompliance(issuer.address, ASSET_TYPE_RENTAL, true, pastExpiry, "NG");

        await expect(hub.connect(issuer).flashAdvance(tokenId, parseUsdc("10"))).to.be.revertedWith(
            "FlowPayAssetStream: claimant not compliant"
        );

        const validUntil = (await ethers.provider.getBlock("latest")).timestamp + 3600;
        await hub.setCompliance(issuer.address, ASSET_TYPE_RENTAL, true, validUntil, "NG");

        await expect(hub.connect(issuer).flashAdvance(tokenId, parseUsdc("10"))).to.not.be.reverted;
    });

    it("detects CID and verification tag mismatches", async function () {
        const { tokenId, cidHash, tagHash } = await mintAsset();

        const wrongCid = ethers.keccak256(ethers.toUtf8Bytes("ipfs://bafy-wrong"));
        const wrongTag = ethers.keccak256(ethers.toUtf8Bytes("tag-wrong"));

        const mismatch = await hub.getVerificationStatus(tokenId, wrongCid, wrongTag);
        expect(mismatch.assetExists).to.equal(true);
        expect(mismatch.cidMatches).to.equal(false);
        expect(mismatch.tagMatches).to.equal(false);

        const correct = await hub.getVerificationStatus(tokenId, cidHash, tagHash);
        expect(correct.cidMatches).to.equal(true);
        expect(correct.tagMatches).to.equal(true);
    });
});
