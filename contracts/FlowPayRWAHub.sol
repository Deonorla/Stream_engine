// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./utils/Owned.sol";
import "./FlowPayAssetNFT.sol";
import "./FlowPayAssetRegistry.sol";
import "./FlowPayComplianceGuard.sol";
import "./FlowPayAssetStream.sol";
import "./FlowPayAssetAttestationRegistry.sol";

contract FlowPayRWAHub is Owned {
    uint8 private constant MIN_ATTESTATION_ROLE = 1;
    uint8 private constant MAX_ATTESTATION_ROLE = 7;
    uint8 public constant STATUS_PENDING_ATTESTATION = 1;
    uint8 public constant STATUS_VERIFIED = 2;
    uint8 public constant STATUS_FROZEN = 5;
    uint8 public constant STATUS_REVOKED = 6;
    uint8 public constant STATUS_DISPUTED = 7;

    struct AssetView {
        uint8 assetType;
        uint8 rightsModel;
        uint8 verificationStatus;
        bytes32 cidHash;
        bytes32 tagHash;
        bytes32 propertyRefHash;
        bytes32 publicMetadataHash;
        bytes32 evidenceRoot;
        bytes32 evidenceManifestHash;
        address issuer;
        uint256 activeStreamId;
        string jurisdiction;
        string publicMetadataURI;
        string statusReason;
        uint64 createdAt;
        uint64 updatedAt;
        uint64 verificationUpdatedAt;
        bool exists;
        address currentOwner;
    }

    FlowPayAssetNFT public immutable assetNFT;
    FlowPayAssetRegistry public immutable assetRegistry;
    FlowPayComplianceGuard public immutable complianceGuard;
    FlowPayAssetStream public immutable assetStream;
    FlowPayAssetAttestationRegistry public immutable attestationRegistry;

    event AssetMinted(
        uint256 indexed tokenId,
        address indexed issuer,
        uint8 indexed assetType,
        uint8 rightsModel,
        string publicMetadataURI,
        bytes32 publicMetadataHash,
        bytes32 evidenceRoot,
        bytes32 propertyRefHash
    );
    event VerificationPayloadUpdated(uint256 indexed tokenId, bytes32 cidHash, bytes32 tagHash);
    event AssetVerificationStateUpdated(uint256 indexed tokenId, uint8 indexed status, string reason);
    event AssetEvidenceUpdated(uint256 indexed tokenId, bytes32 evidenceRoot, bytes32 evidenceManifestHash);
    event AttestationRecorded(
        uint256 indexed tokenId,
        uint256 indexed attestationId,
        uint8 indexed role,
        address attestor,
        bytes32 evidenceHash,
        string statementType
    );
    event AttestationRevoked(uint256 indexed tokenId, uint256 indexed attestationId, string reason);

    constructor(
        address assetNFT_,
        address assetRegistry_,
        address complianceGuard_,
        address assetStream_,
        address attestationRegistry_
    ) {
        require(assetNFT_ != address(0), "FlowPayRWAHub: nft is zero");
        require(assetRegistry_ != address(0), "FlowPayRWAHub: registry is zero");
        require(complianceGuard_ != address(0), "FlowPayRWAHub: guard is zero");
        require(assetStream_ != address(0), "FlowPayRWAHub: stream is zero");
        require(attestationRegistry_ != address(0), "FlowPayRWAHub: attestation registry is zero");

        assetNFT = FlowPayAssetNFT(assetNFT_);
        assetRegistry = FlowPayAssetRegistry(assetRegistry_);
        complianceGuard = FlowPayComplianceGuard(complianceGuard_);
        assetStream = FlowPayAssetStream(assetStream_);
        attestationRegistry = FlowPayAssetAttestationRegistry(attestationRegistry_);
    }

    function mintAsset(
        string calldata publicMetadataURI,
        uint8 assetType,
        uint8 rightsModel,
        bytes32 publicMetadataHash,
        bytes32 evidenceRoot,
        bytes32 evidenceManifestHash,
        bytes32 propertyRefHash,
        string calldata jurisdiction,
        bytes32 cidHash,
        bytes32 tagHash,
        address issuer,
        string calldata statusReason
    ) external onlyOperator returns (uint256 tokenId) {
        require(issuer != address(0), "FlowPayRWAHub: issuer is zero");
        require(bytes(publicMetadataURI).length > 0, "FlowPayRWAHub: metadata URI is required");
        require(publicMetadataHash != bytes32(0), "FlowPayRWAHub: metadata hash is required");
        require(evidenceRoot != bytes32(0), "FlowPayRWAHub: evidence root is required");
        require(complianceGuard.isIssuerApproved(issuer), "FlowPayRWAHub: issuer not approved");

        uint8 initialStatus = _requiresAttestation(assetType)
            ? STATUS_PENDING_ATTESTATION
            : STATUS_VERIFIED;
        tokenId = assetNFT.mintTo(issuer, publicMetadataURI);
        assetRegistry.registerAsset(
            tokenId,
            issuer,
            assetType,
            rightsModel,
            publicMetadataURI,
            jurisdiction,
            propertyRefHash,
            publicMetadataHash,
            evidenceRoot,
            evidenceManifestHash,
            cidHash,
            tagHash,
            initialStatus,
            statusReason
        );

        emit AssetMinted(
            tokenId,
            issuer,
            assetType,
            rightsModel,
            publicMetadataURI,
            publicMetadataHash,
            evidenceRoot,
            propertyRefHash
        );
        emit VerificationPayloadUpdated(tokenId, cidHash, tagHash);
        emit AssetVerificationStateUpdated(tokenId, initialStatus, statusReason);
    }

    function createAssetYieldStream(uint256 tokenId, uint256 totalAmount, uint256 duration)
        external
        returns (uint256 streamId)
    {
        FlowPayAssetRegistry.AssetRecord memory asset = assetRegistry.getAsset(tokenId);

        require(asset.exists, "FlowPayRWAHub: asset not found");
        require(!complianceGuard.isAssetActionBlocked(tokenId), "FlowPayRWAHub: asset blocked");
        address currentOwner = assetNFT.ownerOf(tokenId);
        require(
            msg.sender == currentOwner || msg.sender == asset.issuer,
            "FlowPayRWAHub: caller is not asset manager"
        );

        streamId = assetStream.createAssetYieldStreamFor(msg.sender, tokenId, totalAmount, duration, asset.assetType);
        assetRegistry.linkStream(tokenId, streamId);
    }

    function claimYield(uint256 tokenId) external returns (uint256 amountClaimed) {
        amountClaimed = assetStream.claimYieldFor(tokenId, msg.sender);
    }

    function flashAdvance(uint256 tokenId, uint256 amount) external {
        assetStream.flashAdvanceFor(tokenId, msg.sender, amount);
    }

    function setCompliance(
        address user,
        uint8 assetType,
        bool approved,
        uint64 expiry,
        string calldata jurisdiction
    ) external onlyOwner {
        complianceGuard.setCompliance(user, assetType, approved, expiry, jurisdiction);
    }

    function setIssuerApproval(address issuer, bool approved, string calldata note) external onlyOperator {
        complianceGuard.setIssuerApproval(issuer, approved, note);
    }

    function setAttestationPolicy(
        uint8 assetType,
        uint8 role,
        bool required,
        uint64 maxAge
    ) external onlyOwner {
        complianceGuard.setAttestationPolicy(assetType, role, required, maxAge);
    }

    function freezeStream(uint256 streamId, bool frozen, string calldata reason) external onlyOwner {
        complianceGuard.setStreamFreeze(streamId, frozen, reason);
    }

    function setAssetPolicy(
        uint256 tokenId,
        bool frozen,
        bool disputed,
        bool revoked,
        string calldata reason
    ) external onlyOwner {
        complianceGuard.setAssetPolicy(tokenId, frozen, disputed, revoked, reason);

        uint8 status = frozen
            ? STATUS_FROZEN
            : revoked
                ? STATUS_REVOKED
                : disputed
                    ? STATUS_DISPUTED
                    : STATUS_PENDING_ATTESTATION;
        assetRegistry.updateVerificationStatus(tokenId, status, reason);
        emit AssetVerificationStateUpdated(tokenId, status, reason);
    }

    function registerAttestation(
        uint256 tokenId,
        uint8 role,
        address attestor,
        bytes32 evidenceHash,
        string calldata statementType,
        uint64 expiry
    ) external onlyOperator returns (uint256 attestationId) {
        _requireAssetExists(tokenId);
        attestationId = attestationRegistry.registerAttestation(
            tokenId,
            role,
            attestor,
            evidenceHash,
            statementType,
            expiry
        );
        emit AttestationRecorded(tokenId, attestationId, role, attestor, evidenceHash, statementType);
    }

    function revokeAttestation(uint256 attestationId, string calldata reason) external onlyOperator {
        (uint256 tokenId,,,,,,,,) = attestationRegistry.getAttestation(attestationId);
        require(tokenId != 0, "FlowPayRWAHub: attestation not found");
        attestationRegistry.revokeAttestation(attestationId, reason);
        emit AttestationRevoked(tokenId, attestationId, reason);
    }

    function setVerificationStatus(uint256 tokenId, uint8 status, string calldata reason) external onlyOwner {
        _requireAssetExists(tokenId);
        assetRegistry.updateVerificationStatus(tokenId, status, reason);
        emit AssetVerificationStateUpdated(tokenId, status, reason);
    }

    function updateAssetMetadata(
        uint256 tokenId,
        string calldata publicMetadataURI,
        bytes32 publicMetadataHash,
        bytes32 cidHash
    ) external {
        _requireAssetManager(tokenId);
        assetNFT.updateTokenURI(tokenId, publicMetadataURI);
        assetRegistry.updateMetadata(tokenId, publicMetadataURI, publicMetadataHash, cidHash);
    }

    function updateAssetEvidence(
        uint256 tokenId,
        bytes32 evidenceRoot,
        bytes32 evidenceManifestHash
    ) external {
        _requireAssetManager(tokenId);
        assetRegistry.updateEvidence(tokenId, evidenceRoot, evidenceManifestHash);
        emit AssetEvidenceUpdated(tokenId, evidenceRoot, evidenceManifestHash);
    }

    function updateVerificationTag(uint256 tokenId, bytes32 tagHash) external {
        _requireAssetManager(tokenId);
        assetRegistry.updateVerificationTag(tokenId, tagHash);
        emit VerificationPayloadUpdated(tokenId, bytes32(0), tagHash);
    }

    function getAsset(uint256 tokenId) external view returns (AssetView memory assetView) {
        FlowPayAssetRegistry.AssetRecord memory asset = assetRegistry.getAsset(tokenId);
        assetView = AssetView({
            assetType: asset.assetType,
            rightsModel: asset.rightsModel,
            verificationStatus: asset.verificationStatus,
            cidHash: asset.cidHash,
            tagHash: asset.tagHash,
            propertyRefHash: asset.propertyRefHash,
            publicMetadataHash: asset.publicMetadataHash,
            evidenceRoot: asset.evidenceRoot,
            evidenceManifestHash: asset.evidenceManifestHash,
            issuer: asset.issuer,
            activeStreamId: asset.activeStreamId,
            jurisdiction: asset.jurisdiction,
            publicMetadataURI: asset.publicMetadataURI,
            statusReason: asset.statusReason,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
            verificationUpdatedAt: asset.verificationUpdatedAt,
            exists: asset.exists,
            currentOwner: asset.exists ? assetNFT.ownerOf(tokenId) : address(0)
        });
    }

    function getAssetStream(uint256 tokenId)
        external
        view
        returns (
            uint256 streamId,
            address sender,
            uint8 assetType,
            uint256 totalAmount,
            uint256 flowRate,
            uint256 startTime,
            uint256 stopTime,
            uint256 amountWithdrawn,
            bool isActive,
            bool isFrozen
        )
    {
        return assetStream.getStreamByTokenId(tokenId);
    }

    function claimableYield(uint256 tokenId) external view returns (uint256) {
        return assetStream.claimableYield(tokenId);
    }

    function getVerificationStatus(uint256 tokenId, bytes32 cidHash, bytes32 tagHash)
        external
        view
        returns (bool assetExists, bool cidMatches, bool tagMatches, uint256 activeStreamId)
    {
        return assetRegistry.getVerificationStatus(tokenId, cidHash, tagHash);
    }

    function getAttestationIds(uint256 tokenId) external view returns (uint256[] memory) {
        return attestationRegistry.getAttestationIds(tokenId);
    }

    function getAttestation(uint256 attestationId)
        external
        view
        returns (
            uint256 tokenId,
            uint8 role,
            address attestor,
            bytes32 evidenceHash,
            string memory statementType,
            uint64 issuedAt,
            uint64 expiry,
            bool revoked,
            string memory revocationReason
        )
    {
        return attestationRegistry.getAttestation(attestationId);
    }

    function _requireAssetManager(uint256 tokenId) internal view {
        FlowPayAssetRegistry.AssetRecord memory asset = assetRegistry.getAsset(tokenId);
        require(asset.exists, "FlowPayRWAHub: asset not found");

        address currentOwner = assetNFT.ownerOf(tokenId);
        require(
            msg.sender == currentOwner || msg.sender == asset.issuer || msg.sender == owner() || operators[msg.sender],
            "FlowPayRWAHub: caller is not asset manager"
        );
    }

    function _requireAssetExists(uint256 tokenId) internal view {
        FlowPayAssetRegistry.AssetRecord memory asset = assetRegistry.getAsset(tokenId);
        require(asset.exists, "FlowPayRWAHub: asset not found");
    }

    function _requiresAttestation(uint8 assetType) internal view returns (bool) {
        for (uint8 role = MIN_ATTESTATION_ROLE; role <= MAX_ATTESTATION_ROLE; role++) {
            (bool required,) = complianceGuard.getAttestationPolicy(assetType, role);
            if (required) {
                return true;
            }
        }
        return false;
    }
}
