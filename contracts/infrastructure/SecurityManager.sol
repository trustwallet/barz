// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ISecurityManager} from "./interfaces/ISecurityManager.sol";

/**
 * @title Security Manager
 * @dev Infrastructure contract to manage security parameters of users
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract SecurityManager is ISecurityManager, Ownable2Step {
    uint128 public minAdditionSecurityPeriod;
    uint128 public maxAdditionSecurityPeriod;
    uint128 private defaultAdditionSecurityPeriod;

    uint128 public minRemovalSecurityPeriod;
    uint128 public maxRemovalSecurityPeriod;
    uint128 private defaultRemovalSecurityPeriod;

    uint128 public minSecurityWindow;
    uint128 public maxSecurityWindow;
    uint128 private defaultSecurityWindow;

    uint128 public minRecoveryPeriod;
    uint128 public maxRecoveryPeriod;
    uint128 private defaultRecoveryPeriod;

    uint128 public minLockPeriod;
    uint128 public maxLockPeriod;
    uint128 private defaultLockPeriod;

    uint128 public minApprovalValidationPeriod;
    uint128 public maxApprovalValidationPeriod;
    uint128 private defaultApprovalValidationPeriod;

    uint128 public minMigrationPeriod;
    uint128 public maxMigrationPeriod;
    uint128 private defaultMigrationPeriod;

    bool public _isAdditionSecurityPeriodInitialized;
    bool public _isRemovalSecurityPeriodInitialized;
    bool public _isSecurityWindowInitialized;
    bool public _isRecoveryPeriodInitialized;
    bool public _isLockPeriodInitialized;
    bool public _isApprovalValidationPeriodInitialized;
    bool public _isMigrationPeriodInitialized;

    mapping(address => CustomSecurityConfig) securityConfigs;

    struct CustomSecurityConfig {
        uint128 additionSecurityPeriod;
        uint128 removalSecurityPeriod;
        uint128 securityWindow;
        uint128 recoveryPeriod;
        uint128 lockPeriod;
        uint128 approvalValidationPeriod;
        uint128 migrationPeriod;
    }

    /**
     * @notice Modifier to only allow wallet itself to make a call to wallet
     */
    modifier onlyWallet(address _wallet) {
        if (msg.sender != _wallet) revert SecurityManager__CallerNotWallet();
        _;
    }

    /**
     * @notice Modifier to revert if the variable is already initialized
     */
    modifier initializer(bool _isInitialized) {
        if (_isInitialized) revert SecurityManager__AlreadyIntialized();
        _;
    }

    /**
     * @notice Transfers the ownership of the contract to the given owner
     * @param _owner Address of owner who has access to initialize the default security variables for security manager
     */
    constructor(address _owner) {
        transferOwnership(_owner);
        _transferOwnership(_owner);
    }

    /**
     * @notice Sets the initial default/min/max addition security period for all Barz contracts that use this as Security Manager
     *         This function can only be called by the owner of the SecurityManager
     *         Default value should be bigger than the min and smaller than the max
     * @param _defaultAdditionSecurityPeriod Default Addition Security Period for all Barz contracts
     * @param _minAdditionSecurityPeriod Minimum Addition Security Period for all Barz contracts
     * @param _maxAdditionSecurityPeriod Maximum Addition Security Period for all Barz contracts
     */
    function initializeAdditionSecurityPeriod(
        uint128 _defaultAdditionSecurityPeriod,
        uint128 _minAdditionSecurityPeriod,
        uint128 _maxAdditionSecurityPeriod
    )
        external
        override
        onlyOwner
        initializer(_isAdditionSecurityPeriodInitialized)
    {
        _isAdditionSecurityPeriodInitialized = true;

        _validatePeriodBoundaries(
            _defaultAdditionSecurityPeriod,
            _minAdditionSecurityPeriod,
            _maxAdditionSecurityPeriod
        );
        defaultAdditionSecurityPeriod = _defaultAdditionSecurityPeriod;
        minAdditionSecurityPeriod = _minAdditionSecurityPeriod;
        maxAdditionSecurityPeriod = _maxAdditionSecurityPeriod;
    }

    /**
     * @notice Sets the initial default/min/max removal security period for all Barz contracts that use this as Security Manager
     *         This function can only be called by the owner of the SecurityManager
     *         Default value should be bigger than the min and smaller than the max
     * @param _defaultRemovalSecurityPeriod Default Removal Security Period for all Barz contracts
     * @param _minRemovalSecurityPeriod Minimum Removal Security Period for all Barz contracts
     * @param _maxRemovalSecurityPeriod Maximum Removal Security Period for all Barz contracts
     */
    function initializeRemovalSecurityPeriod(
        uint128 _defaultRemovalSecurityPeriod,
        uint128 _minRemovalSecurityPeriod,
        uint128 _maxRemovalSecurityPeriod
    )
        external
        override
        onlyOwner
        initializer(_isRemovalSecurityPeriodInitialized)
    {
        _isRemovalSecurityPeriodInitialized = true;

        _validatePeriodBoundaries(
            _defaultRemovalSecurityPeriod,
            _minRemovalSecurityPeriod,
            _maxRemovalSecurityPeriod
        );
        defaultRemovalSecurityPeriod = _defaultRemovalSecurityPeriod;
        minRemovalSecurityPeriod = _minRemovalSecurityPeriod;
        maxRemovalSecurityPeriod = _maxRemovalSecurityPeriod;
    }

    /**
     * @notice Sets the initial default/min/maxd security window for all Barz contracts that use this as Security Manager
     *         This function can only be called by the owner of the SecurityManager
     *         Default value should be bigger than the min and smaller than the max
     * @param _defaultSecurityWindow Default Security Window for all Barz contracts
     * @param _minSecurityWindow Minimum Security Window for all Barz contracts
     * @param _maxSecurityWindow Maximum Security Window for all Barz contracts
     */
    function initializeSecurityWindow(
        uint128 _defaultSecurityWindow,
        uint128 _minSecurityWindow,
        uint128 _maxSecurityWindow
    ) external override onlyOwner initializer(_isSecurityWindowInitialized) {
        _isSecurityWindowInitialized = true;

        _validatePeriodBoundaries(
            _defaultSecurityWindow,
            _minSecurityWindow,
            _maxSecurityWindow
        );
        defaultSecurityWindow = _defaultSecurityWindow;
        minSecurityWindow = _minSecurityWindow;
        maxSecurityWindow = _maxSecurityWindow;
    }

    /**
     * @notice Sets the initial default/min/max recovery period for all Barz contracts that use this as Security Manager
     *         This function can only be called by the owner of the SecurityManager
     *         Default value should be bigger than the min and smaller than the max
     * @param _defaultRecoveryPeriod Default Recovery Period for all Barz contracts
     * @param _minRecoveryPeriod Minimum Recovery Period for all Barz contracts
     * @param _maxRecoveryPeriod Maximum Recovery Period for all Barz contracts
     */
    function initializeRecoveryPeriod(
        uint128 _defaultRecoveryPeriod,
        uint128 _minRecoveryPeriod,
        uint128 _maxRecoveryPeriod
    ) external override onlyOwner initializer(_isRecoveryPeriodInitialized) {
        _isRecoveryPeriodInitialized = true;

        _validatePeriodBoundaries(
            _defaultRecoveryPeriod,
            _minRecoveryPeriod,
            _maxRecoveryPeriod
        );
        defaultRecoveryPeriod = _defaultRecoveryPeriod;
        minRecoveryPeriod = _minRecoveryPeriod;
        maxRecoveryPeriod = _maxRecoveryPeriod;
    }

    /**
     * @notice Sets the initial default/min/max lock period for all Barz contracts that use this as Security Manager
     *         This function can only be called by the owner of the SecurityManager
     *         Default value should be bigger than the min and smaller than the max
     * @param _defaultLockPeriod Default Lock Period for all Barz contracts
     * @param _minLockPeriod Minimum Lock Period for all Barz contracts
     * @param _maxLockPeriod Maximum Lock Period for all Barz contracts
     */
    function initializeLockPeriod(
        uint128 _defaultLockPeriod,
        uint128 _minLockPeriod,
        uint128 _maxLockPeriod
    ) external override onlyOwner initializer(_isLockPeriodInitialized) {
        _isLockPeriodInitialized = true;

        _validatePeriodBoundaries(
            _defaultLockPeriod,
            _minLockPeriod,
            _maxLockPeriod
        );
        defaultLockPeriod = _defaultLockPeriod;
        minLockPeriod = _minLockPeriod;
        maxLockPeriod = _maxLockPeriod;
    }

    /**
     * @notice Sets the initial default/min/max approval validation period for all Barz contracts that use this as Security Manager
     *         This function can only be called by the owner of the SecurityManager
     *         Default value should be bigger than the min and smaller than the max
     * @param _defaultApprovalValidationPeriod Default Approval Validation Period for all Barz contracts
     * @param _minApprovalValidationPeriod Minimum Approval Validation Period for all Barz contracts
     * @param _maxApprovalValidationPeriod Maximum Approval Validation Period for all Barz contracts
     */
    function initializeApprovalValidationPeriod(
        uint128 _defaultApprovalValidationPeriod,
        uint128 _minApprovalValidationPeriod,
        uint128 _maxApprovalValidationPeriod
    )
        external
        override
        onlyOwner
        initializer(_isApprovalValidationPeriodInitialized)
    {
        _isApprovalValidationPeriodInitialized = true;

        _validatePeriodBoundaries(
            _defaultApprovalValidationPeriod,
            _minApprovalValidationPeriod,
            _maxApprovalValidationPeriod
        );
        defaultApprovalValidationPeriod = _defaultApprovalValidationPeriod;
        minApprovalValidationPeriod = _minApprovalValidationPeriod;
        maxApprovalValidationPeriod = _maxApprovalValidationPeriod;
    }

    /**
     * @notice Sets the initial default/min/max migration period for all Barz contracts that use this as Security Manager
     *         This function can only be called by the owner of the SecurityManager
     *         Default value should be bigger than the min and smaller than the max
     * @param _defaultMigrationPeriod Default Migration Period for all Barz contracts
     * @param _minMigrationPeriod Minimum Migration Period for all Barz contracts
     * @param _maxMigrationPeriod Maximum Migration Period for all Barz contracts
     */
    function initializeMigrationPeriod(
        uint128 _defaultMigrationPeriod,
        uint128 _minMigrationPeriod,
        uint128 _maxMigrationPeriod
    ) external override onlyOwner initializer(_isMigrationPeriodInitialized) {
        _isMigrationPeriodInitialized = true;

        _validatePeriodBoundaries(
            _defaultMigrationPeriod,
            _minMigrationPeriod,
            _maxMigrationPeriod
        );
        defaultMigrationPeriod = _defaultMigrationPeriod;
        minMigrationPeriod = _minMigrationPeriod;
        maxMigrationPeriod = _maxMigrationPeriod;
    }

    /**
     * @notice Wallet owner sets the addition security period for the wallet. Only the owner of wallet can call this function.
     *         The addition security period should be within the boundry of min and max value set by the owner
     * @param _wallet Address of wallet
     * @param _additionSecurityPeriod Custom Addition Security Period for the wallet
     */
    function setAdditionSecurityPeriod(
        address _wallet,
        uint128 _additionSecurityPeriod
    ) external override onlyWallet(_wallet) {
        _validatePeriodBoundaries(
            _additionSecurityPeriod,
            minAdditionSecurityPeriod,
            maxAdditionSecurityPeriod
        );
        securityConfigs[_wallet]
            .additionSecurityPeriod = _additionSecurityPeriod;
    }

    /**
     * @notice Wallet owner sets the removal security period for the wallet. Only the owner of wallet can call this function.
     *         The removal security period should be within the boundry of min and max value set by the owner
     * @param _wallet Address of wallet
     * @param _removalSecurityPeriod Custom Removal Security Period for the wallet
     */
    function setRemovalSecurityPeriod(
        address _wallet,
        uint128 _removalSecurityPeriod
    ) external override onlyWallet(_wallet) {
        _validatePeriodBoundaries(
            _removalSecurityPeriod,
            minRemovalSecurityPeriod,
            maxRemovalSecurityPeriod
        );
        securityConfigs[_wallet].removalSecurityPeriod = _removalSecurityPeriod;
    }

    /**
     * @notice Wallet owner sets the security window for the wallet. Only the owner of wallet can call this function.
     *         The security window should be within the boundry of min and max value set by the owner
     * @param _wallet Address of wallet
     * @param _securityWindow Custom Security Window for the wallet
     */
    function setSecurityWindow(
        address _wallet,
        uint128 _securityWindow
    ) external override onlyWallet(_wallet) {
        _validatePeriodBoundaries(
            _securityWindow,
            minSecurityWindow,
            maxSecurityWindow
        );
        securityConfigs[_wallet].securityWindow = _securityWindow;
    }

    /**
     * @notice Wallet owner sets the recovery period for the wallet. Only the owner of wallet can call this function.
     *         The recovery period should be within the boundry of min and max value set by the owner
     * @param _wallet Address of wallet
     * @param _recoveryPeriod Custom recovery period for the wallet
     */
    function setRecoveryPeriod(
        address _wallet,
        uint128 _recoveryPeriod
    ) external override onlyWallet(_wallet) {
        _validatePeriodBoundaries(
            _recoveryPeriod,
            minRecoveryPeriod,
            maxRecoveryPeriod
        );
        securityConfigs[_wallet].recoveryPeriod = _recoveryPeriod;
    }

    /**
     * @notice Wallet owner sets the lock period for the wallet. Only the owner of wallet can call this function.
     *         The lock period should be within the boundry of min and max value set by the owner
     * @param _wallet Address of wallet
     * @param _lockPeriod Custom Lock period for the wallet
     */
    function setLockPeriod(
        address _wallet,
        uint128 _lockPeriod
    ) external override onlyWallet(_wallet) {
        _validatePeriodBoundaries(_lockPeriod, minLockPeriod, maxLockPeriod);
        securityConfigs[_wallet].lockPeriod = _lockPeriod;
    }

    /**
     * @notice Wallet owner sets the approval validation period for the wallet. Only the owner of wallet can call this function.
     *         The approval validation period should be within the boundry of min and max value set by the owner
     * @param _wallet Address of wallet
     * @param _approvalValidationPeriod Custom approval validation period for the wallet
     */
    function setApprovalValidationPeriod(
        address _wallet,
        uint128 _approvalValidationPeriod
    ) external override onlyWallet(_wallet) {
        _validatePeriodBoundaries(
            _approvalValidationPeriod,
            minApprovalValidationPeriod,
            maxApprovalValidationPeriod
        );
        securityConfigs[_wallet]
            .approvalValidationPeriod = _approvalValidationPeriod;
    }

    /**
     * @notice Wallet owner sets the migration period for the wallet. Only the owner of wallet can call this function.
     *         The migration period should be within the boundry of min and max value set by the owner
     * @param _wallet Address of wallet
     * @param _migrationPeriod Custom migration period for the wallet
     */

    function setMigrationPeriod(
        address _wallet,
        uint128 _migrationPeriod
    ) external override onlyWallet(_wallet) {
        _validatePeriodBoundaries(
            _migrationPeriod,
            minMigrationPeriod,
            maxMigrationPeriod
        );
        securityConfigs[_wallet].migrationPeriod = _migrationPeriod;
    }

    /**
     * @notice Returns the addition security period. Returns default value when custom addition security period is not set
     * @param _wallet Address of wallet
     * @return additionSecurityPeriod Addition Security Period of the given Barz account or wallet
     */
    function additionSecurityPeriodOf(
        address _wallet
    )
        public
        view
        override
        onlyWallet(_wallet)
        returns (uint128 additionSecurityPeriod)
    {
        additionSecurityPeriod = securityConfigs[_wallet]
            .additionSecurityPeriod;
        additionSecurityPeriod = (additionSecurityPeriod == 0)
            ? defaultAdditionSecurityPeriod
            : additionSecurityPeriod;
    }

    /**
     * @notice Returns the removal security period. Returns default value when custom removal security period is not set
     * @param _wallet Address of wallet
     * @return removalSecurityPeriod Removal Security Period of the given Barz account or wallet
     */
    function removalSecurityPeriodOf(
        address _wallet
    )
        public
        view
        override
        onlyWallet(_wallet)
        returns (uint128 removalSecurityPeriod)
    {
        removalSecurityPeriod = securityConfigs[_wallet].removalSecurityPeriod;
        removalSecurityPeriod = (removalSecurityPeriod == 0)
            ? defaultRemovalSecurityPeriod
            : removalSecurityPeriod;
    }

    /**
     * @notice Returns the security window. Returns default value when custom security window is not set
     * @param _wallet Address of wallet
     * @return securityWindow Security window of the given Barz account or wallet
     */
    function securityWindowOf(
        address _wallet
    )
        public
        view
        override
        onlyWallet(_wallet)
        returns (uint128 securityWindow)
    {
        securityWindow = securityConfigs[_wallet].securityWindow;
        securityWindow = (securityWindow == 0)
            ? defaultSecurityWindow
            : securityWindow;
    }

    /**
     * @notice Returns the recovery period. Returns default value when custom recovery period is not set
     * @param _wallet Address of wallet
     * @return recoveryPeriod Recovery Period of the given Barz account or wallet
     */
    function recoveryPeriodOf(
        address _wallet
    )
        public
        view
        override
        onlyWallet(_wallet)
        returns (uint128 recoveryPeriod)
    {
        recoveryPeriod = securityConfigs[_wallet].recoveryPeriod;
        recoveryPeriod = (recoveryPeriod == 0)
            ? defaultRecoveryPeriod
            : recoveryPeriod;
    }

    /**
     * @notice Returns the lock period. Returns default value when custom lock period is not set
     * @param _wallet Address of wallet
     * @return lockPeriod Lock Period of the given Barz account or wallet
     */
    function lockPeriodOf(
        address _wallet
    ) public view override onlyWallet(_wallet) returns (uint128 lockPeriod) {
        lockPeriod = securityConfigs[_wallet].lockPeriod;
        lockPeriod = (lockPeriod == 0) ? defaultLockPeriod : lockPeriod;
    }

    /**
     * @notice Returns the approval validation period. Returns default value when custom approval validation period is not set
     * @param _wallet Address of wallet
     * @return approvalValidationPeriod Approval Validation Period of the given Barz account or wallet
     */
    function approvalValidationPeriodOf(
        address _wallet
    )
        public
        view
        override
        onlyWallet(_wallet)
        returns (uint128 approvalValidationPeriod)
    {
        approvalValidationPeriod = securityConfigs[_wallet]
            .approvalValidationPeriod;
        approvalValidationPeriod = (approvalValidationPeriod == 0)
            ? defaultApprovalValidationPeriod
            : approvalValidationPeriod;
    }

    /**
     * @notice Returns the migration period. Returns default value when custom migration period is not set
     * @param _wallet Address of wallet
     * @return migrationPeriod Migration Period of the given Barz account or wallet
     */
    function migrationPeriodOf(
        address _wallet
    )
        public
        view
        override
        onlyWallet(_wallet)
        returns (uint128 migrationPeriod)
    {
        migrationPeriod = securityConfigs[_wallet].migrationPeriod;
        migrationPeriod = (migrationPeriod == 0)
            ? defaultMigrationPeriod
            : migrationPeriod;
    }

    /**
     * @notice Validates if the period is smaller than the max period or bigger than the min period
     * @param _period Period to be checked
     * @param _minPeriod Minimum period
     * @param _maxPeriod Maximum period
     */
    function _validatePeriodBoundaries(
        uint128 _period,
        uint128 _minPeriod,
        uint128 _maxPeriod
    ) internal pure {
        if (_period >= _maxPeriod || _period <= _minPeriod)
            revert SecurityManager__OutOfBoundary();
    }
}
