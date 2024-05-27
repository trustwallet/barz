// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {Lock} from "../../libraries/LibAppStorage.sol";

/**
 * @title Lock Facet Interface
 * @dev Interface of Lock contract that enables full lock/unlock of Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface ILockFacet {
    event Locked(uint64 releaseAfter);
    event Unlocked();

    error LockFacet__InvalidRecoveryPeriod();
    error LockFacet__CannotUnlock();
    error LockFacet__InvalidSignature();
    error LockFacet__InvalidApprover();

    function lock() external;

    function unlock(address approver, bytes calldata signature) external;

    function getLockPeriod() external view returns (uint256);

    function isLocked() external view returns (bool);

    function getUnlockHash() external view returns (bytes32);

    function lockNonce() external view returns (uint128);

    function getPendingLock() external view returns (Lock memory);
}
