// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title Multi-sig facet Interface
 * @dev Interface of Multi-signature Facet with custom threshold.
        Wallet that adds this facet becomes a multi-sig wallet
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IMultiSigFacet {
    event ThresholdChanged(uint256 threshold);
    event OwnerAdded(address indexed newOwner);
    event OwnerRemoved(address indexed prevOwner);
    event HashApproved(bytes32 hashToApprove, address indexed owner);

    error MultiSigFacet__InvalidThreshold();
    error MultisigFacet__InvalidOwnerCount();
    error MultiSigFacet__InvalidRoute();
    error MultiSigFacet__InsufficientSignerLength();
    error MultiSigFacet__InvalidInitData();
    error MultiSigFacet__InvalidOwnerAddress();
    error MultiSigFacet__InvalidOwnerPair();
    error MultiSigFacet__InvalidSignatureLength();
    error MultiSigFacet__InvalidSignatureType();
    error MultiSigFacet__DuplicateOwner();
    error MultiSigFacet__OnlyOwner();

    function checkSignatures(
        bytes32 _dataHash,
        bytes calldata _signatures,
        uint256 _threshold
    ) external view returns (uint256);

    function splitSignatures(
        bytes calldata _signatures,
        uint256 _nextOffset
    )
        external
        pure
        returns (
            address owner,
            bytes memory signature,
            uint256 signatureType,
            uint256 nextOffset
        );

    function approveHash(bytes32 hashToApprove) external;

    function addOwner(address newOwner, uint256 threshold) external;

    function removeOwner(
        address prevOwner,
        address removedOwner,
        uint256 threshold
    ) external;

    function swapOwner(
        address prevOwner,
        address oldOwner,
        address newOwner
    ) external;

    function changeThreshold(uint256 _threshold) external;

    function isOwner(address owner) external view returns (bool);

    function getThreshold() external view returns (uint256);

    function getOwners() external view returns (address[] memory);
}
