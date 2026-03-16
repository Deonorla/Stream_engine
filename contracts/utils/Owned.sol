// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract Owned {
    address public owner;
    mapping(address => bool) public operators;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorUpdated(address indexed operator, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "Owned: caller is not owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == owner || operators[msg.sender], "Owned: caller is not operator");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Owned: new owner is zero");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }
}
