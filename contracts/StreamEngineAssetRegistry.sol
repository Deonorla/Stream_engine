// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./utils/Owned.sol";

contract StreamEngineAssetRegistry is Owned {
    uint8 public constant STATUS_DRAFT = 0;
    uint8 public constant STATUS_PENDING_ATTESTATION = 1;
    uint8 public constant STATUS_VERIFIED = 2;
    uint8 public constant STATUS_VERIFIED_WITH_WARNINGS = 3;
    uint8 public constant STATUS_STALE = 4;
    uint8 public constant STATUS_FROZEN = 5;
    uint8 public constant STATUS_REVOKED = 6;
    uint8 public constant STATUS_DISPUTED = 7;

    struct AssetRecord {
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
    }

    mapping(uint256 => AssetRecord) private assets;
    address public controller;

    event ControllerUpdated(address indexed controller);
    event AssetRegistered(
        uint256 indexed tokenId,
        address indexed issuer,
        uint8 indexed assetType,
        uint8 rightsModel,
        string publicMetadataURI,
        string jurisdiction,
        bytes32 propertyRefHash,
        bytes32 publicMetadataHash,
        bytes32 evidenceRoot,
        bytes32 evidenceManifestHash,
        bytes32 cidHash,
        bytes32 tagHash,
        uint8 verificationStatus,
        string statusReason
    );
    event AssetStreamLinked(uint256 indexed tokenId, uint256 indexed streamId);
    event AssetMetadataUpdated(
        uint256 indexed tokenId,
        string publicMetadataURI,
        bytes32 publicMetadataHash,
        bytes32 cidHash
    );
    event AssetEvidenceUpdated(uint256 indexed tokenId, bytes32 evidenceRoot, bytes32 evidenceManifestHash);
    event VerificationTagUpdated(uint256 indexed tokenId, bytes32 previousTagHash, bytes32 newTagHash);
    event VerificationStatusUpdated(
        uint256 indexed tokenId,
        uint8 previousStatus,
        uint8 newStatus,
        string reason,
        uint64 updatedAt
    );

    modifier onlyController() {
        require(msg.sender == controller, "StreamEngineAssetRegistry: caller is not controller");
        _;
    }

    function setController(address controller_) external onlyOwner {
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function registerAsset(
        uint256 tokenId,
        address issuer,
        uint8 assetType,
        uint8 rightsModel,
        string calldata publicMetadataURI,
        string calldata jurisdiction,
        bytes32 propertyRefHash,
        bytes32 publicMetadataHash,
        bytes32 evidenceRoot,
        bytes32 evidenceManifestHash,
        bytes32 cidHash,
        bytes32 tagHash,
        uint8 verificationStatus,
        string calldata statusReason
    ) external onlyController {
        require(!assets[tokenId].exists, "StreamEngineAssetRegistry: asset already exists");

        assets[tokenId] = AssetRecord({
            assetType: assetType,
            rightsModel: rightsModel,
            verificationStatus: verificationStatus,
            cidHash: cidHash,
            tagHash: tagHash,
            propertyRefHash: propertyRefHash,
            publicMetadataHash: publicMetadataHash,
            evidenceRoot: evidenceRoot,
            evidenceManifestHash: evidenceManifestHash,
            issuer: issuer,
            activeStreamId: 0,
            jurisdiction: jurisdiction,
            publicMetadataURI: publicMetadataURI,
            statusReason: statusReason,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            verificationUpdatedAt: uint64(block.timestamp),
            exists: true
        });

        emit AssetRegistered(
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
            verificationStatus,
            statusReason
        );
    }

    function linkStream(uint256 tokenId, uint256 streamId) external onlyController {
        AssetRecord storage asset = _getAsset(tokenId);
        asset.activeStreamId = streamId;
        asset.updatedAt = uint64(block.timestamp);
        emit AssetStreamLinked(tokenId, streamId);
    }

    function updateMetadata(
        uint256 tokenId,
        string calldata publicMetadataURI,
        bytes32 publicMetadataHash,
        bytes32 cidHash
    ) external onlyController {
        AssetRecord storage asset = _getAsset(tokenId);
        asset.publicMetadataURI = publicMetadataURI;
        asset.publicMetadataHash = publicMetadataHash;
        asset.cidHash = cidHash;
        asset.updatedAt = uint64(block.timestamp);
        emit AssetMetadataUpdated(tokenId, publicMetadataURI, publicMetadataHash, cidHash);
    }

    function updateEvidence(
        uint256 tokenId,
        bytes32 evidenceRoot,
        bytes32 evidenceManifestHash
    ) external onlyController {
        AssetRecord storage asset = _getAsset(tokenId);
        asset.evidenceRoot = evidenceRoot;
        asset.evidenceManifestHash = evidenceManifestHash;
        asset.updatedAt = uint64(block.timestamp);
        emit AssetEvidenceUpdated(tokenId, evidenceRoot, evidenceManifestHash);
    }

    function updateVerificationTag(uint256 tokenId, bytes32 tagHash) external onlyController {
        AssetRecord storage asset = _getAsset(tokenId);
        bytes32 previousTagHash = asset.tagHash;
        asset.tagHash = tagHash;
        asset.updatedAt = uint64(block.timestamp);
        emit VerificationTagUpdated(tokenId, previousTagHash, tagHash);
    }

    function updateVerificationStatus(
        uint256 tokenId,
        uint8 verificationStatus,
        string calldata reason
    ) external onlyController {
        AssetRecord storage asset = _getAsset(tokenId);
        uint8 previousStatus = asset.verificationStatus;
        asset.verificationStatus = verificationStatus;
        asset.statusReason = reason;
        asset.updatedAt = uint64(block.timestamp);
        asset.verificationUpdatedAt = uint64(block.timestamp);
        emit VerificationStatusUpdated(tokenId, previousStatus, verificationStatus, reason, uint64(block.timestamp));
    }

    function getAsset(uint256 tokenId) external view returns (AssetRecord memory) {
        return assets[tokenId];
    }

    function getVerificationStatus(uint256 tokenId, bytes32 cidHash, bytes32 tagHash)
        external
        view
        returns (bool assetExists, bool cidMatches, bool tagMatches, uint256 activeStreamId)
    {
        AssetRecord storage asset = assets[tokenId];
        assetExists = asset.exists;
        cidMatches = asset.exists && asset.cidHash == cidHash;
        tagMatches = asset.exists && asset.tagHash == tagHash;
        activeStreamId = asset.activeStreamId;
    }

    function hasAsset(uint256 tokenId) external view returns (bool) {
        return assets[tokenId].exists;
    }

    function _getAsset(uint256 tokenId) internal view returns (AssetRecord storage asset) {
        asset = assets[tokenId];
        require(asset.exists, "StreamEngineAssetRegistry: asset not found");
    }
}
