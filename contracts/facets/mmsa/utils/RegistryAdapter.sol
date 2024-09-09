// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC7484} from "../../../interfaces/ERC/IERC7484.sol";
import {LibMMSAStorage} from "../../../libraries/LibMMSAStorage.sol";

/**
 * IERC7484 Registry adapter.
 * this feature is opt-in. The smart account owner can choose to use the registry and which
 * attesters to trust.
 * @author zeroknots.eth | rhinestone.wtf
 */
abstract contract RegistryAdapter {
    event ERC7484RegistryConfigured(address registry);

    modifier withRegistry(address module, uint256 moduleType) {
        _checkRegistry(module, moduleType);
        _;
    }

    /**
     * Check on ERC7484 Registry, if suffcient attestations were made
     * This will revert, if not succicient valid attestations are on the registry
     */
    function _checkRegistry(address module, uint256 moduleType) internal view {
        IERC7484 registry = LibMMSAStorage.mmsaStorage().registry;
        if (address(registry) != address(0)) {
            // this will revert if attestations / threshold are not met
            registry.checkForAccount(address(this), module, moduleType);
        }
    }

    /**
     * Configure ERC7484 Registry for Safe
     */
    function _configureRegistry(
        IERC7484 registry,
        address[] calldata attesters,
        uint8 threshold
    ) internal {
        // sstore value in any case, as this function may be used to disable the use of registry
        LibMMSAStorage.mmsaStorage().registry = registry;

        // registry is an opt in feature for barz. if set, configure trusted attesters
        if (address(registry) != address(0)) {
            registry.trustAttesters(threshold, attesters);
        }
        emit ERC7484RegistryConfigured(address(registry));
    }
}
