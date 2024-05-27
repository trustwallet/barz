// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IDiamondLoupe} from "./IDiamondLoupe.sol";

/**
 * @title LoupeFromStorage Interface
 * @dev Interface contract to function as a loupe facet directly attached to diamond storage of Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IStorageLoupe {
    /// These functions are expected to be called frequently
    /// by tools.

    /// @notice Gets all facet addresses and their four byte function selectors.
    /// @return facets_ Facet
    function facetsFromStorage()
        external
        view
        returns (IDiamondLoupe.Facet[] memory);

    /// @notice Gets all the function selectors supported by a specific facet.
    /// @param _facet The facet address.
    function facetFunctionSelectorsFromStorage(
        address _facet
    ) external view returns (bytes4[] memory);

    /// @notice Get all the facet addresses used by a diamond.
    function facetAddressesFromStorage()
        external
        view
        returns (address[] memory);

    /// @notice Gets the facet that supports the given selector.
    /// @dev If facet is not found return address(0).
    /// @param _functionSelector The function selector.
    function facetAddressFromStorage(
        bytes4 _functionSelector
    ) external view returns (address);
}
