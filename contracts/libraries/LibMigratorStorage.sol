// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

struct V2MigratorStorage {
    uint256 version;
}

library LibMigratorStorage {
    bytes32 constant MIGRATOR_STORAGE_POSITION =
        0x80684918f18ae3c0a2d8ce9c73f39ad496745f91ff87caa8cbbef81f9f629091; // keccak("v0.2.trustwallet.diamond.storage.MigratorStorage")

    function migratorStorage()
        internal
        pure
        returns (V2MigratorStorage storage ds)
    {
        bytes32 storagePosition = MIGRATOR_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }
}
