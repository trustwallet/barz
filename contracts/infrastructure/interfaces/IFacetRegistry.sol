// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title Facet Registry Interface
 * @dev Interface for Facet Registry contract to keep track of facets & function selectors addable to user wallets
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IFacetRegistry {
    struct FacetRegistryConfig {
        bytes4[] selectors;
        mapping(bytes4 => FacetInfo) info;
    }
    struct FacetInfo {
        bool exists;
        uint128 index;
    }

    event FacetFunctionSelectorsRegistered(
        address facet,
        bytes4[] facetSelectors
    );
    event FacetFunctionSelectorsRemoved(address facet, bytes4[] facetSelectors);

    error FacetRegistry__FacetSelectorAlreadyRegistered();
    error FacetRegistry__UnregisteredFacetSelector();

    function registerFacetFunctionSelectors(
        address facet,
        bytes4[] calldata facetSelectors
    ) external;

    function removeFacetFunctionSelectors(
        address facet,
        bytes4[] calldata facetSelectors
    ) external;

    function areFacetFunctionSelectorsRegistered(
        address facet,
        bytes4[] calldata facetSelectors
    ) external view returns (bool);

    function isFacetFunctionSelectorRegistered(
        address facet,
        bytes4 facetSelector
    ) external view returns (bool);

    function getFacetFunctionSelectors(
        address facet
    ) external view returns (bytes4[] memory);
}
