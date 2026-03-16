// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./utils/Owned.sol";
import "./FlowPayAssetNFT.sol";
import "./FlowPayAssetRegistry.sol";
import "./FlowPayComplianceGuard.sol";
import "./FlowPayAssetStream.sol";

contract FlowPayRWAHub is Owned {
    FlowPayAssetNFT public immutable assetNFT;
    FlowPayAssetRegistry public immutable assetRegistry;
    FlowPayComplianceGuard public immutable complianceGuard;
    FlowPayAssetStream public immutable assetStream;

    event AssetMinted(uint256 indexed tokenId, address indexed issuer, uint8 indexed assetType, string metadataURI);
    event VerificationPayloadUpdated(uint256 indexed tokenId, bytes32 cidHash, bytes32 tagHash);

    constructor(
        address assetNFT_,
        address assetRegistry_,
        address complianceGuard_,
        address assetStream_
    ) {
        require(assetNFT_ != address(0), "FlowPayRWAHub: nft is zero");
        require(assetRegistry_ != address(0), "FlowPayRWAHub: registry is zero");
        require(complianceGuard_ != address(0), "FlowPayRWAHub: guard is zero");
        require(assetStream_ != address(0), "FlowPayRWAHub: stream is zero");

        assetNFT = FlowPayAssetNFT(assetNFT_);
        assetRegistry = FlowPayAssetRegistry(assetRegistry_);
        complianceGuard = FlowPayComplianceGuard(complianceGuard_);
        assetStream = FlowPayAssetStream(assetStream_);
    }

    function mintAsset(
        string calldata metadataURI,
        uint8 assetType,
        bytes32 cidHash,
        bytes32 tagHash,
        address issuer
    ) external onlyOwner returns (uint256 tokenId) {
        require(issuer != address(0), "FlowPayRWAHub: issuer is zero");
        tokenId = assetNFT.mintTo(issuer, metadataURI);
        assetRegistry.registerAsset(tokenId, issuer, assetType, metadataURI, cidHash, tagHash);

        emit AssetMinted(tokenId, issuer, assetType, metadataURI);
        emit VerificationPayloadUpdated(tokenId, cidHash, tagHash);
    }

    function createAssetYieldStream(uint256 tokenId, uint256 totalAmount, uint256 duration)
        external
        returns (uint256 streamId)
    {
        (
            uint8 assetType,
            ,
            ,
            address issuer,
            ,
            ,
            ,
            ,
            bool exists
        ) = assetRegistry.getAsset(tokenId);

        require(exists, "FlowPayRWAHub: asset not found");
        address currentOwner = assetNFT.ownerOf(tokenId);
        require(
            msg.sender == currentOwner || msg.sender == issuer,
            "FlowPayRWAHub: caller is not asset manager"
        );

        streamId = assetStream.createAssetYieldStreamFor(msg.sender, tokenId, totalAmount, duration, assetType);
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

    function freezeStream(uint256 streamId, bool frozen, string calldata reason) external onlyOwner {
        complianceGuard.setStreamFreeze(streamId, frozen, reason);
    }

    function updateAssetMetadata(uint256 tokenId, string calldata metadataURI, bytes32 cidHash) external {
        _requireAssetManager(tokenId);
        assetNFT.updateTokenURI(tokenId, metadataURI);
        assetRegistry.updateMetadata(tokenId, metadataURI, cidHash);
    }

    function updateVerificationTag(uint256 tokenId, bytes32 tagHash) external {
        _requireAssetManager(tokenId);
        assetRegistry.updateVerificationTag(tokenId, tagHash);
        emit VerificationPayloadUpdated(tokenId, bytes32(0), tagHash);
    }

    function getAsset(uint256 tokenId)
        external
        view
        returns (
            uint8 assetType,
            bytes32 cidHash,
            bytes32 tagHash,
            address issuer,
            uint256 activeStreamId,
            string memory metadataURI,
            uint64 createdAt,
            uint64 updatedAt,
            bool exists,
            address currentOwner
        )
    {
        (
            assetType,
            cidHash,
            tagHash,
            issuer,
            activeStreamId,
            metadataURI,
            createdAt,
            updatedAt,
            exists
        ) = assetRegistry.getAsset(tokenId);

        currentOwner = exists ? assetNFT.ownerOf(tokenId) : address(0);
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

    function _requireAssetManager(uint256 tokenId) internal view {
        (
            ,
            ,
            ,
            address issuer,
            ,
            ,
            ,
            ,
            bool exists
        ) = assetRegistry.getAsset(tokenId);
        require(exists, "FlowPayRWAHub: asset not found");

        address currentOwner = assetNFT.ownerOf(tokenId);
        require(
            msg.sender == currentOwner || msg.sender == issuer || msg.sender == owner,
            "FlowPayRWAHub: caller is not asset manager"
        );
    }
}
