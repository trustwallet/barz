// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

// Treats the first 20 bytes as an address, and the last byte as a function identifier.
type FunctionReference is bytes21;

/// @title Module Manager Interface
interface IModuleManager {
    event ModuleInstalled(
        address indexed module,
        bytes32 manifestHash,
        FunctionReference[] dependencies
    );
    event ModuleUninstalled(
        address indexed module,
        bool indexed onUninstallSucceeded
    );

    /// @notice Install a module to the modular account.
    /// @param module The module to install.
    /// @param manifestHash The hash of the module manifest.
    /// @param moduleInstallData Optional data to be decoded and used by the module to setup initial module data
    /// for the modular account.
    /// @param dependencies The dependencies of the module, as described in the manifest. Each FunctionReference
    /// MUST be composed of an installed module's address and a function ID of its validation function.
    function installModule(
        address module,
        bytes32 manifestHash,
        bytes calldata moduleInstallData,
        FunctionReference[] calldata dependencies
    ) external;

    /// @notice Uninstall a module from the modular account.
    /// @dev Uninstalling owner modules outside of a replace operation via executeBatch risks losing the account!
    /// @param module The module to uninstall.
    /// @param config An optional, implementation-specific field that accounts may use to ensure consistency
    /// guarantees.
    /// @param moduleUninstallData Optional data to be decoded and used by the module to clear module data for the
    /// modular account.
    function uninstallModule(
        address module,
        bytes calldata config,
        bytes calldata moduleUninstallData
    ) external;
}
