// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {LibReentrancyGuardStorage, ReentrancyGuardStorage} from "../libraries/LibReentrancyGuardStorage.sol";

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 0;
    uint256 private constant _ENTERED = 1;

    error ReentrancyGuard__ReentrantCall();

    modifier nonReentrant() {
        ReentrancyGuardStorage storage rgs = LibReentrancyGuardStorage
            .reentrancyguardStorage();

        if (rgs.status == _ENTERED) {
            revert ReentrancyGuard__ReentrantCall();
        }

        rgs.status = _ENTERED;

        _; // Execute function

        rgs.status = _NOT_ENTERED;
    }
}
