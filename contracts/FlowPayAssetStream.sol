// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./utils/Owned.sol";
import "./utils/ReentrancyGuardLite.sol";

interface IFlowPayMNEE {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IFlowPayAssetNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IFlowPayComplianceGuardView {
    function isCompliant(address user, uint8 assetType) external view returns (bool);
    function isStreamFrozen(uint256 streamId) external view returns (bool);
}

contract FlowPayAssetStream is Owned, ReentrancyGuardLite {
    struct AssetStream {
        address sender;
        uint256 tokenId;
        uint8 assetType;
        uint256 totalAmount;
        uint256 flowRate;
        uint256 startTime;
        uint256 stopTime;
        uint256 amountWithdrawn;
        bool isActive;
    }

    IFlowPayMNEE public immutable mneeToken;
    IFlowPayAssetNFT public immutable assetNFT;
    IFlowPayComplianceGuardView public complianceGuard;
    address public hub;
    uint256 public nextStreamId = 1;

    mapping(uint256 => AssetStream) private streams;
    mapping(uint256 => uint256) public streamByTokenId;

    event HubUpdated(address indexed hub);
    event ComplianceGuardUpdated(address indexed complianceGuard);
    event AssetYieldStreamCreated(
        uint256 indexed streamId,
        uint256 indexed tokenId,
        address indexed sender,
        uint256 totalAmount,
        uint256 flowRate,
        uint256 startTime,
        uint256 stopTime,
        uint8 assetType
    );
    event AssetOwnerResolved(uint256 indexed streamId, uint256 indexed tokenId, address indexed owner, string action);
    event YieldClaimed(uint256 indexed streamId, uint256 indexed tokenId, address indexed recipient, uint256 amount);
    event FlashAdvanceExecuted(uint256 indexed streamId, uint256 indexed tokenId, address indexed recipient, uint256 amount);
    event StreamDepleted(uint256 indexed streamId, uint256 indexed tokenId);

    modifier onlyHub() {
        require(msg.sender == hub, "FlowPayAssetStream: caller is not hub");
        _;
    }

    constructor(address mneeToken_, address assetNFT_) {
        require(mneeToken_ != address(0), "FlowPayAssetStream: token is zero");
        require(assetNFT_ != address(0), "FlowPayAssetStream: nft is zero");
        mneeToken = IFlowPayMNEE(mneeToken_);
        assetNFT = IFlowPayAssetNFT(assetNFT_);
    }

    function setHub(address hub_) external onlyOwner {
        hub = hub_;
        emit HubUpdated(hub_);
    }

    function setComplianceGuard(address complianceGuard_) external onlyOwner {
        complianceGuard = IFlowPayComplianceGuardView(complianceGuard_);
        emit ComplianceGuardUpdated(complianceGuard_);
    }

    function createAssetYieldStreamFor(
        address sender,
        uint256 tokenId,
        uint256 totalAmount,
        uint256 duration,
        uint8 assetType
    ) external onlyHub nonReentrant returns (uint256 streamId) {
        require(sender != address(0), "FlowPayAssetStream: sender is zero");
        require(totalAmount > 0, "FlowPayAssetStream: amount is zero");
        require(duration > 0, "FlowPayAssetStream: duration is zero");

        uint256 currentStreamId = streamByTokenId[tokenId];
        if (currentStreamId != 0) {
            require(!streams[currentStreamId].isActive, "FlowPayAssetStream: active stream exists");
        }

        uint256 flowRate = totalAmount / duration;
        require(flowRate > 0, "FlowPayAssetStream: flowRate is zero");

        bool success = mneeToken.transferFrom(sender, address(this), totalAmount);
        require(success, "FlowPayAssetStream: transfer failed");

        streamId = nextStreamId++;
        uint256 startTime = block.timestamp;
        uint256 stopTime = startTime + duration;

        streams[streamId] = AssetStream({
            sender: sender,
            tokenId: tokenId,
            assetType: assetType,
            totalAmount: totalAmount,
            flowRate: flowRate,
            startTime: startTime,
            stopTime: stopTime,
            amountWithdrawn: 0,
            isActive: true
        });
        streamByTokenId[tokenId] = streamId;

        emit AssetYieldStreamCreated(streamId, tokenId, sender, totalAmount, flowRate, startTime, stopTime, assetType);
    }

    function claimableYield(uint256 tokenId) external view returns (uint256) {
        uint256 streamId = streamByTokenId[tokenId];
        if (streamId == 0) {
            return 0;
        }
        return claimableBalance(streamId);
    }

    function claimableBalance(uint256 streamId) public view returns (uint256) {
        AssetStream storage stream = streams[streamId];
        if (!stream.isActive && stream.amountWithdrawn >= stream.totalAmount) {
            return 0;
        }
        if (stream.sender == address(0)) {
            return 0;
        }
        if (block.timestamp < stream.startTime) {
            return 0;
        }
        if (block.timestamp >= stream.stopTime) {
            return stream.totalAmount - stream.amountWithdrawn;
        }

        uint256 streamedAmount = (block.timestamp - stream.startTime) * stream.flowRate;
        if (streamedAmount <= stream.amountWithdrawn) {
            return 0;
        }
        return streamedAmount - stream.amountWithdrawn;
    }

    function claimYieldFor(uint256 tokenId, address claimer)
        external
        onlyHub
        nonReentrant
        returns (uint256 amountClaimed)
    {
        uint256 streamId = streamByTokenId[tokenId];
        require(streamId != 0, "FlowPayAssetStream: stream not found");
        AssetStream storage stream = streams[streamId];
        require(stream.isActive, "FlowPayAssetStream: stream inactive");

        _validateClaimant(streamId, stream, tokenId, claimer);

        amountClaimed = claimableBalance(streamId);
        require(amountClaimed > 0, "FlowPayAssetStream: nothing claimable");

        stream.amountWithdrawn += amountClaimed;
        _syncStatus(streamId, stream);

        bool success = mneeToken.transfer(claimer, amountClaimed);
        require(success, "FlowPayAssetStream: claim transfer failed");

        emit AssetOwnerResolved(streamId, tokenId, claimer, "claim");
        emit YieldClaimed(streamId, tokenId, claimer, amountClaimed);
    }

    function flashAdvanceFor(uint256 tokenId, address claimer, uint256 amount) external onlyHub nonReentrant {
        require(amount > 0, "FlowPayAssetStream: flash amount is zero");
        uint256 streamId = streamByTokenId[tokenId];
        require(streamId != 0, "FlowPayAssetStream: stream not found");
        AssetStream storage stream = streams[streamId];
        require(stream.isActive, "FlowPayAssetStream: stream inactive");

        _validateClaimant(streamId, stream, tokenId, claimer);

        uint256 remainingBalance = stream.totalAmount - stream.amountWithdrawn;
        require(amount <= remainingBalance, "FlowPayAssetStream: amount exceeds remaining");

        stream.amountWithdrawn += amount;
        _syncStatus(streamId, stream);

        bool success = mneeToken.transfer(claimer, amount);
        require(success, "FlowPayAssetStream: flash transfer failed");

        emit AssetOwnerResolved(streamId, tokenId, claimer, "flash-advance");
        emit FlashAdvanceExecuted(streamId, tokenId, claimer, amount);
    }

    function getStream(uint256 streamId)
        external
        view
        returns (
            address sender,
            uint256 tokenId,
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
        AssetStream storage stream = streams[streamId];
        sender = stream.sender;
        tokenId = stream.tokenId;
        assetType = stream.assetType;
        totalAmount = stream.totalAmount;
        flowRate = stream.flowRate;
        startTime = stream.startTime;
        stopTime = stream.stopTime;
        amountWithdrawn = stream.amountWithdrawn;
        isActive = stream.isActive;
        isFrozen = address(complianceGuard) != address(0) && complianceGuard.isStreamFrozen(streamId);
    }

    function getStreamByTokenId(uint256 tokenId)
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
        streamId = streamByTokenId[tokenId];
        AssetStream storage stream = streams[streamId];
        sender = stream.sender;
        assetType = stream.assetType;
        totalAmount = stream.totalAmount;
        flowRate = stream.flowRate;
        startTime = stream.startTime;
        stopTime = stream.stopTime;
        amountWithdrawn = stream.amountWithdrawn;
        isActive = stream.isActive;
        isFrozen = address(complianceGuard) != address(0) && complianceGuard.isStreamFrozen(streamId);
    }

    function _validateClaimant(uint256 streamId, AssetStream storage stream, uint256 tokenId, address claimer) internal view {
        address assetOwner = assetNFT.ownerOf(tokenId);
        require(assetOwner == claimer, "FlowPayAssetStream: caller is not current owner");

        if (address(complianceGuard) != address(0)) {
            require(!complianceGuard.isStreamFrozen(streamId), "FlowPayAssetStream: stream frozen");
            require(complianceGuard.isCompliant(claimer, stream.assetType), "FlowPayAssetStream: claimant not compliant");
        }
    }

    function _syncStatus(uint256 streamId, AssetStream storage stream) internal {
        if (stream.amountWithdrawn >= stream.totalAmount) {
            stream.isActive = false;
            emit StreamDepleted(streamId, stream.tokenId);
        }
    }
}
