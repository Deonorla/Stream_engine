// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Re-export OpenZeppelin ReentrancyGuard as a drop-in replacement
// for the previous ReentrancyGuardLite implementation.
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

abstract contract ReentrancyGuardLite is ReentrancyGuard {}
