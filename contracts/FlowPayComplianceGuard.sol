// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./utils/Owned.sol";

contract FlowPayComplianceGuard is Owned {
    struct ComplianceRecord {
        bool approved;
        uint64 expiry;
        string jurisdiction;
    }

    struct FreezeRecord {
        bool frozen;
        uint64 updatedAt;
        address updatedBy;
        string reason;
    }

    mapping(address => mapping(uint8 => ComplianceRecord)) private complianceRecords;
    mapping(uint256 => FreezeRecord) private frozenStreams;
    address public controller;

    event ControllerUpdated(address indexed controller);
    event ComplianceUpdated(
        address indexed user,
        uint8 indexed assetType,
        bool approved,
        uint64 expiry,
        string jurisdiction
    );
    event StreamFreezeUpdated(uint256 indexed streamId, bool frozen, string reason, address indexed updatedBy);

    modifier onlyController() {
        require(
            msg.sender == controller || msg.sender == owner || operators[msg.sender],
            "FlowPayComplianceGuard: caller is not controller"
        );
        _;
    }

    function setController(address controller_) external onlyOwner {
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function setCompliance(
        address user,
        uint8 assetType,
        bool approved,
        uint64 expiry,
        string calldata jurisdiction
    ) external onlyController {
        complianceRecords[user][assetType] = ComplianceRecord({
            approved: approved,
            expiry: expiry,
            jurisdiction: jurisdiction
        });

        emit ComplianceUpdated(user, assetType, approved, expiry, jurisdiction);
    }

    function setStreamFreeze(uint256 streamId, bool frozen, string calldata reason) external onlyController {
        frozenStreams[streamId] = FreezeRecord({
            frozen: frozen,
            updatedAt: uint64(block.timestamp),
            updatedBy: msg.sender,
            reason: reason
        });

        emit StreamFreezeUpdated(streamId, frozen, reason, msg.sender);
    }

    function isCompliant(address user, uint8 assetType) public view returns (bool) {
        ComplianceRecord storage record = complianceRecords[user][assetType];
        if (!record.approved) {
            return false;
        }
        if (record.expiry == 0) {
            return true;
        }
        return record.expiry >= block.timestamp;
    }

    function getCompliance(address user, uint8 assetType)
        external
        view
        returns (bool approved, uint64 expiry, string memory jurisdiction, bool currentlyValid)
    {
        ComplianceRecord storage record = complianceRecords[user][assetType];
        approved = record.approved;
        expiry = record.expiry;
        jurisdiction = record.jurisdiction;
        currentlyValid = isCompliant(user, assetType);
    }

    function isStreamFrozen(uint256 streamId) external view returns (bool) {
        return frozenStreams[streamId].frozen;
    }

    function getFreezeStatus(uint256 streamId)
        external
        view
        returns (bool frozen, uint64 updatedAt, address updatedBy, string memory reason)
    {
        FreezeRecord storage record = frozenStreams[streamId];
        return (record.frozen, record.updatedAt, record.updatedBy, record.reason);
    }
}
