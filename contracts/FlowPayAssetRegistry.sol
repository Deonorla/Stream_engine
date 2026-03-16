// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./utils/Owned.sol";

contract FlowPayAssetRegistry is Owned {
    struct AssetRecord {
        uint8 assetType;
        bytes32 cidHash;
        bytes32 tagHash;
        address issuer;
        uint256 activeStreamId;
        string metadataURI;
        uint64 createdAt;
        uint64 updatedAt;
        bool exists;
    }

    mapping(uint256 => AssetRecord) private assets;
    address public controller;

    event ControllerUpdated(address indexed controller);
    event AssetRegistered(
        uint256 indexed tokenId,
        address indexed issuer,
        uint8 indexed assetType,
        string metadataURI,
        bytes32 cidHash,
        bytes32 tagHash
    );
    event AssetStreamLinked(uint256 indexed tokenId, uint256 indexed streamId);
    event AssetMetadataUpdated(uint256 indexed tokenId, string metadataURI, bytes32 cidHash);
    event VerificationTagUpdated(uint256 indexed tokenId, bytes32 previousTagHash, bytes32 newTagHash);

    modifier onlyController() {
        require(msg.sender == controller, "FlowPayAssetRegistry: caller is not controller");
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
        string calldata metadataURI,
        bytes32 cidHash,
        bytes32 tagHash
    ) external onlyController {
        require(!assets[tokenId].exists, "FlowPayAssetRegistry: asset already exists");

        assets[tokenId] = AssetRecord({
            assetType: assetType,
            cidHash: cidHash,
            tagHash: tagHash,
            issuer: issuer,
            activeStreamId: 0,
            metadataURI: metadataURI,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            exists: true
        });

        emit AssetRegistered(tokenId, issuer, assetType, metadataURI, cidHash, tagHash);
    }

    function linkStream(uint256 tokenId, uint256 streamId) external onlyController {
        AssetRecord storage asset = _getAsset(tokenId);
        asset.activeStreamId = streamId;
        asset.updatedAt = uint64(block.timestamp);
        emit AssetStreamLinked(tokenId, streamId);
    }

    function updateMetadata(uint256 tokenId, string calldata metadataURI, bytes32 cidHash) external onlyController {
        AssetRecord storage asset = _getAsset(tokenId);
        asset.metadataURI = metadataURI;
        asset.cidHash = cidHash;
        asset.updatedAt = uint64(block.timestamp);
        emit AssetMetadataUpdated(tokenId, metadataURI, cidHash);
    }

    function updateVerificationTag(uint256 tokenId, bytes32 tagHash) external onlyController {
        AssetRecord storage asset = _getAsset(tokenId);
        bytes32 previousTagHash = asset.tagHash;
        asset.tagHash = tagHash;
        asset.updatedAt = uint64(block.timestamp);
        emit VerificationTagUpdated(tokenId, previousTagHash, tagHash);
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
            bool exists
        )
    {
        AssetRecord storage asset = assets[tokenId];
        return (
            asset.assetType,
            asset.cidHash,
            asset.tagHash,
            asset.issuer,
            asset.activeStreamId,
            asset.metadataURI,
            asset.createdAt,
            asset.updatedAt,
            asset.exists
        );
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
        require(asset.exists, "FlowPayAssetRegistry: asset not found");
    }
}
