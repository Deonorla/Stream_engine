const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Stream Engine RWA Module", function () {
    let owner;
    let operator;
    let issuer;
    let buyer;
    let lawyer;
    let inspector;
    let mockUSDC;
    let assetNFT;
    let registry;
    let guard;
    let assetStream;
    let attestationRegistry;
    let hub;

    const ASSET_TYPE_RENTAL = 1;
    const RIGHTS_MODEL_VERIFIED_RENTAL = 1;
    const STATUS_PENDING_ATTESTATION = 1;
    const STATUS_VERIFIED = 2;
    const ROLE_LAWYER = 1;
    const ROLE_INSPECTOR = 2;
    const parseUsdc = (value) => ethers.parseUnits(value, 6);

    function hashText(value) {
        return ethers.keccak256(ethers.toUtf8Bytes(value));
    }

    async function mintAsset(overrides = {}) {
        const publicMetadataURI = overrides.publicMetadataURI || "ipfs://bafy-stream-engine-rental";
        const jurisdiction = overrides.jurisdiction || "NG-LA";
        const propertyRef = overrides.propertyRef || "plot-42-block-7";
        const statusReason = overrides.statusReason || "Awaiting attestation review";
        const cidHash = hashText(publicMetadataURI);
        const tagHash = hashText(`tag:${propertyRef}`);
        const publicMetadataHash = hashText(
            overrides.publicMetadataJson || JSON.stringify({ name: "Lagos duplex", rentModel: "streaming" })
        );
        const evidenceRoot = hashText(
            overrides.evidenceManifest || JSON.stringify({ deed: "hash-deed", tax: "hash-tax" })
        );
        const evidenceManifestHash = hashText(
            overrides.evidenceSummary || JSON.stringify({ deed: true, tax: true, valuation: true })
        );
        const propertyRefHash = hashText(propertyRef);

        const tx = await hub.connect(operator).mintAsset(
            publicMetadataURI,
            ASSET_TYPE_RENTAL,
            RIGHTS_MODEL_VERIFIED_RENTAL,
            publicMetadataHash,
            evidenceRoot,
            evidenceManifestHash,
            propertyRefHash,
            jurisdiction,
            cidHash,
            tagHash,
            issuer.address,
            statusReason
        );
        await tx.wait();

        return {
            tokenId: 1,
            publicMetadataURI,
            jurisdiction,
            propertyRefHash,
            publicMetadataHash,
            evidenceRoot,
            evidenceManifestHash,
            cidHash,
            tagHash,
            statusReason,
        };
    }

    beforeEach(async function () {
        [owner, operator, issuer, buyer, lawyer, inspector] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        mockUSDC = await MockUSDC.deploy();
        await mockUSDC.waitForDeployment();

        const StreamEngineAssetNFT = await ethers.getContractFactory("StreamEngineAssetNFT");
        assetNFT = await StreamEngineAssetNFT.deploy("Stream Engine Rental Asset", "SERA");
        await assetNFT.waitForDeployment();

        const StreamEngineAssetRegistry = await ethers.getContractFactory("StreamEngineAssetRegistry");
        registry = await StreamEngineAssetRegistry.deploy();
        await registry.waitForDeployment();

        const StreamEngineComplianceGuard = await ethers.getContractFactory("StreamEngineComplianceGuard");
        guard = await StreamEngineComplianceGuard.deploy();
        await guard.waitForDeployment();

        const StreamEngineAssetStream = await ethers.getContractFactory("StreamEngineAssetStream");
        assetStream = await StreamEngineAssetStream.deploy(await mockUSDC.getAddress(), await assetNFT.getAddress());
        await assetStream.waitForDeployment();

        const StreamEngineAssetAttestationRegistry = await ethers.getContractFactory("StreamEngineAssetAttestationRegistry");
        attestationRegistry = await StreamEngineAssetAttestationRegistry.deploy();
        await attestationRegistry.waitForDeployment();

        const StreamEngineRWAHub = await ethers.getContractFactory("StreamEngineRWAHub");
        hub = await StreamEngineRWAHub.deploy(
            await assetNFT.getAddress(),
            await registry.getAddress(),
            await guard.getAddress(),
            await assetStream.getAddress(),
            await attestationRegistry.getAddress()
        );
        await hub.waitForDeployment();

        await assetNFT.setController(await hub.getAddress());
        await registry.setController(await hub.getAddress());
        await guard.setController(await hub.getAddress());
        await assetStream.setHub(await hub.getAddress());
        await assetStream.setComplianceGuard(await guard.getAddress());
        await attestationRegistry.setController(await hub.getAddress());
        await hub.setOperator(operator.address, true);

        await mockUSDC.mint(issuer.address, parseUsdc("1000"));
        await mockUSDC.mint(buyer.address, parseUsdc("1000"));

        const validUntil = (await ethers.provider.getBlock("latest")).timestamp + 3600;
        await hub.setCompliance(issuer.address, ASSET_TYPE_RENTAL, true, validUntil, "NG");
        await hub.setCompliance(buyer.address, ASSET_TYPE_RENTAL, true, validUntil, "NG");
        await hub.connect(operator).setIssuerApproval(issuer.address, true, "approved property originator");
        await hub.setAttestationPolicy(ASSET_TYPE_RENTAL, ROLE_LAWYER, true, 86400);
        await hub.setAttestationPolicy(ASSET_TYPE_RENTAL, ROLE_INSPECTOR, true, 86400);
    });

    it("lets platform operators onboard and offboard issuers without owner-only mint bottlenecks", async function () {
        await hub.connect(operator).setIssuerApproval(issuer.address, false, "paused for review");
        await expect(
            hub.connect(issuer).setIssuerApproval(issuer.address, true, "self-approval")
        ).to.be.revertedWith("Owned: caller is not operator");

        await hub.connect(operator).setIssuerApproval(issuer.address, true, "re-approved");
        const approval = await guard.getIssuerApproval(issuer.address);
        expect(approval.approved).to.equal(true);
        expect(approval.note).to.equal("re-approved");
        expect(approval.updatedBy).to.equal(await hub.getAddress());
    });

    it("rejects minting when the issuer is not approved", async function () {
        await hub.connect(operator).setIssuerApproval(issuer.address, false, "offboarded issuer");

        await expect(mintAsset()).to.be.revertedWith("StreamEngineRWAHub: issuer not approved");
    });

    it("mints a verified rental twin with evidence and property identity fields", async function () {
        const minted = await mintAsset();

        expect(await assetNFT.ownerOf(minted.tokenId)).to.equal(issuer.address);
        expect(await assetNFT.tokenURI(minted.tokenId)).to.equal(minted.publicMetadataURI);

        const asset = await hub.getAsset(minted.tokenId);
        expect(asset.assetType).to.equal(ASSET_TYPE_RENTAL);
        expect(asset.rightsModel).to.equal(RIGHTS_MODEL_VERIFIED_RENTAL);
        expect(asset.verificationStatus).to.equal(STATUS_PENDING_ATTESTATION);
        expect(asset.propertyRefHash).to.equal(minted.propertyRefHash);
        expect(asset.publicMetadataHash).to.equal(minted.publicMetadataHash);
        expect(asset.evidenceRoot).to.equal(minted.evidenceRoot);
        expect(asset.evidenceManifestHash).to.equal(minted.evidenceManifestHash);
        expect(asset.issuer).to.equal(issuer.address);
        expect(asset.jurisdiction).to.equal(minted.jurisdiction);
        expect(asset.publicMetadataURI).to.equal(minted.publicMetadataURI);
        expect(asset.statusReason).to.equal(minted.statusReason);
    });

    it("starts as verified when the asset type has no required attestation policy", async function () {
        await hub.setAttestationPolicy(ASSET_TYPE_RENTAL, ROLE_LAWYER, false, 0);
        await hub.setAttestationPolicy(ASSET_TYPE_RENTAL, ROLE_INSPECTOR, false, 0);

        const minted = await mintAsset({
            statusReason: "no required attestation policy configured",
        });
        const asset = await hub.getAsset(minted.tokenId);

        expect(asset.verificationStatus).to.equal(STATUS_VERIFIED);
    });

    it("records attestations, supports revocation, and updates verification status", async function () {
        const minted = await mintAsset();

        await hub.connect(operator).registerAttestation(
            minted.tokenId,
            ROLE_LAWYER,
            lawyer.address,
            hashText("evidence:deed"),
            "title_review_complete",
            0
        );
        await hub.connect(operator).registerAttestation(
            minted.tokenId,
            ROLE_INSPECTOR,
            inspector.address,
            hashText("evidence:inspection"),
            "inspection_current",
            0
        );

        const attestationIds = await hub.getAttestationIds(minted.tokenId);
        expect(attestationIds).to.have.length(2);
        expect(await attestationRegistry.getActiveAttestationCount(minted.tokenId, ROLE_LAWYER)).to.equal(1);
        expect(await attestationRegistry.getActiveAttestationCount(minted.tokenId, ROLE_INSPECTOR)).to.equal(1);

        await hub.connect(operator).revokeAttestation(attestationIds[1], "inspection superseded");
        const revokedAttestation = await hub.getAttestation(attestationIds[1]);
        expect(revokedAttestation.revoked).to.equal(true);

        await hub.setVerificationStatus(minted.tokenId, STATUS_VERIFIED, "core attestations recorded");
        const asset = await hub.getAsset(minted.tokenId);
        expect(asset.verificationStatus).to.equal(STATUS_VERIFIED);
        expect(asset.statusReason).to.equal("core attestations recorded");
    });

    it("blocks claims and flash advances when the asset is frozen, disputed, or revoked", async function () {
        const minted = await mintAsset();
        const deposit = parseUsdc("100");

        await mockUSDC.connect(issuer).approve(await assetStream.getAddress(), deposit);
        await hub.connect(issuer).createAssetYieldStream(minted.tokenId, deposit, 100);

        await ethers.provider.send("evm_increaseTime", [20]);
        await ethers.provider.send("evm_mine");

        await hub.setAssetPolicy(minted.tokenId, true, false, false, "rent dispute hold");
        await expect(hub.connect(issuer).claimYield(minted.tokenId)).to.be.revertedWith(
            "StreamEngineAssetStream: asset frozen"
        );

        await hub.setAssetPolicy(minted.tokenId, false, true, false, "tenant dispute");
        await expect(hub.connect(issuer).flashAdvance(minted.tokenId, parseUsdc("10"))).to.be.revertedWith(
            "StreamEngineAssetStream: asset disputed"
        );

        await hub.setAssetPolicy(minted.tokenId, false, false, true, "asset revoked");
        await expect(hub.connect(issuer).flashAdvance(minted.tokenId, parseUsdc("10"))).to.be.revertedWith(
            "StreamEngineAssetStream: asset revoked"
        );
    });

    it("streams future yield to the current NFT owner after a secondary transfer", async function () {
        const minted = await mintAsset();
        const deposit = parseUsdc("120");

        await hub.setVerificationStatus(minted.tokenId, STATUS_VERIFIED, "verified twin");
        await mockUSDC.connect(issuer).approve(await assetStream.getAddress(), deposit);
        await hub.connect(issuer).createAssetYieldStream(minted.tokenId, deposit, 120);

        await ethers.provider.send("evm_increaseTime", [30]);
        await ethers.provider.send("evm_mine");

        const issuerBalanceBefore = await mockUSDC.balanceOf(issuer.address);
        await hub.connect(issuer).claimYield(minted.tokenId);
        const issuerBalanceAfter = await mockUSDC.balanceOf(issuer.address);

        expect(issuerBalanceAfter - issuerBalanceBefore).to.be.closeTo(
            parseUsdc("30"),
            parseUsdc("1")
        );

        await assetNFT.connect(issuer).transferFrom(issuer.address, buyer.address, minted.tokenId);

        await ethers.provider.send("evm_increaseTime", [30]);
        await ethers.provider.send("evm_mine");

        const buyerBalanceBefore = await mockUSDC.balanceOf(buyer.address);
        await hub.connect(buyer).claimYield(minted.tokenId);
        const buyerBalanceAfter = await mockUSDC.balanceOf(buyer.address);

        expect(buyerBalanceAfter - buyerBalanceBefore).to.be.closeTo(
            parseUsdc("30"),
            parseUsdc("3")
        );
    });
});
