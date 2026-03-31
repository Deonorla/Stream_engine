// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./utils/Owned.sol";

contract StreamEngineAssetAttestationRegistry is Owned {
    struct AttestationRecord {
        uint256 tokenId;
        uint8 role;
        address attestor;
        bytes32 evidenceHash;
        string statementType;
        uint64 issuedAt;
        uint64 expiry;
        bool revoked;
        string revocationReason;
    }

    uint256 public nextAttestationId = 1;
    address public controller;

    mapping(uint256 => AttestationRecord) private attestations;
    mapping(uint256 => uint256[]) private attestationIdsByToken;

    event ControllerUpdated(address indexed controller);
    event AttestationRegistered(
        uint256 indexed attestationId,
        uint256 indexed tokenId,
        uint8 indexed role,
        address attestor,
        bytes32 evidenceHash,
        string statementType,
        uint64 issuedAt,
        uint64 expiry
    );
    event AttestationRevoked(uint256 indexed attestationId, uint256 indexed tokenId, string reason);

    modifier onlyController() {
        require(msg.sender == controller, "StreamEngineAssetAttestationRegistry: caller is not controller");
        _;
    }

    function setController(address controller_) external onlyOwner {
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function registerAttestation(
        uint256 tokenId,
        uint8 role,
        address attestor,
        bytes32 evidenceHash,
        string calldata statementType,
        uint64 expiry
    ) external onlyController returns (uint256 attestationId) {
        require(tokenId != 0, "StreamEngineAssetAttestationRegistry: tokenId is zero");
        require(attestor != address(0), "StreamEngineAssetAttestationRegistry: attestor is zero");

        attestationId = nextAttestationId++;
        attestations[attestationId] = AttestationRecord({
            tokenId: tokenId,
            role: role,
            attestor: attestor,
            evidenceHash: evidenceHash,
            statementType: statementType,
            issuedAt: uint64(block.timestamp),
            expiry: expiry,
            revoked: false,
            revocationReason: ""
        });
        attestationIdsByToken[tokenId].push(attestationId);

        emit AttestationRegistered(
            attestationId,
            tokenId,
            role,
            attestor,
            evidenceHash,
            statementType,
            uint64(block.timestamp),
            expiry
        );
    }

    function revokeAttestation(uint256 attestationId, string calldata reason) external onlyController {
        AttestationRecord storage attestation = attestations[attestationId];
        require(attestation.tokenId != 0, "StreamEngineAssetAttestationRegistry: attestation not found");
        require(!attestation.revoked, "StreamEngineAssetAttestationRegistry: attestation already revoked");

        attestation.revoked = true;
        attestation.revocationReason = reason;

        emit AttestationRevoked(attestationId, attestation.tokenId, reason);
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
        AttestationRecord storage attestation = attestations[attestationId];
        return (
            attestation.tokenId,
            attestation.role,
            attestation.attestor,
            attestation.evidenceHash,
            attestation.statementType,
            attestation.issuedAt,
            attestation.expiry,
            attestation.revoked,
            attestation.revocationReason
        );
    }

    function getAttestationIds(uint256 tokenId) external view returns (uint256[] memory) {
        return attestationIdsByToken[tokenId];
    }

    function getActiveAttestationCount(uint256 tokenId, uint8 role) external view returns (uint256 count) {
        uint256[] storage attestationIds = attestationIdsByToken[tokenId];
        for (uint256 i = 0; i < attestationIds.length; i++) {
            AttestationRecord storage attestation = attestations[attestationIds[i]];
            if (
                attestation.role == role
                && !attestation.revoked
                && (attestation.expiry == 0 || attestation.expiry >= block.timestamp)
            ) {
                count += 1;
            }
        }
    }

    function hasFreshAttestation(uint256 tokenId, uint8 role, uint64 maxAge) external view returns (bool) {
        uint256[] storage attestationIds = attestationIdsByToken[tokenId];
        for (uint256 i = 0; i < attestationIds.length; i++) {
            AttestationRecord storage attestation = attestations[attestationIds[i]];
            bool notExpired = attestation.expiry == 0 || attestation.expiry >= block.timestamp;
            bool freshEnough = maxAge == 0 || attestation.issuedAt + maxAge >= block.timestamp;
            if (attestation.role == role && !attestation.revoked && notExpired && freshEnough) {
                return true;
            }
        }
        return false;
    }
}
