// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {IModule} from "./IModule.sol";

/// @title Hook Management Interface
/// @notice Provides methods for pre-checks and post-checks of transactions to ensure conditions and state consistency.
/// @dev Defines two critical lifecycle hooks in the transaction process: `preCheck` and `postCheck`.
/// These methods facilitate validating conditions prior to execution and verifying state changes afterwards, respectively.
interface IHook is IModule {
    /// @notice Performs checks before a transaction is executed, potentially modifying the transaction context.
    /// @dev This method is called before the execution of a transaction to validate and possibly adjust execution context.
    /// @param msgSender The original sender of the transaction.
    /// @param msgValue The amount of wei sent with the call.
    /// @param msgData The calldata of the transaction.
    /// @return hookData Data that may be used or modified throughout the transaction lifecycle, passed to `postCheck`.
    function preCheck(
        address msgSender,
        uint256 msgValue,
        bytes calldata msgData
    ) external returns (bytes memory hookData);

    /// @notice Performs checks after a transaction is executed to ensure state consistency and log results.
    /// @dev This method is called after the execution of a transaction to verify and react to the execution outcome.
    /// @param hookData Data returned from `preCheck`, containing execution context or modifications.
    function postCheck(bytes calldata hookData) external;
}
