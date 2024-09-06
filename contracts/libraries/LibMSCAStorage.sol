// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {IModule} from "../facets/msca/interfaces/IModule.sol";
import {FunctionReference} from "../facets/msca/interfaces/IModuleManager.sol";
import {LinkedListSet} from "./LibLinkedListSet.sol";

/// @notice Contains the storage layout for upgradeable modular accounts.
/// @dev `||` for variables in comments refers to the concat operator
/// @custom:storage-location erc7201:Alchemy.UpgradeableModularAccount.Storage_V1
struct MSCAStorage {
    // AccountStorageInitializable variables
    uint8 initialized;
    bool initializing;
    // Module metadata storage
    LinkedListSet modules;
    mapping(address => ModuleData) moduleData;
    // Execution functions and their associated functions
    mapping(bytes4 => SelectorData) selectorData;
    // bytes24 key = address(calling module) || bytes4(selector of execution function)
    mapping(bytes24 => bool) callPermitted;
    // keys = address(calling module), target address
    mapping(IModule => mapping(address => PermittedExternalCallData)) permittedExternalCalls;
    // For ERC165 introspection, each count indicates support from account or an installed module.
    // 0 indicates the account does not support the interface and all modules that support this interface have
    // been uninstalled.
    mapping(bytes4 => uint256) supportedInterfaces;
}

struct ModuleData {
    bool anyExternalAddressPermitted;
    // A boolean to indicate if the module can spend native tokens, if any of the execution function can spend
    // native tokens, a module is considered to be able to spend native tokens of the accounts
    bool canSpendNativeToken;
    bytes32 manifestHash;
    FunctionReference[] dependencies;
    // Tracks the number of times this module has been used as a dependency function
    uint256 dependentCount;
}

/// @dev Represents data associated with a module's permission to use `executeFromModuleExternal` to interact
/// with contracts and addresses external to the account and its modules.
struct PermittedExternalCallData {
    // Is this address on the permitted addresses list? If it is, we either have a
    // list of allowed selectors, or the flag that allows any selector.
    bool addressPermitted;
    bool anySelectorPermitted;
    mapping(bytes4 => bool) permittedSelectors;
}

struct HookGroup {
    // NOTE: this uses the flag _PRE_EXEC_HOOK_HAS_POST_FLAG to indicate whether
    // an element has an associated post-exec hook.
    LinkedListSet preHooks;
    // bytes21 key = pre exec hook function reference
    mapping(FunctionReference => LinkedListSet) associatedPostHooks;
    LinkedListSet postOnlyHooks;
}

/// @dev Represents data associated with a specifc function selector.
struct SelectorData {
    // The module that implements this execution function.
    // If this is a native function, the address must remain address(0).
    address module;
    // Cached flags indicating whether or not this function has pre-execution hooks and
    // post-only hooks. Flags for pre-validation hooks stored in the same storage word
    // as the validation function itself, to use a warm storage slot when loading.
    bool hasPreExecHooks;
    bool hasPostOnlyExecHooks;
    // The specified validation functions for this function selector.
    FunctionReference userOpValidation;
    bool hasPreUserOpValidationHooks;
    FunctionReference runtimeValidation;
    bool hasPreRuntimeValidationHooks;
    // The pre validation hooks for this function selector.
    LinkedListSet preUserOpValidationHooks;
    LinkedListSet preRuntimeValidationHooks;
    // The execution hooks for this function selector.
    HookGroup executionHooks;
}

library LibMSCAStorage {
    // TODO - change storage slot to TW's storage slot
    /// @dev the same storage slot will be used versions V1.x.y of upgradeable modular accounts. Follows ERC-7201.
    /// bytes = keccak256(
    ///     abi.encode(uint256(keccak256("Alchemy.UpgradeableModularAccount.Storage_V1")) - 1)
    /// ) & ~bytes32(uint256(0xff));
    /// This cannot be evaluated at compile time because of its use in inline assembly.
    bytes32 internal constant _V1_STORAGE_SLOT =
        0xade46bbfcf6f898a43d541e42556d456ca0bf9b326df8debc0f29d3f811a0300;

    function mscaStorage()
        internal
        pure
        returns (MSCAStorage storage storage_)
    {
        assembly ("memory-safe") {
            storage_.slot := _V1_STORAGE_SLOT
        }
    }

    function _getPermittedCallKey(
        address addr,
        bytes4 selector
    ) internal pure returns (bytes24) {
        return bytes24(bytes20(addr)) | (bytes24(selector) >> 160);
    }
}
