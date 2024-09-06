// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {IModuleManager, FunctionReference} from ".././interfaces/IModuleManager.sol";
import {LibMSCAStorage, MSCAStorage, SelectorData, ModuleData, HookGroup, PermittedExternalCallData} from "../../../libraries/LibMSCAStorage.sol";
import {IModule, ManifestAssociatedFunction, ManifestAssociatedFunctionType, ManifestExecutionHook, ManifestExternalCallPermission, ManifestFunction, ModuleManifest} from ".././interfaces/IModule.sol";
import {LinkedListSet, LibLinkedListSet} from "../../../libraries/LibLinkedListSet.sol";
import {LibCountableLinkedListSet} from "../../../libraries/LibCountableLinkedListSet.sol";
import {LibFunctionReference} from "../../../libraries/LibFunctionReference.sol";
import {LibCast} from "../../../libraries/LibCast.sol";
import {SelectorChecker} from "./SelectorChecker.sol";

abstract contract ModuleManager is IModuleManager {
    using LibLinkedListSet for LinkedListSet;
    using LibCountableLinkedListSet for LinkedListSet;
    using LibFunctionReference for FunctionReference;
    // As per the EIP-165 spec, no interface should ever match 0xffffffff
    bytes4 internal constant _INVALID_INTERFACE_ID = 0xffffffff;

    // These flags are used in LinkedListSet values to optimize lookups.
    // It's important that they don't overlap with bit 1 and bit 2, which are reserved bits used to indicate
    // the sentinel value and the existence of a next value, respectively.
    uint16 internal constant _PRE_EXEC_HOOK_HAS_POST_FLAG = 0x0004; // bit 3

    error ArrayLengthMismatch();
    error DuplicateHookLimitExceeded(bytes4 selector, FunctionReference hook);
    error DuplicatePreRuntimeValidationHookLimitExceeded(
        bytes4 selector,
        FunctionReference hook
    );
    error DuplicatePreUserOpValidationHookLimitExceeded(
        bytes4 selector,
        FunctionReference hook
    );
    error Erc4337FunctionNotAllowed(bytes4 selector);
    error ExecutionFunctionAlreadySet(bytes4 selector);
    error InterfaceNotAllowed();
    error InvalidDependenciesProvided();
    error InvalidModuleManifest();
    error IModuleFunctionNotAllowed(bytes4 selector);
    error MissingModuleDependency(address dependency);
    error NativeFunctionNotAllowed(bytes4 selector);
    error NullFunctionReference();
    error ModuleAlreadyInstalled(address module);
    error ModuleDependencyViolation(address module);
    error ModuleInstallCallbackFailed(address module, bytes revertReason);
    error ModuleInterfaceNotSupported(address module);
    error ModuleNotInstalled(address module);
    error ModuleUninstallCallbackFailed(address module, bytes revertReason);
    error RuntimeValidationFunctionAlreadySet(
        bytes4 selector,
        FunctionReference validationFunction
    );
    error UserOpValidationFunctionAlreadySet(
        bytes4 selector,
        FunctionReference validationFunction
    );

    struct UninstallModuleArgs {
        address module;
        ModuleManifest manifest;
        bool forceUninstall;
        uint256 callbackGasLimit;
    }

    function _enforceNotNull(
        FunctionReference functionReference
    ) internal pure {
        if (functionReference.isEmpty()) revert NullFunctionReference();
    }

    function _resolveManifestFunction(
        ManifestFunction memory _manifestFunction,
        address _module,
        FunctionReference[] memory _dependencies,
        ManifestAssociatedFunctionType _allowedMagicValue
    ) internal pure returns (FunctionReference) {
        if (
            _manifestFunction.functionType ==
            ManifestAssociatedFunctionType.SELF
        ) {
            return
                LibFunctionReference.pack(
                    _module,
                    _manifestFunction.functionId
                );
        }

        if (
            _manifestFunction.functionType ==
            ManifestAssociatedFunctionType.DEPENDENCY
        ) {
            uint256 index = _manifestFunction.dependencyIndex;
            if (index < _dependencies.length) {
                return _dependencies[index];
            }
            revert InvalidModuleManifest();
        }

        if (
            _manifestFunction.functionType ==
            ManifestAssociatedFunctionType.RUNTIME_VALIDATION_ALWAYS_ALLOW
        ) {
            if (
                _allowedMagicValue ==
                ManifestAssociatedFunctionType.RUNTIME_VALIDATION_ALWAYS_ALLOW
            ) {
                return LibFunctionReference._RUNTIME_VALIDATION_ALWAYS_ALLOW;
            }
            revert InvalidModuleManifest();
        }

        if (
            _manifestFunction.functionType ==
            ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY
        ) {
            if (
                _allowedMagicValue ==
                ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY
            ) {
                return LibFunctionReference._PRE_HOOK_ALWAYS_DENY;
            }
            revert InvalidModuleManifest();
        }

        return LibFunctionReference._EMPTY_FUNCTION_REFERENCE;
    }

    function _setExecutionFunction(bytes4 _selector, address _module) internal {
        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];

        if (selectorData.module != address(0)) {
            revert ExecutionFunctionAlreadySet(_selector);
        }

        if (SelectorChecker.isNativeFunction(_selector)) {
            revert NativeFunctionNotAllowed(_selector);
        }

        if (SelectorChecker.isIModuleFunction(_selector)) {
            revert IModuleFunctionNotAllowed(_selector);
        }

        if (SelectorChecker.isErc4337Function(_selector)) {
            revert Erc4337FunctionNotAllowed(_selector);
        }

        selectorData.module = _module;
    }

    function _addUserOpValidationFunction(
        bytes4 _selector,
        FunctionReference _validationFunction
    ) internal {
        _enforceNotNull(_validationFunction);

        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];

        if (!selectorData.userOpValidation.isEmpty()) {
            revert UserOpValidationFunctionAlreadySet(
                _selector,
                _validationFunction
            );
        }

        selectorData.userOpValidation = _validationFunction;
    }

    function _addRuntimeValidationFunction(
        bytes4 _selector,
        FunctionReference _validationFunction
    ) internal {
        _enforceNotNull(_validationFunction);

        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];

        if (!selectorData.runtimeValidation.isEmpty()) {
            revert RuntimeValidationFunctionAlreadySet(
                _selector,
                _validationFunction
            );
        }

        selectorData.runtimeValidation = _validationFunction;
    }

    function _addPreUserOpValidationHook(
        bytes4 _selector,
        FunctionReference _preUserOpValidationHook
    ) internal {
        _enforceNotNull(_preUserOpValidationHook);

        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];
        if (
            !selectorData.preUserOpValidationHooks.tryIncrement(
                LibCast.toSetValue(_preUserOpValidationHook)
            )
        ) {
            revert DuplicatePreUserOpValidationHookLimitExceeded(
                _selector,
                _preUserOpValidationHook
            );
        }

        if (!selectorData.hasPreUserOpValidationHooks) {
            selectorData.hasPreUserOpValidationHooks = true;
        }
    }

    function _removePreUserOpValidationHook(
        bytes4 _selector,
        FunctionReference _preUserOpValidationHook
    ) internal {
        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];

        selectorData.preUserOpValidationHooks.tryDecrement(
            LibCast.toSetValue(_preUserOpValidationHook)
        );

        if (selectorData.preUserOpValidationHooks.isEmpty()) {
            selectorData.hasPreUserOpValidationHooks = false;
        }
    }

    function _addPreRuntimeValidationHook(
        bytes4 _selector,
        FunctionReference _preRuntimeValidationHook
    ) internal {
        _enforceNotNull(_preRuntimeValidationHook);

        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];
        if (
            !selectorData.preRuntimeValidationHooks.tryIncrement(
                LibCast.toSetValue(_preRuntimeValidationHook)
            )
        ) {
            revert DuplicatePreRuntimeValidationHookLimitExceeded(
                _selector,
                _preRuntimeValidationHook
            );
        }
        if (!selectorData.hasPreRuntimeValidationHooks) {
            selectorData.hasPreRuntimeValidationHooks = true;
        }
    }

    function _removePreRuntimeValidationHook(
        bytes4 _selector,
        FunctionReference _preRuntimeValidationHook
    ) internal {
        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];

        selectorData.preRuntimeValidationHooks.tryDecrement(
            LibCast.toSetValue(_preRuntimeValidationHook)
        );

        if (!selectorData.preRuntimeValidationHooks.isEmpty()) {
            selectorData.hasPreRuntimeValidationHooks = false;
        }
    }

    function _addExecHooks(
        bytes4 _selector,
        FunctionReference _preExecHook,
        FunctionReference _postExecHook
    ) internal {
        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];

        _addHooks(
            selectorData.executionHooks,
            _selector,
            _preExecHook,
            _postExecHook
        );

        if (!_preExecHook.isEmpty()) {
            selectorData.hasPreExecHooks = true;
        } else if (!_postExecHook.isEmpty()) {
            selectorData.hasPostOnlyExecHooks = true;
        }
    }

    function _removeExecHooks(
        bytes4 _selector,
        FunctionReference _preExecHook,
        FunctionReference _postExecHook
    ) internal {
        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];

        (
            bool shouldClearHasPreHooks,
            bool shouldClearHasPostOnlyHooks
        ) = _removeHooks(
                selectorData.executionHooks,
                _preExecHook,
                _postExecHook
            );

        if (shouldClearHasPreHooks) {
            selectorData.hasPreExecHooks = false;
        }

        if (shouldClearHasPostOnlyHooks) {
            selectorData.hasPostOnlyExecHooks = false;
        }
    }

    function _addHooks(
        HookGroup storage _hooks,
        bytes4 _selector,
        FunctionReference _preExecHook,
        FunctionReference _postExecHook
    ) internal {
        if (!_preExecHook.isEmpty()) {
            if (
                !_hooks.preHooks.tryIncrement(LibCast.toSetValue(_preExecHook))
            ) {
                revert DuplicateHookLimitExceeded(_selector, _preExecHook);
            }

            if (!_postExecHook.isEmpty()) {
                _hooks.preHooks.tryEnableFlags(
                    LibCast.toSetValue(_preExecHook),
                    _PRE_EXEC_HOOK_HAS_POST_FLAG
                );
                if (
                    !_hooks.associatedPostHooks[_preExecHook].tryIncrement(
                        LibCast.toSetValue(_postExecHook)
                    )
                ) {
                    revert DuplicateHookLimitExceeded(_selector, _postExecHook);
                }
            }
        } else {
            _enforceNotNull(_postExecHook);

            if (
                !_hooks.postOnlyHooks.tryIncrement(
                    LibCast.toSetValue(_postExecHook)
                )
            ) {
                revert DuplicateHookLimitExceeded(_selector, _postExecHook);
            }
        }
    }

    function _removeHooks(
        HookGroup storage _hooks,
        FunctionReference _preExecHook,
        FunctionReference _postExecHook
    )
        internal
        returns (bool shouldClearHasPreHooks, bool shouldClearHasPostOnlyHooks)
    {
        if (!_preExecHook.isEmpty()) {
            _hooks.preHooks.tryDecrement(LibCast.toSetValue(_preExecHook));

            if (_hooks.preHooks.isEmpty()) {
                shouldClearHasPreHooks = true;
            }

            if (!_postExecHook.isEmpty()) {
                _hooks.associatedPostHooks[_preExecHook].tryDecrement(
                    LibCast.toSetValue(_postExecHook)
                );

                if (_hooks.associatedPostHooks[_preExecHook].isEmpty()) {
                    _hooks.preHooks.tryDisableFlags(
                        LibCast.toSetValue(_preExecHook),
                        _PRE_EXEC_HOOK_HAS_POST_FLAG
                    );
                }
            }
        } else {
            _hooks.postOnlyHooks.tryDecrement(
                LibCast.toSetValue(_postExecHook)
            );

            if (_hooks.postOnlyHooks.isEmpty()) {
                shouldClearHasPostOnlyHooks = true;
            }
        }
    }

    function _installModule(
        address _module,
        bytes32 _manifestHash,
        bytes memory _moduleInstallData,
        FunctionReference[] memory _dependencies
    ) internal {
        MSCAStorage storage mscaStorage = LibMSCAStorage.mscaStorage();

        // 1. Check if module exists
        if (!mscaStorage.modules.tryAdd(LibCast.toSetValue(_module))) {
            revert ModuleAlreadyInstalled(_module);
        }

        if (
            !ERC165Checker.supportsInterface(_module, type(IModule).interfaceId)
        ) {
            revert ModuleInterfaceNotSupported(_module);
        }
        ModuleManifest memory manifest = IModule(_module).moduleManifest();
        if (_manifestHash != keccak256(abi.encode(manifest))) {
            revert InvalidModuleManifest();
        }

        uint256 length = _dependencies.length;
        if (length != manifest.dependencyInterfaceIds.length) {
            revert InvalidDependenciesProvided();
        }

        for (uint256 i; i < length; ) {
            (address dependencyAddr, ) = _dependencies[i].unpack();

            // Check if dependency is installed. Revert if it's not installed.
            if (
                mscaStorage.moduleData[dependencyAddr].manifestHash ==
                bytes32(0)
            ) {
                revert MissingModuleDependency(dependencyAddr);
            }

            // Check if the depdency address indeed supports the interfaceId stated as dependency
            if (
                !ERC165Checker.supportsInterface(
                    dependencyAddr,
                    manifest.dependencyInterfaceIds[i]
                )
            ) {
                revert InvalidDependenciesProvided();
            }

            unchecked {
                ++mscaStorage.moduleData[dependencyAddr].dependentCount;
                ++i;
            }
        }

        // Install execution functions in the manifest
        length = manifest.executionFunctions.length;
        for (uint256 i; i < length; ) {
            _setExecutionFunction(manifest.executionFunctions[i], _module);
            unchecked {
                ++i;
            }
        }
        // Set true for execution selectors this module can call
        length = manifest.permittedExecutionSelectors.length;
        for (uint256 i; i < length; ) {
            mscaStorage.callPermitted[
                LibMSCAStorage._getPermittedCallKey(
                    _module,
                    manifest.permittedExecutionSelectors[i]
                )
            ] = true;
            unchecked {
                ++i;
            }
        }

        if (manifest.permitAnyExternalAddress) {
            mscaStorage.moduleData[_module].anyExternalAddressPermitted = true;
        } else {
            length = manifest.permittedExternalCalls.length;
            for (uint256 i; i < length; ) {
                ManifestExternalCallPermission
                    memory externalCallPermission = manifest
                        .permittedExternalCalls[i];

                PermittedExternalCallData
                    storage permittedExternalCallData = mscaStorage
                        .permittedExternalCalls[IModule(_module)][
                            externalCallPermission.externalAddress
                        ];

                permittedExternalCallData.addressPermitted = true;

                if (externalCallPermission.permitAnySelector) {
                    permittedExternalCallData.anySelectorPermitted = true;
                } else {
                    uint256 externalContractSelectorsLength = externalCallPermission
                            .selectors
                            .length;
                    for (uint256 j; j < externalContractSelectorsLength; ) {
                        permittedExternalCallData.permittedSelectors[
                            externalCallPermission.selectors[j]
                        ] = true;
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

        // Add UserOp Validation Functions
        length = manifest.userOpValidationFunctions.length;
        for (uint256 i; i < length; ) {
            ManifestAssociatedFunction memory manifestFunctions = manifest
                .userOpValidationFunctions[i];
            _addUserOpValidationFunction(
                manifestFunctions.executionSelector,
                _resolveManifestFunction(
                    manifestFunctions.associatedFunction,
                    _module,
                    _dependencies,
                    ManifestAssociatedFunctionType.NONE
                )
            );
            unchecked {
                ++i;
            }
        }

        // Add Runtime Validation Functions
        length = manifest.runtimeValidationFunctions.length;
        for (uint256 i; i < length; ) {
            ManifestAssociatedFunction memory manifestFunctions = manifest
                .runtimeValidationFunctions[i];
            _addRuntimeValidationFunction(
                manifestFunctions.executionSelector,
                _resolveManifestFunction(
                    manifestFunctions.associatedFunction,
                    _module,
                    _dependencies,
                    ManifestAssociatedFunctionType
                        .RUNTIME_VALIDATION_ALWAYS_ALLOW
                )
            );
            unchecked {
                ++i;
            }
        }

        // Passed to _resolveManifestFunction
        FunctionReference[] memory noDependencies = new FunctionReference[](0);

        // Add pre user operation validation hooks - hooks cannot have dependencies
        length = manifest.preUserOpValidationHooks.length;
        for (uint256 i; i < length; ) {
            ManifestAssociatedFunction memory manifestHooks = manifest
                .preUserOpValidationHooks[i];
            _addPreUserOpValidationHook(
                manifestHooks.executionSelector,
                _resolveManifestFunction(
                    manifestHooks.associatedFunction,
                    _module,
                    noDependencies,
                    ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY
                )
            );
            unchecked {
                ++i;
            }
        }

        // Add pre runtime validation hooks
        length = manifest.preRuntimeValidationHooks.length;
        for (uint256 i; i < length; ) {
            ManifestAssociatedFunction memory manifestHooks = manifest
                .preRuntimeValidationHooks[i];
            _addPreRuntimeValidationHook(
                manifestHooks.executionSelector,
                _resolveManifestFunction(
                    manifestHooks.associatedFunction,
                    _module,
                    noDependencies,
                    ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY
                )
            );
            unchecked {
                ++i;
            }
        }

        // Add pre and post execution hooks
        length = manifest.executionHooks.length;
        for (uint256 i; i < length; ) {
            ManifestExecutionHook memory manifestHooks = manifest
                .executionHooks[i];
            _addExecHooks(
                manifestHooks.executionSelector,
                _resolveManifestFunction(
                    manifestHooks.preExecHook,
                    _module,
                    noDependencies,
                    ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY
                ),
                _resolveManifestFunction(
                    manifestHooks.postExecHook,
                    _module,
                    noDependencies,
                    ManifestAssociatedFunctionType.NONE
                )
            );
            unchecked {
                ++i;
            }
        }

        // Add new interface ids the module enabled for the account
        length = manifest.interfaceIds.length;
        for (uint256 i; i < length; ) {
            bytes4 interfaceId = manifest.interfaceIds[i];
            if (
                interfaceId == type(IModule).interfaceId ||
                interfaceId == _INVALID_INTERFACE_ID
            ) {
                revert InterfaceNotAllowed();
            }
            unchecked {
                ++mscaStorage.supportedInterfaces[interfaceId];
                ++i;
            }
        }

        // Add module metadata to the account
        mscaStorage.moduleData[_module].manifestHash = _manifestHash;
        mscaStorage.moduleData[_module].dependencies = _dependencies;

        if (manifest.canSpendNativeToken) {
            mscaStorage.moduleData[_module].canSpendNativeToken = true;
        }
        {
            try IModule(_module).onInstall(_moduleInstallData) {} catch (
                bytes memory revertReason
            ) {
                revert ModuleInstallCallbackFailed(_module, revertReason);
            }
        }

        emit ModuleInstalled(_module, _manifestHash, _dependencies);
    }

    function _uninstallModule(
        UninstallModuleArgs memory _uninstallArgs,
        bytes calldata _moduleUninstallData
    ) internal {
        MSCAStorage storage mscaStorage = LibMSCAStorage.mscaStorage();

        if (
            !mscaStorage.modules.tryRemove(
                LibCast.toSetValue(_uninstallArgs.module)
            )
        ) {
            revert ModuleNotInstalled(_uninstallArgs.module);
        }

        ModuleData memory moduleData = mscaStorage.moduleData[
            _uninstallArgs.module
        ];

        // Check manifest hash
        if (
            moduleData.manifestHash !=
            keccak256(abi.encode(_uninstallArgs.manifest))
        ) {
            revert InvalidModuleManifest();
        }

        if (moduleData.dependentCount != 0) {
            revert ModuleDependencyViolation(_uninstallArgs.module);
        }

        FunctionReference[] memory dependencies = moduleData.dependencies;
        uint256 length = dependencies.length;
        for (uint256 i; i < length; ) {
            FunctionReference depdency = dependencies[i];
            (address dependencyAddr, ) = depdency.unpack();

            // Decrement the dependent count for the dependency function
            --mscaStorage.moduleData[dependencyAddr].dependentCount;
            unchecked {
                ++i;
            }
        }

        delete mscaStorage.moduleData[_uninstallArgs.module];

        FunctionReference[] memory noDependencies = new FunctionReference[](0);

        // Remove pre and post execution function hooks
        length = _uninstallArgs.manifest.executionHooks.length;
        for (uint256 i; i < length; ) {
            ManifestExecutionHook memory manifestHook = _uninstallArgs
                .manifest
                .executionHooks[i];
            _removeExecHooks(
                manifestHook.executionSelector,
                _resolveManifestFunction(
                    manifestHook.preExecHook,
                    _uninstallArgs.module,
                    noDependencies,
                    ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY
                ),
                _resolveManifestFunction(
                    manifestHook.postExecHook,
                    _uninstallArgs.module,
                    noDependencies,
                    ManifestAssociatedFunctionType.NONE
                )
            );
            unchecked {
                ++i;
            }
        }

        // Remove pre runtime validation function hooks
        length = _uninstallArgs.manifest.preRuntimeValidationHooks.length;
        for (uint256 i; i < length; ) {
            ManifestAssociatedFunction memory manifestHook = _uninstallArgs
                .manifest
                .preRuntimeValidationHooks[i];

            _removePreRuntimeValidationHook(
                manifestHook.executionSelector,
                _resolveManifestFunction(
                    manifestHook.associatedFunction,
                    _uninstallArgs.module,
                    noDependencies,
                    ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY
                )
            );
            unchecked {
                ++i;
            }
        }

        // Remove pre user op validation function hooks
        length = _uninstallArgs.manifest.preUserOpValidationHooks.length;
        for (uint256 i; i < length; ) {
            ManifestAssociatedFunction memory manifestHook = _uninstallArgs
                .manifest
                .preUserOpValidationHooks[i];

            _removePreUserOpValidationHook(
                manifestHook.executionSelector,
                _resolveManifestFunction(
                    manifestHook.associatedFunction,
                    _uninstallArgs.module,
                    noDependencies,
                    ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY
                )
            );
            unchecked {
                ++i;
            }
        }

        // Remove runtime validation function hooks
        length = _uninstallArgs.manifest.runtimeValidationFunctions.length;
        for (uint256 i; i < length; ) {
            bytes4 executionSelector = _uninstallArgs
                .manifest
                .runtimeValidationFunctions[i]
                .executionSelector;
            mscaStorage
                .selectorData[executionSelector]
                .runtimeValidation = LibFunctionReference
                ._EMPTY_FUNCTION_REFERENCE;
            unchecked {
                ++i;
            }
        }

        // Remove UserOp validation function hooks
        length = _uninstallArgs.manifest.userOpValidationFunctions.length;
        for (uint256 i; i < length; ) {
            bytes4 executionSelector = _uninstallArgs
                .manifest
                .userOpValidationFunctions[i]
                .executionSelector;
            mscaStorage
                .selectorData[executionSelector]
                .userOpValidation = LibFunctionReference
                ._EMPTY_FUNCTION_REFERENCE;
        }

        // Remove permitted external call permissions, anyExternalAddressPermitted is cleared when moduleData being deleted
        if (!_uninstallArgs.manifest.permitAnyExternalAddress) {
            length = _uninstallArgs.manifest.permittedExternalCalls.length;
            for (uint256 i; i < length; ) {
                ManifestExternalCallPermission
                    memory externalCallPermission = _uninstallArgs
                        .manifest
                        .permittedExternalCalls[i];

                PermittedExternalCallData
                    storage permittedExternalCallData = mscaStorage
                        .permittedExternalCalls[IModule(_uninstallArgs.module)][
                            externalCallPermission.externalAddress
                        ];

                permittedExternalCallData.addressPermitted = false;

                // Only clear this flag if it was set in the constructor
                if (externalCallPermission.permitAnySelector) {
                    permittedExternalCallData.anySelectorPermitted = false;
                } else {
                    uint256 externalContractSelectorsLength = externalCallPermission
                            .selectors
                            .length;
                    for (uint256 j; j < externalContractSelectorsLength; ) {
                        permittedExternalCallData.permittedSelectors[
                            externalCallPermission.selectors[j]
                        ] = false;
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

        // Remove permitted account execution function call permission
        length = _uninstallArgs.manifest.permittedExecutionSelectors.length;
        for (uint256 i; i < length; ) {
            mscaStorage.callPermitted[
                LibMSCAStorage._getPermittedCallKey(
                    _uninstallArgs.module,
                    _uninstallArgs.manifest.permittedExecutionSelectors[i]
                )
            ] = false;
            unchecked {
                ++i;
            }
        }

        // Remove installed execution function
        length = _uninstallArgs.manifest.executionFunctions.length;
        for (uint256 i; i < length; ) {
            mscaStorage
                .selectorData[_uninstallArgs.manifest.executionFunctions[i]]
                .module = address(0);
            unchecked {
                ++i;
            }
        }

        // Decrease supported interface ids' counters
        length = _uninstallArgs.manifest.interfaceIds.length;
        for (uint256 i; i < length; ) {
            --mscaStorage.supportedInterfaces[
                _uninstallArgs.manifest.interfaceIds[i]
            ];
            unchecked {
                ++i;
            }
        }

        bool onUninstallSucceeded = true;
        try
            IModule(_uninstallArgs.module).onUninstall(_moduleUninstallData)
        {} catch (bytes memory revertReason) {
            if (!_uninstallArgs.forceUninstall) {
                revert ModuleUninstallCallbackFailed(
                    _uninstallArgs.module,
                    revertReason
                );
            }
            onUninstallSucceeded = false;
        }

        emit ModuleUninstalled(_uninstallArgs.module, onUninstallSucceeded);
    }
}
