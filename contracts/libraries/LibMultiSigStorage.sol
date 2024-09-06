// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

/**
 * @title Multi-sig Storage
 * @dev Storage contract for storing Multi-sig Facet variables in diamond storage pattern
 * @author David Yongjun Kim (@Powerstream3604)
 */

struct MultiSigStorage {
    mapping(address => address) owners;
    mapping(uint256 => mapping(address => mapping(bytes32 => uint256))) approvedHashes;
    uint256 ownerCount;
    uint256 threshold;
    uint256 counter;
}

library LibMultiSigStorage {
    bytes32 private constant MULTISIG_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.MultiSigStorage");

    function multisigStorage()
        internal
        pure
        returns (MultiSigStorage storage ds)
    {
        bytes32 storagePosition = MULTISIG_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }
}
