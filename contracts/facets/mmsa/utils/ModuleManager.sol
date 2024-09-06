// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {LibSentinelList} from "../../../libraries/LibSentinelList.sol";
import {LibMMSAStorage, MMSAStorage, FallbackHandler} from "../../../libraries/LibMMSAStorage.sol";
import {CallType} from "./Types.sol";
import {IValidator} from "../interfaces/IValidator.sol";
import {IHook} from "../interfaces/IHook.sol";
import {IModule} from "../interfaces/IModule.sol";
import {VALIDATOR_MODULE_TYPE, EXECUTOR_MODULE_TYPE, FALLBACK_MODULE_TYPE, HOOK_MODULE_TYPE} from "./Constants.sol";

contract ModuleManager {
    using LibSentinelList for LibSentinelList.SentinelList;

    event UninstallCallFailed(address module, bytes data);

    error ModuleManager__AlreadyInitialized();
    error ModuleManager__ValidatorAlreadyInstalled();
    error ModuleManager__InvalidValidatorAddress();
    error ModuleManager__NonExistentValidator();
    error ModuleManager__InvalidExecutorAddress();
    error ModuleManager__FallbackHandlerAlreadyInstalled();
    error ModuleManager__InvalidSelector();
    error ModuleManager__HookAlreadyInstalled();
    error ModuleManager__InvalidHandler();

    function _initialize() internal virtual {
        if (LibMMSAStorage.mmsaStorage().isInitialized) {
            revert ModuleManager__AlreadyInitialized();
        }
        LibMMSAStorage.mmsaStorage().isInitialized = true;
        _initModuleManager();
    }

    function _initModuleManager() internal virtual {
        // account module storage
        MMSAStorage storage ams = LibMMSAStorage.mmsaStorage();
        ams.executors.init();
        ams.validators.init();
    }

    function _installValidator(
        address _validator,
        bytes calldata _data
    ) internal virtual {
        if (_validator.code.length == 0) {
            revert ModuleManager__InvalidValidatorAddress();
        }
        LibMMSAStorage.mmsaStorage().validators.push(_validator);

        IValidator(_validator).onInstall(_data);
    }

    function _uninstallValidator(
        address _validator,
        bytes calldata _data
    ) internal virtual {
        (address prev, bytes memory disableModuleData) = abi.decode(
            _data,
            (address, bytes)
        );
        LibMMSAStorage.mmsaStorage().validators.pop(prev, _validator);

        try IValidator(_validator).onUninstall(disableModuleData) {} catch {
            emit UninstallCallFailed(_validator, _data);
        }
    }

    function _installExecutor(
        address _executor,
        bytes calldata _data
    ) internal virtual {
        if (_executor.code.length == 0) {
            revert ModuleManager__InvalidExecutorAddress();
        }
        LibMMSAStorage.mmsaStorage().executors.push(_executor);

        IModule(_executor).onInstall(_data);
    }

    function _uninstallExecutor(
        address _executor,
        bytes calldata _data
    ) internal virtual {
        (address prev, bytes memory disableModuleData) = abi.decode(
            _data,
            (address, bytes)
        );
        LibMMSAStorage.mmsaStorage().executors.pop(prev, _executor);

        try IModule(_executor).onUninstall(disableModuleData) {} catch {
            emit UninstallCallFailed(_executor, _data);
        }
    }

    function _installHook(
        address _hook,
        bytes calldata _data
    ) internal virtual {
        // TODO Implement this function. Exploring Hook options
        if (address(LibMMSAStorage.mmsaStorage().hook) == address(0)) {
            revert ModuleManager__HookAlreadyInstalled();
        }
        LibMMSAStorage.mmsaStorage().hook = IHook(_hook);
        IHook(_hook).onInstall(_data);
    }

    function _uninstallHook(
        address _hook,
        bytes calldata _data
    ) internal virtual {
        // TODO Implement this function. Exploring Hook options
        LibMMSAStorage.mmsaStorage().hook = IHook(address(0));

        try IHook(_hook).onUninstall(_data) {} catch {
            emit UninstallCallFailed(_hook, _data);
        }
    }

    function _installFallbackHandler(
        address _handler,
        bytes calldata _params
    ) internal virtual {
        bytes4 selector = bytes4(_params[0:4]);

        CallType calltype = CallType.wrap(bytes1(_params[4]));

        // Revert if the selector is either `onInstall(bytes)` (0x6d61fe70) or `onUninstall(bytes)` (0x8a91b0e3).
        // These selectors are explicitly forbidden to prevent security vulnerabilities.
        // Allowing these selectors would enable unauthorized users to uninstall and reinstall critical modules.
        if (selector == bytes4(0x6d61fe70) || selector == bytes4(0x8a91b0e3)) {
            revert ModuleManager__InvalidSelector();
        }
        if (_handler == address(this)) {
            revert ModuleManager__InvalidHandler();
        }
        if (_isFallbackHandlerInstalled(selector)) {
            revert ModuleManager__FallbackHandlerAlreadyInstalled();
        }

        LibMMSAStorage.mmsaStorage().fallbacks[selector] = FallbackHandler(
            _handler,
            calltype
        );

        IModule(_handler).onInstall(_params[4:]);
    }

    function _uninstallFallbackHandler(
        address _fallbackHandler,
        bytes calldata _data
    ) internal virtual {
        LibMMSAStorage.mmsaStorage().fallbacks[
            bytes4(_data[0:4])
        ] = FallbackHandler(address(0), CallType.wrap(0x00));
        IModule(_fallbackHandler).onUninstall(_data[4:]);
    }

    function _isFallbackHandlerInstalled(
        bytes4 _selector
    ) internal view returns (bool) {
        return
            LibMMSAStorage.mmsaStorage().fallbacks[_selector].handler !=
            address(0);
    }

    function _isValidatorInstalled(
        address _validator
    ) internal view virtual returns (bool) {
        return LibMMSAStorage.mmsaStorage().validators.contains(_validator);
    }

    function _isExecutorInstalled(
        address _executor
    ) internal view virtual returns (bool) {
        return LibMMSAStorage.mmsaStorage().executors.contains(_executor);
    }

    function _isHookInstalled(address _hook) internal view returns (bool) {
        // TODO Implement this function. Exploring Hook options
        return address(LibMMSAStorage.mmsaStorage().hook) == _hook;
    }

    function _isModuleInstalled(
        uint256 _moduleTypeId,
        address _module,
        bytes calldata _additionalContext
    ) internal view returns (bool) {
        if (_moduleTypeId == VALIDATOR_MODULE_TYPE) {
            return _isValidatorInstalled(_module);
        } else if (_moduleTypeId == EXECUTOR_MODULE_TYPE) {
            return _isExecutorInstalled(_module);
        } else if (_moduleTypeId == FALLBACK_MODULE_TYPE) {
            return
                (_additionalContext.length < 4)
                    ? false
                    : (LibMMSAStorage
                        .mmsaStorage()
                        .fallbacks[bytes4(_additionalContext[0:4])]
                        .handler == _module);
        } else if (_moduleTypeId == HOOK_MODULE_TYPE) {
            return _isHookInstalled(_module);
        }
        return false;
    }
}
