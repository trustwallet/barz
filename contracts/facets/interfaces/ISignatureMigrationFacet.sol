// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {SignatureMigrationConfig} from "../../libraries/LibFacetStorage.sol";

/**
 * @title Signature Migration Facet Interface
 * @dev Interface of Signature Migration contract for migrating user signature scheme to a new scheme user sets
 *      Which could include
 *          - ECDSA on Secp256K1 Curve
 *          - ECDSA on Secp256R1 Curve
 *          - BLS, Schnorr, etc
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface ISignatureMigrationFacet {
    event SignatureSchemeMigration(
        address indexed prevVerificationFacet,
        address indexed newVerificationFacet,
        bytes newOwner,
        bytes4[] verificationFuncSelectors
    );
    event SignatureMigrationApproved(
        bytes newPublicKey,
        address indexed newVerificationFacet,
        bytes4[] verificationFuncSelectors,
        address indexed guardian,
        uint128 approvalValidUntil
    );
    event SignatureMigrationApprovalRevoked(
        bytes newPublicKey,
        address indexed newVerificationFacet,
        bytes4[] verificationFuncSelectors,
        address indexed guardian
    );
    event SignatureMigrationExecuted(
        address indexed newVerificationFacet,
        bytes newOwner,
        bytes4[] verificationFuncSelectors,
        uint128 migrateAfter
    );
    event SignatureMigrationCanceled(
        address indexed newVerificationFacet,
        bytes newOwner,
        bytes4[] verificationFuncSelectors
    );
    event SignatureMigrationCancellationApproved(
        address indexed newVerificationFacet,
        bytes newOwner,
        bytes4[] verificationFuncSelectors
    );

    error SignatureMigrationFacet__SignerUninitializationFailure();
    error SignatureMigrationFacet__SignerInitializationFailure();
    error SignatureMigrationFacet__InvalidRouteWithGuardian();
    error SignatureMigrationFacet__InvalidKeyType();
    error SignatureMigrationFacet__InsufficientApprovers();
    error SignatureMigrationFacet__InvalidApproverSignature();
    error SignatureMigrationFacet__InvalidGuardian();
    error SignatureMigrationFacet__NonExistentApprover();
    error SignatureMigrationFacet__InvalidMigrationPeriod();
    error SignatureMigrationFacet__NonexistentMigration();
    error SignatureMigrationFacet__MigrationPeriodNotOver();
    error SignatureMigrationFacet__InvalidArrayLength();
    error SignatureMigrationFacet__InvalidApprovalValidationPeriod();
    error SignatureMigrationFacet__CannotRevokeUnapproved();
    error SignatureMigrationFacet__LackOfOwnerApproval();
    error SignatureMigrationFacet__OwnerAlreadyApproved();
    error SignatureMigrationFacet__NonExistentVerificationFacet();
    error SignatureMigrationFacet__DuplicateApproval();

    function migrateSignatureScheme(
        address newVerificationFacet,
        bytes calldata newPublicKey,
        bytes4[] calldata newVerificationFuncSelectors
    ) external;

    function migrateSignatureSchemeWithGuardian(
        address newVerificationFacet,
        bytes calldata newPublicKey,
        bytes4[] calldata newVerificationFuncSelectors,
        address[] calldata approvers,
        bytes[] calldata signatures
    ) external;

    function approveSignatureSchemeMigration(
        address newVerificationFacet,
        bytes calldata newPublicKey,
        bytes4[] calldata newVerificationFuncSelectors
    ) external;

    function revokeSignatureMigrationApproval(
        address newVerificationFacet,
        bytes calldata newPublicKey,
        bytes4[] calldata newVerificationFuncSelectors
    ) external;

    function finalizeSignatureMigration() external;

    function approveCancelSignatureMigration(
        address newVerificationFacet,
        bytes calldata newPublicKey,
        bytes4[] calldata newVerificationFuncSelectors
    ) external;

    function cancelSignatureMigration(
        address newVerificationFacet,
        bytes calldata newPublicKey,
        bytes4[] calldata newVerificationFuncSelectors,
        address[] calldata guardians,
        bytes[] calldata signatures
    ) external;

    function getApprovalMigrationKeyHash(
        bytes memory recoveryPublicKey,
        address newVerificationFacet,
        bytes4[] memory newVerificationFuncSelectors,
        string memory saltString
    ) external view returns (bytes32);

    function getMigrationOwnerApprovalWithTimeValidity(
        bytes32 publicKeyHash
    ) external view returns (bool);

    function getMigrationApprovalCountWithTimeValidity(
        bytes32 publicKeyHash
    ) external view returns (uint256);

    function isMigrationApproved(
        bytes32 migrationPublicKeyHash,
        address approver
    ) external view returns (bool);

    function getMigrationNonce() external view returns (uint128);

    function isMigrationPending() external view returns (bool);

    function getPendingMigration()
        external
        view
        returns (SignatureMigrationConfig memory);
}
