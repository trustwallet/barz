// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {LibGuardian} from "../libraries/LibGuardian.sol";
import {BarzStorage} from "../libraries/LibAppStorage.sol";
import {IDiamondCut} from "../facets/base/interfaces/IDiamondCut.sol";

/**
 * @title Modifiers
 * @dev Responsible for providing modifiers/util functions to Facet contracts
 * @author David Yongjun Kim (@Powerstream3604)
 */
abstract contract Modifiers is BarzStorage {
    uint8 constant INNER_STRUCT = 0;

    error CallerNotGuardian();
    error CallerNotGuardianOrOwner();
    error DuplicateApprover();
    error ZeroApproverLength();
    error UnregisteredFacetAndSelectors();

    /**
     * @notice Modifier to only allow guardian to make a call, reverts if any other entity is the caller
     */
    modifier onlyGuardian() {
        if (!LibGuardian.isGuardian(msg.sender)) revert CallerNotGuardian();
        _;
    }

    /**
     * @notice Modifier to only allow guardian or owner to make a call, reverts if any other entity is the caller
     */
    modifier onlyGuardianOrOwner() {
        if (!LibGuardian.isGuardian(msg.sender) && address(this) != msg.sender)
            revert CallerNotGuardianOrOwner();
        _;
    }

    /**
     * @notice Checks if the approver address is the array is unique with no duplicate
     * @dev This method loops through the array and checks if a duplicate address exists, it reverts if duplicate address exists
     * @param approvers Array of address
     */
    function _checkApprover(
        address[] memory approvers
    ) internal pure returns (bool) {
        uint256 approverLength = approvers.length;
        if (0 == approverLength) revert ZeroApproverLength();
        for (uint256 i; i < approverLength - 1; ) {
            for (uint256 j = i + 1; j < approverLength; ) {
                if (approvers[i] == approvers[j]) {
                    revert DuplicateApprover(); // Found a duplicate
                }
                unchecked {
                    ++j;
                }
            }
            unchecked {
                ++i;
            }
        }
        return false; // No duplicates found
    }

    /**
     * @notice Checks if the facet getting added or replaced is registered to facet registry
     * @dev This method loops through the cut and checks if the facet getting added/replaced is registered to facet registry
     * @param _diamondCut Array of FacetCut, data for diamondCut defined in EIP-2535
     */
    function _checkFacetCutValidity(
        IDiamondCut.FacetCut[] memory _diamondCut
    ) internal view {
        uint256 diamondCutLength = _diamondCut.length;
        for (uint256 i; i < diamondCutLength; ) {
            if (
                _diamondCut[i].action == IDiamondCut.FacetCutAction.Add ||
                _diamondCut[i].action == IDiamondCut.FacetCutAction.Replace
            ) {
                if (
                    !s.facetRegistry.areFacetFunctionSelectorsRegistered(
                        _diamondCut[i].facetAddress,
                        _diamondCut[i].functionSelectors
                    )
                ) revert UnregisteredFacetAndSelectors();
            }
            unchecked {
                ++i;
            }
        }
    }
}
