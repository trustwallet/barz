// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {Barz} from "../Barz.sol";

/**
 * @title Barz Factory Interface
 * @dev Interface of contract to easily deploy Barz to a pre-computed address with a single call
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IBarzFactory {
    event BarzDeployed(address);

    function createAccount(
        address verificationFacet,
        bytes calldata owner,
        uint256 salt
    ) external returns (Barz);

    function getAddress(
        address verificationFacet,
        bytes calldata owner,
        uint256 salt
    ) external view returns (address);

    function getBytecode(
        address accountFacet,
        address verificationFacet,
        address entryPoint,
        address facetRegistry,
        address defaultFallback,
        bytes memory ownerPublicKey
    ) external pure returns (bytes memory);

    function getCreationCode() external pure returns (bytes memory);
}
