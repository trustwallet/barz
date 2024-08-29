// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IAccount} from "../../../aa-4337/interfaces/IAccount.sol";
import {IAggregator} from "../../../aa-4337/interfaces/IAggregator.sol";
import {IPaymaster} from "../../../aa-4337/interfaces/IPaymaster.sol";
import {IAccountLoupe} from ".././interfaces/IAccountLoupe.sol";
import {BaseAccount} from "../../../aa-4337/core/BaseAccount.sol";
import {IModuleManager} from ".././interfaces/IModuleManager.sol";
import {IModule} from ".././interfaces/IModule.sol";
import {IModuleExecutor} from ".././interfaces/IModuleExecutor.sol";
import {IStandardExecutor} from ".././interfaces/IStandardExecutor.sol";

/// @title Known Selectors
/// @author Alchemy
/// @notice Library to help to check if a selector is a know function selector of the modular account or ERC-4337
/// contract.
library SelectorChecker {
    function isNativeFunction(bytes4 selector) internal pure returns (bool) {
        return
            // check against IAccount methods
            selector == IAccount.validateUserOp.selector ||
            // check against BaseAccount methods
            selector == BaseAccount.entryPoint.selector ||
            selector == BaseAccount.getNonce.selector ||
            // check against IModuleManager methods
            selector == IModuleManager.installModule.selector ||
            selector == IModuleManager.uninstallModule.selector ||
            // check against IERC165 methods
            selector == IERC165.supportsInterface.selector ||
            // check against IStandardExecutor methods
            selector == IStandardExecutor.execute.selector ||
            selector == IStandardExecutor.executeBatch.selector ||
            // check against IModuleExecutor methods
            selector == IModuleExecutor.executeFromModule.selector ||
            selector == IModuleExecutor.executeFromModuleExternal.selector ||
            // check against IAccountLoupe methods
            selector == IAccountLoupe.getExecutionFunctionConfig.selector ||
            selector == IAccountLoupe.getExecutionHooks.selector ||
            selector == IAccountLoupe.getPreValidationHooks.selector ||
            selector == IAccountLoupe.getInstalledModules.selector;
    }

    function isErc4337Function(bytes4 selector) internal pure returns (bool) {
        return
            selector == IAggregator.validateSignatures.selector ||
            selector == IAggregator.validateUserOpSignature.selector ||
            selector == IAggregator.aggregateSignatures.selector ||
            selector == IPaymaster.validatePaymasterUserOp.selector ||
            selector == IPaymaster.postOp.selector;
    }

    function isIModuleFunction(bytes4 selector) internal pure returns (bool) {
        return
            selector == IModule.onInstall.selector ||
            selector == IModule.onUninstall.selector ||
            selector == IModule.preUserOpValidationHook.selector ||
            selector == IModule.userOpValidationFunction.selector ||
            selector == IModule.preRuntimeValidationHook.selector ||
            selector == IModule.runtimeValidationFunction.selector ||
            selector == IModule.preExecutionHook.selector ||
            selector == IModule.postExecutionHook.selector ||
            selector == IModule.moduleManifest.selector ||
            selector == IModule.moduleMetadata.selector;
    }
}
