// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title Restrictions Facet Interface
 * @dev Interface of Restrictions contract that enables modular restrictions in Barz
 * @author Ruslan Serebriakov (@rsrbk)
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IRestrictionsFacet {
    event RestrictionAdded(address indexed restriction);
    event RestrictionRemoved(address indexed restriction);

    error RestrictionsFacet__EmptyRestrictionsList();
    error RestrictionsFacet__RestrictionNotFound();
    error RestrictionsFacet__RestrictionAlreadyExists();
    error RestrictionsFacet__ZeroAddressRestrictions();
    error RestrictionsFacet__ZeroAddressRestrictionsFacet();
    error RestrictionsFacet__RemainingRestrictionsCantBeEmpty();

    function initializeRestrictions(
        address[] memory _restrictions
    ) external returns (uint256);

    function uninitializeRestrictions() external returns (uint256);

    function getRestrictions() external view returns (address[] memory);

    function addRestriction(address restriction) external;

    function removeRestriction(address restriction) external;

    function verifyRestrictions(
        address from,
        address to,
        uint256 value,
        bytes calldata _calldata
    ) external returns (uint256);
}
