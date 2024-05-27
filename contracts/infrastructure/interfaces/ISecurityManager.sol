// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title Facet Registry Interface
 * @dev Infrastructure contract to manage security parameters of users
 * @author David Yongjun Kim (@Powerstream3604)
 * @author Ruslan Serebriakov (@rsrbk)
 */
interface ISecurityManager {
    error SecurityManager__OutOfBoundary();
    error SecurityManager__CallerNotWallet();
    error SecurityManager__AlreadyIntialized();

    function initializeAdditionSecurityPeriod(
        uint128 defaultAdditionSecurityPeriod,
        uint128 minAdditionSecurityPeriod,
        uint128 maxAdditionSecurityPeriod
    ) external;

    function initializeRemovalSecurityPeriod(
        uint128 defaultRemovalSecurityPeriod,
        uint128 minRemovalSecurityPeriod,
        uint128 maxRemovalSecurityPeriod
    ) external;

    function initializeApprovalValidationPeriod(
        uint128 defaultApprovalValidationPeriod,
        uint128 minApprovalValidationPeriod,
        uint128 maxApprovalValidationPeriod
    ) external;

    function initializeMigrationPeriod(
        uint128 defaultMigrationPeriod,
        uint128 minMigrationPeriod,
        uint128 maxMigrationPeriod
    ) external;

    function initializeLockPeriod(
        uint128 defaultLockPeriod,
        uint128 minLockPeriod,
        uint128 maxLockPeriod
    ) external;

    function initializeRecoveryPeriod(
        uint128 defaultRecoveryPeriod,
        uint128 minRecoveryPeriod,
        uint128 maxRecoveryPeriod
    ) external;

    function initializeSecurityWindow(
        uint128 defaultSecurityWindow,
        uint128 minSecurityWindow,
        uint128 maxSecurityWindow
    ) external;

    function setAdditionSecurityPeriod(
        address wallet,
        uint128 additionSecurityPeriod
    ) external;

    function setRemovalSecurityPeriod(
        address wallet,
        uint128 removalSecurityPeriod
    ) external;

    function setSecurityWindow(address wallet, uint128 securityWindow) external;

    function setRecoveryPeriod(address wallet, uint128 recoveryPeriod) external;

    function setLockPeriod(address wallet, uint128 lockPeriod) external;

    function setApprovalValidationPeriod(
        address wallet,
        uint128 approvalValidationPeriod
    ) external;

    function setMigrationPeriod(
        address wallet,
        uint128 migrationPeriod
    ) external;

    function additionSecurityPeriodOf(
        address wallet
    ) external view returns (uint128);

    function removalSecurityPeriodOf(
        address wallet
    ) external view returns (uint128);

    function securityWindowOf(address wallet) external view returns (uint128);

    function recoveryPeriodOf(address wallet) external view returns (uint128);

    function lockPeriodOf(address wallet) external view returns (uint128);

    function migrationPeriodOf(address wallet) external view returns (uint128);

    function approvalValidationPeriodOf(
        address wallet
    ) external view returns (uint128);
}
