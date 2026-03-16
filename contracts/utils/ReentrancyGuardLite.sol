// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract ReentrancyGuardLite {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private guardState = NOT_ENTERED;

    modifier nonReentrant() {
        require(guardState == NOT_ENTERED, "ReentrancyGuardLite: reentrant call");
        guardState = ENTERED;
        _;
        guardState = NOT_ENTERED;
    }
}
