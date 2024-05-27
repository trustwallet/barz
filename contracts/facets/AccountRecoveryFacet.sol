// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {LibAppStorage} from "../libraries/LibAppStorage.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {LibLoupe} from "../libraries/LibLoupe.sol";
import {LibGuardian} from "../libraries/LibGuardian.sol";
import {LibFacetStorage, RecoveryStorage, RecoveryConfig, RecoveryApprovalConfig, ApprovalConfig} from "../libraries/LibFacetStorage.sol";
import {Modifiers} from "./Modifiers.sol";
import {ISecurityManager} from "../infrastructure/interfaces/ISecurityManager.sol";
import {IVerificationFacet} from "./interfaces/IVerificationFacet.sol";
import {IAccountRecoveryFacet} from "./interfaces/IAccountRecoveryFacet.sol";

/**
 * @title Account Recovery Facet
 * @dev Contract that enables recovery of accounts when owner key is unavailable
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract AccountRecoveryFacet is IAccountRecoveryFacet, Modifiers {
    bytes constant UNINIT_CALL =
        abi.encodeWithSignature("uninitializeSigner()");
    ISecurityManager public immutable securityManager;

    /**
     * @notice This constructor sets the Security Manager address which is an immutable variable.
     *         Immutable variables do not impact the storage of diamond
     * @param _securityManager Security Manager contract that holds the security related variables for all wallets
     */
    constructor(address _securityManager) {
        securityManager = ISecurityManager(_securityManager);
    }

    /**
     * @notice Approve recovery of account as guardian
     * @dev This method can only be called by guardian and guardian inputs the public key of the new owner
     *      When the threshold(majority of guardians) passes, it automatically executes account recovery
     * @param _recoveryPublicKey Bytes of newly recovered public key of the owner
     */
    function approveAccountRecovery(
        bytes calldata _recoveryPublicKey
    ) external override onlyGuardian {
        if (_isRecoveryPending()) {
            revert AccountRecoveryFacet__RecoveryAlreadyOngoing();
        }
        RecoveryApprovalConfig storage rs = LibFacetStorage
            .recoveryStorage()
            .recoveryApprovalConfigs[INNER_STRUCT];
        validateNewOwner(_recoveryPublicKey);
        bytes32 recoveryPublicKeyHash = getApprovalRecoveryKeyHash(
            _recoveryPublicKey,
            "ExecuteRecovery"
        );
        uint64 approvalValidUntil = uint64(
            block.timestamp + _getApprovalValidationPeriod()
        );
        rs.isNewOwnerApproved[recoveryPublicKeyHash][
            msg.sender
        ] = ApprovalConfig(true, approvalValidUntil);
        emit RecoveryApproved(
            _recoveryPublicKey,
            msg.sender,
            approvalValidUntil
        );
        if (
            getRecoveryApprovalCountWithTimeValidity(recoveryPublicKeyHash) >=
            LibGuardian.majorityOfGuardians()
        ) {
            _executeRecovery(_recoveryPublicKey);
        }
    }

    /**
     * @notice Revoke recovery of account as guardian
     * @dev This method can only be called by guardian and guardian inputs the public key of the new owner
            When the threshold(majority of guardians) passes, it automatically revokes account recovery when recovery is pending
     * @param _recoveryPublicKey Bytes of newly recovered public key of the owner
     */
    function revokeAccountRecoveryApproval(
        bytes calldata _recoveryPublicKey
    ) external override onlyGuardian {
        RecoveryApprovalConfig storage rs = LibFacetStorage
            .recoveryStorage()
            .recoveryApprovalConfigs[INNER_STRUCT];
        validateNewOwner(_recoveryPublicKey);
        bytes32 recoveryPublicKeyHash = getApprovalRecoveryKeyHash(
            _recoveryPublicKey,
            "ExecuteRecovery"
        );
        if (
            !rs
            .isNewOwnerApproved[recoveryPublicKeyHash][msg.sender].isApproved ||
            !(block.timestamp <
                rs
                .isNewOwnerApproved[recoveryPublicKeyHash][msg.sender]
                    .validUntil)
        ) {
            revert AccountRecoveryFacet__NonExistentApproval();
        }

        rs.isNewOwnerApproved[recoveryPublicKeyHash][
            msg.sender
        ] = ApprovalConfig(false, 0);
        emit RecoveryApprovalRevoked(_recoveryPublicKey, msg.sender);
    }

    /**
     * @notice Executes recovery with signatures or on-chain pre-approvals
     * @dev This method validates the signatures of guardians or checks the on-chain pre-approved calls to check if the threshold passes
     *      When the threshold passes, account recovery is executed and revert otherwise
     * @param _recoveryPublicKey Bytes of newly recovered public key of the owner
     * @param _guardians Array of guardians address that are approving the recovery of Account
     * @param _signatures Array of signature bytes that signed the approval hash
     */
    function executeRecovery(
        bytes calldata _recoveryPublicKey,
        address[] calldata _guardians,
        bytes[] calldata _signatures
    ) external override {
        if (_isRecoveryPending()) {
            revert AccountRecoveryFacet__RecoveryAlreadyOngoing();
        }
        if (_guardians.length != _signatures.length) {
            revert AccountRecoveryFacet__InvalidArrayLength();
        }
        validateNewOwner(_recoveryPublicKey);

        bytes32 recoveryPublicKeyHash = getApprovalRecoveryKeyHash(
            _recoveryPublicKey,
            "ExecuteRecovery"
        );

        _checkApprover(_guardians);
        _checkDuplicateOnChainApprover(recoveryPublicKeyHash, _guardians);

        if (
            _guardians.length +
                getRecoveryApprovalCountWithTimeValidity(
                    recoveryPublicKeyHash
                ) <
            LibGuardian.majorityOfGuardians()
        ) {
            revert AccountRecoveryFacet__InsufficientGuardians();
        }
        for (uint256 i; i < _guardians.length; ) {
            if (!LibGuardian.isGuardian(_guardians[i])) {
                revert AccountRecoveryFacet__InvalidGuardian();
            }
            if (
                !SignatureChecker.isValidSignatureNow(
                    _guardians[i],
                    recoveryPublicKeyHash,
                    _signatures[i]
                )
            ) {
                revert AccountRecoveryFacet__InvalidGuardianSignature();
            }
            unchecked {
                ++i;
            }
        }
        _executeRecovery(_recoveryPublicKey);
    }

    /**
     * @notice Executes recovery of the account. Note that execution and finalization is a different process
     * @dev Executes the recovery and adds recovery data to recovery configuration. Locks the account
     * @param _recoveryPublicKey Public Key of the account for recovery
     */
    function _executeRecovery(bytes memory _recoveryPublicKey) internal {
        RecoveryStorage storage rs = LibFacetStorage.recoveryStorage();
        unchecked {
            ++rs.nonce;
        }
        uint64 executeAfter = uint64(block.timestamp + _getRecoveryPeriod());
        rs.recoveryConfigs[INNER_STRUCT] = RecoveryConfig(
            _recoveryPublicKey,
            executeAfter // NOTE: Remove guardian Count
        );
        LibAppStorage.setLock(
            block.timestamp + _getLockPeriod(),
            AccountRecoveryFacet.executeRecovery.selector
        );
        emit RecoveryExecuted(_recoveryPublicKey, executeAfter);
    }

    /**
     * @notice Finalize recovery after recovery pending period. Recovery pending period can be set by user beforehand in SecurityManager
     * @dev This method finalizes recovery and fully changes the ownership of the account to the newly inputted recovery public key
     */
    function finalizeRecovery() external override {
        RecoveryStorage storage rs = LibFacetStorage.recoveryStorage();

        if (!_isRecoveryPending()) {
            revert AccountRecoveryFacet__NonexistentRecovery();
        }
        if (
            uint64(block.timestamp) <=
            rs.recoveryConfigs[INNER_STRUCT].executeAfter
        ) {
            revert AccountRecoveryFacet__RecoveryPeriodNotOver();
        }
        bytes memory recoveryOwner = rs
            .recoveryConfigs[INNER_STRUCT]
            .recoveryPublicKey;

        delete rs.recoveryConfigs[INNER_STRUCT];

        LibAppStorage.setLock(0, bytes4(0));

        LibAppStorage.initiateSignerMigration();
        address verificationFacet = address(
            bytes20(
                LibDiamond.diamondStorage().facets[
                    s.validateOwnerSignatureSelector
                ]
            )
        );
        (bool uninitSuccess, bytes memory uninitResult) = verificationFacet
            .delegatecall(UNINIT_CALL);
        if (!uninitSuccess) {
            revert AccountRecoveryFacet__CallNotSuccesful();
        }
        if (uint256(bytes32(uninitResult)) != 1) {
            revert AccountRecoveryFacet__SignerUninitializationFailure();
        }
        bytes memory initCall = abi.encodeWithSignature(
            "initializeSigner(bytes)",
            recoveryOwner
        );
        (bool initSuccess, bytes memory initResult) = verificationFacet
            .delegatecall(initCall);
        if (!initSuccess) {
            revert AccountRecoveryFacet__CallNotSuccesful();
        }
        if (uint256(bytes32(initResult)) != 1) {
            revert AccountRecoveryFacet__SignerInitializationFailure();
        }
        LibAppStorage.finalizeSignerMigration();
        emit RecoveryFinalized(recoveryOwner);
    }

    /**
     * @notice Approves the cancellation of recovery
     * @dev This method approves the cancellation of recovery when recovery is still pending - waiting for finalization
     * @param _recoveryPublicKey Bytes of public key which is pending for recovery
     */
    function approveCancelRecovery(
        bytes calldata _recoveryPublicKey
    ) external override onlyGuardian {
        RecoveryApprovalConfig storage rs = LibFacetStorage
            .recoveryStorage()
            .recoveryApprovalConfigs[INNER_STRUCT];
        validateNewOwner(_recoveryPublicKey);
        bytes32 recoveryPublicKeyHash = getApprovalRecoveryKeyHash(
            _recoveryPublicKey,
            "CancelRecovery"
        );
        uint64 approvalValidUntil = uint64(
            block.timestamp + _getApprovalValidationPeriod()
        );
        rs.isNewOwnerApproved[recoveryPublicKeyHash][
            msg.sender
        ] = ApprovalConfig(true, approvalValidUntil);
        emit RecoveryCancellationApproved(_recoveryPublicKey, msg.sender);
        if (
            getRecoveryApprovalCountWithTimeValidity(recoveryPublicKeyHash) >=
            LibGuardian.majorityOfGuardians()
        ) {
            _cancelRecovery(_recoveryPublicKey);
        }
    }

    /**
     * @notice Hardstops an ongoing recovery
     * @dev This method provides a safety mechanism to protect owners of malicious guardians.
     *      Owners can hardstop recovery when an malicious guardians starts the recovery process.
     * @param _signature Signature of the owner that signs the hash to hardstop recovery
     */
    function hardstopRecovery(bytes calldata _signature) external override {
        if (!_isRecoveryPending())
            revert AccountRecoveryFacet__NonexistentRecovery();
        bytes32 recoveryPublicKeyHash = getApprovalRecoveryKeyHash(
            "0",
            "HardstopRecovery"
        );
        if (
            !SignatureChecker.isValidSignatureNow(
                address(this),
                recoveryPublicKeyHash,
                _signature
            )
        ) {
            revert AccountRecoveryFacet__InvalidOwnerSignature();
        }
        RecoveryStorage storage rs = LibFacetStorage.recoveryStorage();
        unchecked {
            ++rs.nonce;
        }
        delete rs.recoveryConfigs[INNER_STRUCT];
        LibAppStorage.setLock(0, bytes4(0));
        emit RecoveryHardstopped();
    }

    /**
     * @notice Cancels recovery with signatures or on-chain pre-approvals
     * @dev This method validates the signatures of guardians or checks the on-chain pre-approved calls to check if the threshold passes
     *      When the threshold passes, account recovery is canceled and revert otherwise
     * @param _recoveryPublicKey Bytes of newly recovered public key of the owner
     * @param _guardians Array of guardians address that are approving the recovery of Account
     * @param _signatures Array of signature bytes that signed the cancellation approval hash
     */
    function cancelRecovery(
        bytes calldata _recoveryPublicKey,
        address[] calldata _guardians,
        bytes[] calldata _signatures
    ) external override {
        if (_guardians.length != _signatures.length) {
            revert AccountRecoveryFacet__InvalidArrayLength();
        }
        validateNewOwner(_recoveryPublicKey);

        bytes32 recoveryPublicKeyHash = getApprovalRecoveryKeyHash(
            _recoveryPublicKey,
            "CancelRecovery"
        );

        _checkApprover(_guardians);
        _checkDuplicateOnChainApprover(recoveryPublicKeyHash, _guardians);

        if (
            _guardians.length +
                getRecoveryApprovalCountWithTimeValidity(
                    recoveryPublicKeyHash
                ) <
            LibGuardian.majorityOfGuardians()
        ) {
            revert AccountRecoveryFacet__InsufficientGuardians();
        }
        for (uint256 i; i < _guardians.length; ) {
            if (!LibGuardian.isGuardian(_guardians[i])) {
                revert AccountRecoveryFacet__CallerNotGuardian();
            }
            if (
                !SignatureChecker.isValidSignatureNow(
                    _guardians[i],
                    recoveryPublicKeyHash,
                    _signatures[i]
                )
            ) {
                revert AccountRecoveryFacet__InvalidGuardianSignature();
            }
            unchecked {
                ++i;
            }
        }
        _cancelRecovery(_recoveryPublicKey);
    }

    /**
     * @notice Cancel recovery when the recovery is pending. Unlock the account as well
     * @dev This method checks if the recovery is pending and reverts if not pending.
     *      It increases the recovery nonce and deletes the recovery information and gets a small portion of gas in return
     * @param _recoveryPublicKey Bytes of newly recovered public key of the owner
     */
    function _cancelRecovery(bytes memory _recoveryPublicKey) internal {
        if (!_isRecoveryPending()) {
            revert AccountRecoveryFacet__NonexistentRecovery();
        }
        LibAppStorage.setLock(0, bytes4(0));
        RecoveryStorage storage rs = LibFacetStorage.recoveryStorage();
        unchecked {
            ++rs.nonce;
        }
        delete rs.recoveryConfigs[INNER_STRUCT];
        emit RecoveryCanceled(_recoveryPublicKey);
    }

    /**
     * @notice Validates the format of public key to be used for recovery
     * @dev This method checks if the public key format is correct and reverts otherwise
     * @param _recoveryPublicKey Bytes of newly recovered public key of the owner
     */
    function validateNewOwner(
        bytes calldata _recoveryPublicKey
    ) public view override {
        if (
            !IVerificationFacet(
                LibLoupe.facetAddress(s.validateOwnerSignatureSelector)
            ).isValidKeyType(_recoveryPublicKey)
        ) {
            revert AccountRecoveryFacet__InvalidRecoveryPublicKey();
        }
    }

    /**
     * @notice Checks if recovery is currently pending
     * @return isPending Boolean indicating if recovery is pending
     */
    function _isRecoveryPending() internal view returns (bool isPending) {
        RecoveryStorage storage rs = LibFacetStorage.recoveryStorage();
        isPending = (rs.recoveryConfigs[INNER_STRUCT].executeAfter > 0);
    }

    /**
     * @notice Calculate the recovery hash dependent on chain, wallet address, nonce with EIP-191 prefix for safety
     * @dev Returns the keccak256 hash of EIP-191 msg hash packed with public key, salt, nonce, wallet address, etc
     * @param _recoveryPublicKey Bytes of newly recovered public key of the owner
     * @param _saltString Salt string to uniquely identify each recovery hash and for security
     * @return recoveryKeyHash Bytes32 string of the recovery hash
     */
    function getApprovalRecoveryKeyHash(
        bytes memory _recoveryPublicKey,
        string memory _saltString
    ) public view override returns (bytes32 recoveryKeyHash) {
        recoveryKeyHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encode(
                        _recoveryPublicKey,
                        _saltString,
                        address(this),
                        block.chainid,
                        LibFacetStorage.recoveryStorage().nonce
                    )
                )
            )
        );
    }

    /**
     * @notice Check the onchain approval of guardians and returns the number of guardians that approved
     * @dev Loop through the guardian addresses and returns the number of guardians that approved this recovery hash
     * @param _recoveryPublicKeyHash Bytes hash of newly recovered public key and recovery value of the account
     * @return approvalCount Number of guardians that approved
     */
    function getRecoveryApprovalCountWithTimeValidity(
        bytes32 _recoveryPublicKeyHash
    ) public view override returns (uint256 approvalCount) {
        address[] memory guardians = LibGuardian.getGuardians();
        uint256 guardianLength = guardians.length;
        for (uint256 i; i < guardianLength; ) {
            if (isRecoveryApproved(_recoveryPublicKeyHash, guardians[i])) {
                unchecked {
                    ++approvalCount;
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Checks if the recovery is approved by the given approver
     * @param _recoveryPublicKeyHash Hash of the public key and configuration for recovery
     * @param _approver Address of approver
     * @return isApproved Bool value if recovery hash is approved
     */
    function isRecoveryApproved(
        bytes32 _recoveryPublicKeyHash,
        address _approver
    ) public view override returns (bool isApproved) {
        RecoveryApprovalConfig storage rs = LibFacetStorage
            .recoveryStorage()
            .recoveryApprovalConfigs[INNER_STRUCT];
        if (
            rs
            .isNewOwnerApproved[_recoveryPublicKeyHash][_approver].isApproved &&
            block.timestamp <
            rs.isNewOwnerApproved[_recoveryPublicKeyHash][_approver].validUntil
        ) {
            isApproved = true;
        }
    }

    /**
     * @notice Checks if their is duplicate approver is included in off-chain approval verification and on-chain approval
     *         Approvers who approved on-chain should not be included in the off-chain approval
     * @param _recoveryPublicKeyHash Hash of recovery information
     * @param _approvers List of approver addresses
     */
    function _checkDuplicateOnChainApprover(
        bytes32 _recoveryPublicKeyHash,
        address[] memory _approvers
    ) public view {
        address[] memory guardians = LibGuardian.getGuardians();
        uint256 guardianLength = guardians.length;
        uint256 approversLength = _approvers.length;
        for (uint256 i; i < guardianLength; ) {
            if (isRecoveryApproved(_recoveryPublicKeyHash, guardians[i])) {
                for (uint256 j; j < approversLength; ) {
                    if (_approvers[j] == guardians[i]) {
                        revert AccountRecoveryFacet__DuplicateApproval();
                    }
                    unchecked {
                        ++j;
                    }
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Returns the lock period of this wallet address from security manager
     * @return lockPeriod value of lock period
     */
    function _getLockPeriod() internal view returns (uint256 lockPeriod) {
        lockPeriod = securityManager.lockPeriodOf(address(this));
        if (lockPeriod == 0) {
            revert AccountRecoveryFacet__InvalidLockPeriod();
        }
    }

    /**
     * @notice Returns the lock period of this wallet address from security manager
     * @return recoveryPeriod value of recovery period
     */
    function _getRecoveryPeriod()
        internal
        view
        returns (uint256 recoveryPeriod)
    {
        recoveryPeriod = securityManager.recoveryPeriodOf(address(this));
        if (recoveryPeriod == 0) {
            revert AccountRecoveryFacet__InvalidRecoveryPeriod();
        }
    }

    /**
     * @notice Returns the approval validation period of this wallet address from security manager
     * @return approvalValidationPeriod value of approval validation period
     */
    function _getApprovalValidationPeriod()
        internal
        view
        returns (uint256 approvalValidationPeriod)
    {
        approvalValidationPeriod = securityManager.approvalValidationPeriodOf(
            address(this)
        );
        if (approvalValidationPeriod == 0) {
            revert AccountRecoveryFacet__InvalidApprovalValidationPeriod();
        }
    }

    /**
     * @notice Returns the recovery nonce of this wallet address from security manager
     * @return nonce value of recovery nonce
     */
    function getRecoveryNonce() public view override returns (uint128 nonce) {
        nonce = LibFacetStorage.recoveryStorage().nonce;
    }

    /**
     * @notice Returns the recovery information of the pending recovery
     * @return recoveryConfig value struct of pending recovery
     */
    function getPendingRecovery()
        public
        view
        override
        returns (RecoveryConfig memory recoveryConfig)
    {
        recoveryConfig = LibFacetStorage.recoveryStorage().recoveryConfigs[
            INNER_STRUCT
        ];
    }
}
