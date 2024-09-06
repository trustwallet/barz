// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

/**
 * @title Validation Module Facet Storage
 * @dev Storage contract to store the va
 */
struct ValidationModuleFacetStorage {
    mapping(bytes2 => address) validationModuleFacet;
}

library LibValidationModuleFacetStorage {
    bytes32 constant VALIDATION_MODULE_FACET_STORAGE_POSITION =
        keccak256(
            "v0.trustwallet.diamond.storage.ValidationModuleFacetStorage"
        );

    function validationModuleFacetStorage()
        internal
        pure
        returns (ValidationModuleFacetStorage storage ds)
    {
        bytes32 storagePosition = VALIDATION_MODULE_FACET_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }
}
