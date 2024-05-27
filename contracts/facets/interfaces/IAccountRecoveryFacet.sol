// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {RecoveryConfig} from "../../libraries/LibFacetStorage.sol";

/**
 * @title Account Recovery Facet Interface
 * @dev Interface of contract that enables recovery of accounts when owner key is unavailable
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IAccountRecoveryFacet {
    event RecoveryExecuted(
        bytes indexed recoveryPublicKey,
        uint64 executeAfter
    );
    event RecoveryFinalized(bytes indexed recoveryPublicKey);
    event RecoveryCanceled(bytes indexed recoveryPublicKey);
    event RecoveryApproved(
        bytes indexed recoveryPublicKey,
        address indexed guardian,
        uint64 validUntil
    );
    event RecoveryApprovalRevoked(
        bytes indexed recoveryPublicKey,
        address indexed guardian
    );
    event RecoveryCancellationApproved(
        bytes indexed recoveryPublicKey,
        address indexed guardian
    );
    event RecoveryHardstopped();

    error AccountRecoveryFacet__CallerNotGuardian();
    error AccountRecoveryFacet__InvalidRecoveryPublicKey();
    error AccountRecoveryFacet__SignerInitializationFailure();
    error AccountRecoveryFacet__SignerUninitializationFailure();
    error AccountRecoveryFacet__InvalidArrayLength();
    error AccountRecoveryFacet__InsufficientGuardians();
    error AccountRecoveryFacet__RecoveryAlreadyOngoing();
    error AccountRecoveryFacet__NonexistentRecovery();
    error AccountRecoveryFacet__NonExistentApproval();
    error AccountRecoveryFacet__RecoveryPeriodNotOver();
    error AccountRecoveryFacet__InvalidLockPeriod();
    error AccountRecoveryFacet__InvalidRecoveryPeriod();
    error AccountRecoveryFacet__InvalidApprovalValidationPeriod();
    error AccountRecoveryFacet__InvalidGuardian();
    error AccountRecoveryFacet__InvalidGuardianSignature();
    error AccountRecoveryFacet__InvalidOwnerSignature();
    error AccountRecoveryFacet__CallNotSuccesful();
    error AccountRecoveryFacet__DuplicateApproval();

    function approveAccountRecovery(bytes calldata recoveryPublicKey) external;

    function revokeAccountRecoveryApproval(
        bytes calldata recoveryPublicKey
    ) external;

    function executeRecovery(
        bytes calldata recoveryPublicKey,
        address[] calldata guardians,
        bytes[] calldata signatures
    ) external;

    function finalizeRecovery() external;

    function approveCancelRecovery(bytes calldata recoveryPublicKey) external;

    function cancelRecovery(
        bytes calldata recoveryPublicKey,
        address[] calldata guardians,
        bytes[] calldata signatures
    ) external;

    function hardstopRecovery(bytes calldata signature) external;

    function validateNewOwner(bytes calldata recoveryPublicKey) external view;

    function getApprovalRecoveryKeyHash(
        bytes memory recoveryPublicKey,
        string memory saltString
    ) external view returns (bytes32);

    function getRecoveryApprovalCountWithTimeValidity(
        bytes32 recoveryPublicKeyHash
    ) external view returns (uint256);

    function isRecoveryApproved(
        bytes32 recoveryPublicKeyHash,
        address approver
    ) external view returns (bool);

    function getRecoveryNonce() external view returns (uint128);

    function getPendingRecovery() external view returns (RecoveryConfig memory);
}
