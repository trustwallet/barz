// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {FunctionReference, IModuleManager} from "./IModuleManager.sol";
import {Call, IStandardExecutor} from "./IStandardExecutor.sol";
import {IAccountLoupe} from "./IAccountLoupe.sol";

interface IMSCAFacet {
    /// @dev Note that MSCAFacet also includes functions in IAccountLoupe.sol, IStandardExecutor.sol, IModuleExecutor.sol and ModuleManager

    event MSCAInitialized(address entryPoint);

    error InvalidFallbackData();
    /// @dev Struct to hold optional configuration data for uninstalling a module. This should be encoded and
    /// passed to the `config` parameter of `uninstallModule`.
    struct UninstallModuleConfig {
        // ABI-encoding of a `ModuleManifest` to specify the original manifest
        // used to install the module now being uninstalled, in cases where the
        // module manifest has changed. If empty, uses the default behavior of
        // calling the module to get its current manifest.
        bytes serializedManifest;
        // If true, will complete the uninstall even if the `onUninstall` callback reverts. Available as an escape
        // hatch if a module is blocking uninstall.
        bool forceUninstall;
        // Maximum amount of gas allowed for each uninstall callback function
        // (`onUninstall`), or zero to set no limit. Should
        // typically be used with `forceUninstall` to remove modules that are
        // preventing uninstallation by consuming all remaining gas.
        uint256 callbackGasLimit;
    }

    error AlwaysDenyRule();
    error ExecFromModuleNotPermitted(address module, bytes4 selector);
    error ExecFromModuleExternalNotPermitted(
        address module,
        address target,
        uint256 value,
        bytes data
    );
    error NativeTokenSpendingNotPermitted(address module);
    error PostExecHookReverted(
        address module,
        uint8 functionId,
        bytes revertReason
    );
    error PreExecHookReverted(
        address module,
        uint8 functionId,
        bytes revertReason
    );
    error PreRuntimeValidationHookFailed(
        address module,
        uint8 functionId,
        bytes revertReason
    );
    error RuntimeValidationFunctionMissing(bytes4 selector);
    error RuntimeValidationFunctionReverted(
        address module,
        uint8 functionId,
        bytes revertReason
    );
    error UnexpectedAggregator(
        address module,
        uint8 functionId,
        address aggregator
    );
    error UnrecognizedFunction(bytes4 selector);
    error UserOpNotFromEntryPoint();
    error UserOpValidationFunctionMissing(bytes4 selector);
    error ZeroLengthCallBuffer();
    error AlreadyInitialized();
    error InvalidFunctionLength();
    error InvalidCallRoute();

    function initializeMSCAModules(
        address[] calldata modules,
        bytes calldata moduleInitData
    ) external;

    function mscaFallback(
        bytes calldata fallbackData
    ) external payable returns (bytes memory);
}
