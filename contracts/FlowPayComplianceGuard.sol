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

    struct IssuerApprovalRecord {
        bool approved;
        uint64 updatedAt;
        address updatedBy;
        string note;
    }

    struct AssetPolicyRecord {
        bool frozen;
        bool disputed;
        bool revoked;
        uint64 updatedAt;
        address updatedBy;
        string reason;
    }

    struct AttestationPolicy {
        bool required;
        uint64 maxAge;
    }

    mapping(address => mapping(uint8 => ComplianceRecord)) private complianceRecords;
    mapping(uint256 => FreezeRecord) private frozenStreams;
    mapping(address => IssuerApprovalRecord) private issuerApprovals;
    mapping(uint256 => AssetPolicyRecord) private assetPolicies;
    mapping(uint8 => mapping(uint8 => AttestationPolicy)) private attestationPolicies;
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
    event IssuerApprovalUpdated(address indexed issuer, bool approved, string note, address indexed updatedBy);
    event AssetPolicyUpdated(
        uint256 indexed tokenId,
        bool frozen,
        bool disputed,
        bool revoked,
        string reason,
        address indexed updatedBy
    );
    event AttestationPolicyUpdated(uint8 indexed assetType, uint8 indexed role, bool required, uint64 maxAge);

    modifier onlyController() {
        require(
            msg.sender == controller || msg.sender == owner() || operators[msg.sender],
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

    function setIssuerApproval(address issuer, bool approved, string calldata note) external onlyController {
        issuerApprovals[issuer] = IssuerApprovalRecord({
            approved: approved,
            updatedAt: uint64(block.timestamp),
            updatedBy: msg.sender,
            note: note
        });
        emit IssuerApprovalUpdated(issuer, approved, note, msg.sender);
    }

    function setAssetPolicy(
        uint256 tokenId,
        bool frozen,
        bool disputed,
        bool revoked,
        string calldata reason
    ) external onlyController {
        assetPolicies[tokenId] = AssetPolicyRecord({
            frozen: frozen,
            disputed: disputed,
            revoked: revoked,
            updatedAt: uint64(block.timestamp),
            updatedBy: msg.sender,
            reason: reason
        });
        emit AssetPolicyUpdated(tokenId, frozen, disputed, revoked, reason, msg.sender);
    }

    function setAttestationPolicy(
        uint8 assetType,
        uint8 role,
        bool required,
        uint64 maxAge
    ) external onlyController {
        attestationPolicies[assetType][role] = AttestationPolicy({
            required: required,
            maxAge: maxAge
        });
        emit AttestationPolicyUpdated(assetType, role, required, maxAge);
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

    function isIssuerApproved(address issuer) external view returns (bool) {
        return issuerApprovals[issuer].approved;
    }

    function isStreamFrozen(uint256 streamId) external view returns (bool) {
        return frozenStreams[streamId].frozen;
    }

    function isAssetFrozen(uint256 tokenId) external view returns (bool) {
        return assetPolicies[tokenId].frozen;
    }

    function isAssetRevoked(uint256 tokenId) external view returns (bool) {
        return assetPolicies[tokenId].revoked;
    }

    function isAssetDisputed(uint256 tokenId) external view returns (bool) {
        return assetPolicies[tokenId].disputed;
    }

    function isAssetActionBlocked(uint256 tokenId) external view returns (bool) {
        AssetPolicyRecord storage record = assetPolicies[tokenId];
        return record.frozen || record.revoked || record.disputed;
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

    function getFreezeStatus(uint256 streamId)
        external
        view
        returns (bool frozen, uint64 updatedAt, address updatedBy, string memory reason)
    {
        FreezeRecord storage record = frozenStreams[streamId];
        return (record.frozen, record.updatedAt, record.updatedBy, record.reason);
    }

    function getIssuerApproval(address issuer)
        external
        view
        returns (bool approved, uint64 updatedAt, address updatedBy, string memory note)
    {
        IssuerApprovalRecord storage record = issuerApprovals[issuer];
        return (record.approved, record.updatedAt, record.updatedBy, record.note);
    }

    function getAssetPolicy(uint256 tokenId)
        external
        view
        returns (
            bool frozen,
            bool disputed,
            bool revoked,
            uint64 updatedAt,
            address updatedBy,
            string memory reason
        )
    {
        AssetPolicyRecord storage record = assetPolicies[tokenId];
        return (
            record.frozen,
            record.disputed,
            record.revoked,
            record.updatedAt,
            record.updatedBy,
            record.reason
        );
    }

    function getAttestationPolicy(uint8 assetType, uint8 role)
        external
        view
        returns (bool required, uint64 maxAge)
    {
        AttestationPolicy storage policy = attestationPolicies[assetType][role];
        return (policy.required, policy.maxAge);
    }
}
