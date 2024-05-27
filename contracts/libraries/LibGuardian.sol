// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {LibFacetStorage, StorageConfig} from "./LibFacetStorage.sol";

/**
 * @title LibGuardian
 * @dev Internal Library to provide utility feature for Guardians stored in Guardian Facet Storage
 * @author David Yongjun Kim (@Powerstream3604)
 */
library LibGuardian {
    function majorityOfGuardians()
        internal
        view
        returns (uint256 guardianNumber)
    {
        uint256 guardianLength = guardianCount();
        guardianNumber = (guardianLength == 0) ? 0 : guardianLength / 2 + 1;
    }

    function isGuardian(address _guardian) internal view returns (bool) {
        StorageConfig storage config = LibFacetStorage
            .guardianStorage()
            .configs[0];
        return config.info[_guardian].exists;
    }

    function guardianCount() internal view returns (uint256) {
        StorageConfig storage config = LibFacetStorage
            .guardianStorage()
            .configs[0];
        return config.addresses.length;
    }

    function getGuardians() internal view returns (address[] memory) {
        StorageConfig storage config = LibFacetStorage
            .guardianStorage()
            .configs[0];
        address[] memory addresses = new address[](config.addresses.length);
        uint256 addressesLen = config.addresses.length;
        for (uint256 i; i < addressesLen; ) {
            addresses[i] = config.addresses[i];
            unchecked {
                ++i;
            }
        }
        return addresses;
    }
}
