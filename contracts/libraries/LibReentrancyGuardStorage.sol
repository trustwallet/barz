// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

struct ReentrancyGuardStorage {
    uint256 status;
}

library LibReentrancyGuardStorage {
    bytes32 private constant REENTRANCY_GUARD_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.ReentrancyGuardStorage");

    function reentrancyguardStorage()
        internal
        pure
        returns (ReentrancyGuardStorage storage ds)
    {
        bytes32 storagePosition = REENTRANCY_GUARD_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }
}
