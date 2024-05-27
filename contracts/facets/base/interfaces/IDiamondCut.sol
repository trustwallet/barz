// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title DiamondCut Facet Interface
 * @dev Interface for DiamondCut Facet responsible for adding/removing/replace facets in Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IDiamondCut {
    error DiamondCutFacet__InvalidRouteWithGuardian();
    error DiamondCutFacet__InvalidRouteWithoutGuardian();
    error DiamondCutFacet__InvalidArrayLength();
    error DiamondCutFacet__InsufficientApprovers();
    error DiamondCutFacet__InvalidApprover();
    error DiamondCutFacet__InvalidApproverSignature();
    error DiamondCutFacet__InvalidApprovalValidationPeriod();
    error DiamondCutFacet__CannotRevokeUnapproved();
    error DiamondCutFacet__LackOfOwnerApproval();
    error DiamondCutFacet__OwnerAlreadyApproved();
    error DiamondCutFacet__DuplicateApproval();
    error DiamondCutFacet__InvalidInitAddress();

    event DiamondCutApproved(FacetCut[] diamondCut);
    event DiamondCutApprovalRevoked(FacetCut[] diamondCut);

    event SupportsInterfaceUpdated(bytes4 interfaceId, bool _lag);

    enum FacetCutAction {
        Add,
        Replace,
        Remove
    }
    // Add=0, Replace=1, Remove=2

    struct FacetCut {
        address facetAddress;
        FacetCutAction action;
        bytes4[] functionSelectors;
    }

    /// @notice Add/replace/remove any number of functions and optionally execute
    ///         a function with delegatecall
    /// @param diamondCut Contains the facet addresses and function selectors
    /// @param init The address of the contract or facet to execute _calldata
    /// @param _calldata A function call, including function selector and arguments
    ///                  _calldata is executed with delegatecall on _init
    function diamondCut(
        FacetCut[] calldata diamondCut,
        address init,
        bytes calldata _calldata
    ) external;

    function updateSupportsInterface(bytes4 interfaceId, bool flag) external;

    function diamondCutWithGuardian(
        FacetCut[] calldata diamondCut,
        address[] calldata approvers,
        bytes[] calldata signatures
    ) external;

    function approveDiamondCut(FacetCut[] calldata diamondCut) external;

    function revokeDiamondCutApproval(FacetCut[] calldata diamondCut) external;

    function getDiamondCutApprovalCountWithTimeValidity(
        bytes32 diamondCutHash
    ) external view returns (uint256);

    function getOwnerCutApprovalWithTimeValidity(
        bytes32 diamondCutHash
    ) external view returns (bool);

    function isCutApproved(
        bytes32 diamondCutHash,
        address approver
    ) external view returns (bool);

    function getDiamondCutHash(
        FacetCut[] calldata diamondCut
    ) external view returns (bytes32);

    function getDiamondCutNonce() external view returns (uint128);
}
