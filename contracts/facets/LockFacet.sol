// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {LibAppStorage, Lock} from "../libraries/LibAppStorage.sol";
import {LibGuardian} from "../libraries/LibGuardian.sol";
import {LibFacetStorage} from "../libraries/LibFacetStorage.sol";
import {Modifiers} from "./Modifiers.sol";
import {ISecurityManager} from "../infrastructure/interfaces/ISecurityManager.sol";
import {ILockFacet} from "./interfaces/ILockFacet.sol";

/**
 * @title Lock Facet
 * @dev Contract that enables full lock/unlock of Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract LockFacet is ILockFacet, Modifiers {
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
     * @notice Locks the account for the lock period. Lock period is defined in the security manager and it's customizable
     *         This function can only be called when account is unlocked by owner or guardians
     * @dev This method checks the caller and if the account is currently locked and locks the account after fetching the
     *      Lock period from the owner.
     */
    function lock() external override onlyGuardianOrOwner onlyWhenUnlocked {
        uint256 unlockTime = block.timestamp + getLockPeriod();
        unchecked {
            ++LibFacetStorage.lockStorage().nonce;
        }
        LibAppStorage.setLock(unlockTime, LockFacet.lock.selector);
        emit Locked(uint64(unlockTime));
    }

    /**
     * @notice Locks the account when the account is locked. This function can be called by anyone but must provide the approver address and signature.
     *         The approver should be one of the guardians or owner.
     * @dev This method takes the approver address and the signature. After validating the address and the signature, it unlocks the account immediately.
     *      Only one of the guardian or owner is required to lock and unlock the account.
     * @param _approver Address of approver approving the unlock of Barz account
     * @param _signature Signature of the approver that signed the msg hash for unlocking the account
     */
    function unlock(
        address _approver,
        bytes calldata _signature
    ) external override onlyWhenLocked {
        if (_approver != address(this) && !LibGuardian.isGuardian(_approver)) {
            revert LockFacet__InvalidApprover();
        }
        if (
            !SignatureChecker.isValidSignatureNow(
                _approver,
                getUnlockHash(),
                _signature
            )
        ) {
            revert LockFacet__InvalidSignature();
        }
        _unlock();
    }

    /**
     * @notice Unlocks the account and increments the lock nonce
     */
    function _unlock() private {
        if (s.locks[INNER_STRUCT].locker != LockFacet.lock.selector) {
            revert LockFacet__CannotUnlock();
        }
        unchecked {
            ++LibFacetStorage.lockStorage().nonce;
        }
        LibAppStorage.setLock(0, bytes4(0));
        emit Unlocked();
    }

    /**
     * @notice Returns the lock period of current Barz account. Lock period information is held by Security Manager
     * @return lockPeriod Uint value of lock period in seconds
     */
    function getLockPeriod() public view override returns (uint256 lockPeriod) {
        lockPeriod = securityManager.lockPeriodOf(address(this));
        if (lockPeriod == 0) {
            revert LockFacet__InvalidRecoveryPeriod();
        }
    }

    /**
     * @notice Returns if the account is locked or not
     * @dev This method fetches the current block timestamp and compares that with release time.
     *      After checking the timestamp and release time, it returns if the account is still locked or not.
     * @return isLocked_ Uint value of lock period in seconds
     */
    function isLocked() public view override returns (bool isLocked_) {
        isLocked_ = uint64(block.timestamp) < s.locks[INNER_STRUCT].release;
    }

    /**
     * @notice Calculates the unlock hash and returns the unlock hash safe from signature reply attack
     * @dev This method calculates the unlock hash with EIP-191 prefix, wallet address, chainID, and nonce
     *      It packs the result and packs them and hashes it.
     * @return unlockHash Bytes32 unlock hash
     */
    function getUnlockHash() public view override returns (bytes32 unlockHash) {
        unlockHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encode(
                        "Unlock",
                        address(this),
                        block.chainid,
                        lockNonce()
                    )
                )
            )
        );
    }

    /**
     * @notice Returns lock nonce of account. Reads nonce from lock storage within facet storage
     * @return lockNonce_ Uint128 value of lock nonce. This is incremented whenever the account is lock/unlocked
     */
    function lockNonce() public view override returns (uint128 lockNonce_) {
        lockNonce_ = LibFacetStorage.lockStorage().nonce;
    }

    /**
     * @notice Returns the overall information of current lock
     * @return pendingLock Struct value including all information of pending lock
     */
    function getPendingLock()
        public
        view
        override
        returns (Lock memory pendingLock)
    {
        pendingLock = s.locks[INNER_STRUCT];
    }
}
