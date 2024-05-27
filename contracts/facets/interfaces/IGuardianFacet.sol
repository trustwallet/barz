// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title Guardian Facet Interface
 * @dev Interface of guaridna contract that enables addition/removal of guardians from Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IGuardianFacet {
    event GuardianAdditionRequested(
        address indexed guardian,
        uint256 executeAfter
    );
    event GuardianRemovalRequested(
        address indexed guardian,
        uint256 executeAfter
    );
    event GuardianAdditionCancelled(address indexed guardian);
    event GuardianRemovalCancelled(address indexed guardian);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);

    error GuardianFacet__GuardianCannotBeSelf();
    error GuardianFacet__DuplicateGuardian();
    error GuardianFacet__OwnerCannotBeGuardian();
    error GuardianFacet__DuplicateGuardianAddition();
    error GuardianFacet__DuplicateGuardianRemoval();
    error GuardianFacet__UnknownPendingAddition();
    error GuardianFacet__PendingAdditionNotOver();
    error GuardianFacet__UnknownPendingRemoval();
    error GuardianFacet__PendingRemovalNotOver();
    error GuardianFacet__PendingAdditionExpired();
    error GuardianFacet__InvalidAdditionSecurityPeriod();
    error GuardianFacet__InvalidRemovalSecurityPeriod();
    error GuardianFacet__InvalidSecurityWindow();
    error GuardianFacet__NonExistentGuardian();
    error GuardianFacet__AlreadyExists();
    error GuardianFacet__InvalidGuardianAddition();
    error GuardianFacet__InvalidGuardianRemoval();
    error GuardianFacet__ZeroAddressGuardian();

    function addGuardian(address guardian) external;

    function addGuardians(address[] calldata guardians) external;

    function removeGuardian(address guardian) external;

    function removeGuardians(address[] calldata guardians) external;

    function confirmGuardianAddition(address guardian) external;

    function confirmGuardianAdditions(address[] calldata guardian) external;

    function confirmGuardianRemoval(address guardian) external;

    function confirmGuardianRemovals(address[] calldata guardian) external;

    function cancelGuardianAddition(address guardian) external;

    function cancelGuardianRemoval(address guardian) external;

    function isGuardian(address guardian) external view returns (bool);

    function isAdditionPending(address guardian) external view returns (bool);

    function isRemovalPending(address guardian) external view returns (bool);

    function isGuardianFacetRemovable() external view returns (bool);

    function getAdditionSecurityPeriod() external view returns (uint256);

    function getRemovalSecurityPeriod() external view returns (uint256);

    function getSecurityWindow() external view returns (uint256);

    function getGuardians() external view returns (address[] memory);

    function majorityOfGuardians() external view returns (uint256);

    function guardianCount() external view returns (uint256);
}
