// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

/// @title Module Executor Interface
interface IModuleExecutor {
    /// @notice Execute a call from a module to another module, via an execution function installed on the account.
    /// @dev Modules are not allowed to call native functions on the account. Permissions must be granted to the
    /// calling module for the call to go through.
    /// @param data The calldata to send to the module.
    /// @return The return data from the call.
    function executeFromModule(
        bytes calldata data
    ) external payable returns (bytes memory);

    /// @notice Execute a call from a module to a non-module address.
    /// @dev If the target is a module, the call SHOULD revert. Permissions must be granted to the calling module
    /// for the call to go through.
    /// @param target The address to be called.
    /// @param value The value to send with the call.
    /// @param data The calldata to send to the target.
    /// @return The return data from the call.
    function executeFromModuleExternal(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable returns (bytes memory);
}
