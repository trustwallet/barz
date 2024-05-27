// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IFacetRegistry} from "./interfaces/IFacetRegistry.sol";

/**
 * @title Facet Registry
 * @dev Contract to keep track of facets & function selectors addable to user wallets
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract FacetRegistry is IFacetRegistry, Ownable2Step {
    mapping(address => FacetRegistryConfig) private facets;

    /**
     * @notice Transfers the ownership of the contract to the given owner
     * @param _owner Address of owner who has access to initialize the default security variables for security manager
     */
    constructor(address _owner) {
        transferOwnership(_owner);
        _transferOwnership(_owner);
    }

    /**
     * @dev Registers a facet and it's function selectors to registry
     * @param _facet address of facet
     * @param _facetSelectors list of function selectors of the facet
     */
    function registerFacetFunctionSelectors(
        address _facet,
        bytes4[] calldata _facetSelectors
    ) external override onlyOwner {
        FacetRegistryConfig storage facetConfig = facets[_facet];
        for (uint256 i; i < _facetSelectors.length; ) {
            if (facetConfig.info[_facetSelectors[i]].exists)
                revert FacetRegistry__FacetSelectorAlreadyRegistered();

            facetConfig.info[_facetSelectors[i]].exists = true;
            facetConfig.info[_facetSelectors[i]].index = uint128(
                facetConfig.selectors.length
            );
            facetConfig.selectors.push(_facetSelectors[i]);
            unchecked {
                ++i;
            }
        }
        emit FacetFunctionSelectorsRegistered(_facet, _facetSelectors);
    }

    /**
     * @dev Removes a registered facet and it's corresponding selectors from registry
     * @param _facet address of facet
     * @param _facetSelectors list of function selectors of the facet
     */
    function removeFacetFunctionSelectors(
        address _facet,
        bytes4[] calldata _facetSelectors
    ) external override onlyOwner {
        FacetRegistryConfig storage facetConfig = facets[_facet];
        for (uint256 i; i < _facetSelectors.length; ) {
            if (!facetConfig.info[_facetSelectors[i]].exists)
                revert FacetRegistry__UnregisteredFacetSelector();

            bytes4 lastSelector = facetConfig.selectors[
                facetConfig.selectors.length - 1
            ];
            if (_facetSelectors[i] != lastSelector) {
                uint128 targetIndex = facetConfig
                    .info[_facetSelectors[i]]
                    .index;
                facetConfig.selectors[targetIndex] = lastSelector;
                facetConfig.info[lastSelector].index = targetIndex;
            }
            facetConfig.selectors.pop();
            delete facetConfig.info[_facetSelectors[i]];

            unchecked {
                ++i;
            }
        }
        emit FacetFunctionSelectorsRemoved(_facet, _facetSelectors);
    }

    /**
     * @dev Checks if a facet and it's selectors given is registered to facet registry
     * @param _facet Address of facet
     * @param _facetSelectors List of function selectors of the facet
     */
    function areFacetFunctionSelectorsRegistered(
        address _facet,
        bytes4[] calldata _facetSelectors
    ) external view override returns (bool) {
        FacetRegistryConfig storage facetConfig = facets[_facet];
        if (_facetSelectors.length == 0) return false;
        for (uint256 i; i < _facetSelectors.length; ) {
            if (!facetConfig.info[_facetSelectors[i]].exists) return false;
            unchecked {
                ++i;
            }
        }
        return true;
    }

    /**
     * @dev Checks if a facet and it's selector given is registered to facet registry
     * @param _facet Address of facet
     * @param _facetSelector List of function selectors of the facet
     * @return isRegistered Bool value showing if the selector is registered
     */
    function isFacetFunctionSelectorRegistered(
        address _facet,
        bytes4 _facetSelector
    ) external view override returns (bool isRegistered) {
        FacetRegistryConfig storage facetConfig = facets[_facet];
        isRegistered = facetConfig.info[_facetSelector].exists;
    }

    /**
     * @dev Get the registered selectors of facet from registry
     * @param _facet Address of facet
     * @return selectors Selectors registered to facet
     */
    function getFacetFunctionSelectors(
        address _facet
    ) external view override returns (bytes4[] memory selectors) {
        FacetRegistryConfig storage facetConfig = facets[_facet];
        selectors = facetConfig.selectors;
    }
}
