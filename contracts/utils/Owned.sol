// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @dev Owned extends OpenZeppelin Ownable and AccessControl.
 * Provides owner-only and operator role-based access control
 * using audited OpenZeppelin primitives.
 */
abstract contract Owned is Ownable, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Legacy mapping kept for read compatibility
    mapping(address => bool) public operators;

    event OperatorUpdated(address indexed operator, bool allowed);

    modifier onlyOperator() {
        require(
            msg.sender == owner() || hasRole(OPERATOR_ROLE, msg.sender),
            "Owned: caller is not operator"
        );
        _;
    }

    constructor() Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        operators[operator] = allowed;
        if (allowed) {
            _grantRole(OPERATOR_ROLE, operator);
        } else {
            _revokeRole(OPERATOR_ROLE, operator);
        }
        emit OperatorUpdated(operator, allowed);
    }

    /**
     * @dev Override required by Solidity for multiple inheritance.
     * Restricts supportsInterface to owner check.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
