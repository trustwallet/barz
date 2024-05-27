// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

contract AccountRecoveryFacetTestBase {
    event RecoveryApproved(
        bytes indexed recoveryPublicKey,
        address indexed guardian,
        uint64 validUntil
    );
    event RecoveryApprovalRevoked(
        bytes indexed recoveryPublicKey,
        address indexed guardian
    );
    event RecoveryExecuted(
        bytes indexed recoveryPublicKey,
        uint64 executeAfter
    );
    event RecoveryFinalized(bytes indexed recoveryPublicKey);
    event RecoveryCanceled(bytes indexed recoveryPublicKey);
    event RecoveryCancellationApproved(
        bytes indexed recoveryPublicKey,
        address indexed guardian
    );
    event RecoveryHardstopped();
    error AccountRecoveryFacet__InvalidRecoveryPublicKey();
}