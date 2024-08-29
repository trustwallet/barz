// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {FunctionReference, IModuleManager} from "./interfaces/IModuleManager.sol";
import {Call, IStandardExecutor} from "./interfaces/IStandardExecutor.sol";
import {UserOperation} from "../../aa-4337/interfaces/UserOperation.sol";
import {IAccountLoupe} from "./interfaces/IAccountLoupe.sol";
import {IModuleExecutor} from "./interfaces/IModuleExecutor.sol";
import {ModuleManager} from "./utils/ModuleManager.sol";
import {BarzStorage} from "../../libraries/LibAppStorage.sol";
import {AccountExecutor} from "./utils/AccountExecutor.sol";
import {SelectorChecker} from "./utils/SelectorChecker.sol";
import {_coalescePreValidation, _coalesceValidation} from "./utils/ValidationDataHelpers.sol";
import {LibCast} from "../../libraries/LibCast.sol";
import {LibLinkedListSet, LinkedListSet} from "../../libraries/LibLinkedListSet.sol";
import {LibCountableLinkedListSet} from "../../libraries/LibCountableLinkedListSet.sol";
import {LibFunctionReference} from "../../libraries/LibFunctionReference.sol";
import {LibMSCAStorage, MSCAStorage, SelectorData, HookGroup, PermittedExternalCallData} from "../../libraries/LibMSCAStorage.sol";
import {IModule, ModuleManifest} from "./interfaces/IModule.sol";
import {IMSCAFacet} from "./interfaces/IMSCAFacet.sol";

// TODO: If an account is ERC-6900 compliant, it should check if the target being called is not a 6900 module.
contract MSCAFacet is
    IMSCAFacet,
    ModuleManager,
    BarzStorage,
    AccountExecutor,
    IAccountLoupe,
    IModuleExecutor,
    IStandardExecutor
{
    using LibLinkedListSet for LinkedListSet;
    using LibCountableLinkedListSet for LinkedListSet;
    using LibFunctionReference for FunctionReference;

    address public immutable self;

    /**
     * @notice This constructor ensures that this contract can only be used as singleton for Proxy contracts
     */
    constructor() {
        self = address(this);
    }

    modifier initializer() {
        MSCAStorage storage storage_ = LibMSCAStorage.mscaStorage();
        bool isTopLevelCall = !storage_.initializing;
        if (
            (isTopLevelCall && storage_.initialized < 1) ||
            (!Address.isContract(address(this)) && storage_.initialized == 1)
        ) {
            storage_.initialized = 1;
            if (isTopLevelCall) {
                storage_.initializing = true;
            }
            _;
            if (isTopLevelCall) {
                storage_.initializing = false;
            }
        } else {
            revert AlreadyInitialized();
        }
    }

    modifier onlyDelegateCall() {
        if (address(this) == self) {
            revert InvalidCallRoute();
        }
        _;
    }

    modifier onlyEntryPointOrSelf() {
        if (
            msg.sender != 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 ||
            msg.sender != address(this)
        ) {
            revert InvalidCallRoute();
        }
        _;
    }

    function initializeMSCAModules(
        address[] calldata _modules,
        bytes calldata _moduleInitData
    ) external initializer onlyDelegateCall onlyEntryPointOrSelf {
        (
            bytes32[] memory manifestHashes,
            bytes[] memory moduleInstallDatas
        ) = abi.decode(_moduleInitData, (bytes32[], bytes[]));

        uint256 length = _modules.length;

        if (
            length != manifestHashes.length ||
            length != moduleInstallDatas.length
        ) {
            revert ArrayLengthMismatch();
        }

        FunctionReference[] memory emptyDependencies = new FunctionReference[](
            0
        );
        for (uint256 i = 0; i < length; ++i) {
            _installModule(
                _modules[i],
                manifestHashes[i],
                moduleInstallDatas[i],
                emptyDependencies
            );
        }

        emit MSCAInitialized(address(s.entryPoint));
    }

    function installModule(
        address _module,
        bytes32 _manifestHash,
        bytes calldata _moduleInstallData,
        FunctionReference[] calldata _dependencies
    ) external override {
        (
            FunctionReference[][] memory postExecHooks,
            bytes[] memory postHookArgs
        ) = _preNativeFunction(this.installModule.selector);

        _installModule(
            _module,
            _manifestHash,
            _moduleInstallData,
            _dependencies
        );

        _postNativeFunction(postExecHooks, postHookArgs);
    }

    function uninstallModule(
        address _module,
        bytes calldata _config,
        bytes calldata _moduleUninstallData
    ) external {
        (
            FunctionReference[][] memory postExecHooks,
            bytes[] memory postHookArgs
        ) = _preNativeFunction(this.uninstallModule.selector);

        UninstallModuleArgs memory args;
        args.module = _module;
        bool hasSetManifest;

        if (_config.length > 0) {
            UninstallModuleConfig memory decodedConfig = abi.decode(
                _config,
                (UninstallModuleConfig)
            );
            if (decodedConfig.serializedManifest.length > 0) {
                args.manifest = abi.decode(
                    decodedConfig.serializedManifest,
                    (ModuleManifest)
                );
                hasSetManifest = true;
            }
            args.forceUninstall = decodedConfig.forceUninstall;
            args.callbackGasLimit = decodedConfig.callbackGasLimit;
        }
        if (!hasSetManifest) {
            args.manifest = IModule(_module).moduleManifest();
        }
        if (args.callbackGasLimit == 0) {
            args.callbackGasLimit = type(uint256).max;
        }

        _uninstallModule(args, _moduleUninstallData);

        _postNativeFunction(postExecHooks, postHookArgs);
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external virtual returns (uint256 validationData) {
        if (msg.sender != address(s.entryPoint)) {
            revert UserOpNotFromEntryPoint();
        }

        bytes4 selector = _selectorFromCallData(userOp.callData);

        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[selector];

        FunctionReference userOpValidationFunction = selectorData
            .userOpValidation;
        bool hasPreValidationHooks = selectorData.hasPreUserOpValidationHooks;

        validationData = _doUserOpValidation(
            selector,
            userOpValidationFunction,
            userOp,
            userOpHash,
            hasPreValidationHooks
        );

        if (missingAccountFunds != 0) {
            // entry point verifies if call succeeds so we don't need to do here
            (bool success, ) = payable(msg.sender).call{
                value: missingAccountFunds,
                gas: type(uint256).max
            }("");
            (success);
        }
    }

    // NOTE: Need to check AccountExecutor related parts within mscaFallback
    function mscaFallback(
        bytes calldata _fallbackData
    ) external payable override returns (bytes memory) {
        if (_fallbackData.length < 4) {
            revert InvalidFallbackData();
        }

        bytes4 selector = bytes4(_fallbackData[0:4]);
        bytes memory callBuffer = (msg.sender != address(s.entryPoint))
            ? _doRuntimeValidation(selector, _fallbackData)
            : _allocateRuntimeCallBuffer(_fallbackData);

        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[selector];
        address execModule = selectorData.module;
        if (execModule == address(0)) {
            revert UnrecognizedFunction(selector);
        }

        (
            FunctionReference[][] memory postHooksToRun,
            bytes[] memory postHookArgs
        ) = _doPreExecHooks(selectorData, callBuffer);

        bool execSuccess = _executeRaw(
            execModule,
            _convertRuntimeCallBufferToExecBuffer(callBuffer)
        );
        bytes memory returnData = _collectReturnData();

        if (!execSuccess) {
            // Bubble up revert reasons from modules
            assembly ("memory-safe") {
                revert(add(returnData, 32), mload(returnData))
            }
        }

        _doCachedPostHooks(postHooksToRun, postHookArgs);

        return returnData;
    }

    function executeFromModule(
        bytes calldata _data
    ) external payable override returns (bytes memory returnData) {
        bytes4 selector = _selectorFromCallData(_data);
        bytes24 permittedCallKey = LibMSCAStorage._getPermittedCallKey(
            msg.sender,
            selector
        );

        MSCAStorage storage mscaStorage = LibMSCAStorage.mscaStorage();

        if (!mscaStorage.callPermitted[permittedCallKey]) {
            revert ExecFromModuleNotPermitted(msg.sender, selector);
        }

        bytes memory callBuffer = _allocateRuntimeCallBuffer(_data);

        SelectorData storage selectorData = mscaStorage.selectorData[selector];
        // Load the module address from storage prior to running any hooks, to abide by the ERC-6900 phase rules.
        address execFunctionModule = selectorData.module;

        (
            FunctionReference[][] memory postHooksToRun,
            bytes[] memory postHookArgs
        ) = _doPreExecHooks(selectorData, callBuffer);

        if (execFunctionModule == address(0)) {
            revert UnrecognizedFunction(selector);
        }

        bool execSuccess = _executeRaw(
            execFunctionModule,
            _convertRuntimeCallBufferToExecBuffer(callBuffer)
        );
        returnData = _collectReturnData();

        if (!execSuccess) {
            assembly ("memory-safe") {
                revert(add(returnData, 32), mload(returnData))
            }
        }

        _doCachedPostHooks(postHooksToRun, postHookArgs);

        return returnData;
    }

    function executeFromModuleExternal(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) external payable returns (bytes memory) {
        MSCAStorage storage mscaStorage = LibMSCAStorage.mscaStorage();
        address callingModule = msg.sender;

        // Check if module is allowed to spend Native Token.
        if (
            _value > 0 &&
            _value > msg.value &&
            !mscaStorage.moduleData[callingModule].canSpendNativeToken
        ) {
            revert NativeTokenSpendingNotPermitted(callingModule);
        }

        // Target should not be the account itself.
        if (_target == address(this)) {
            revert ExecFromModuleExternalNotPermitted(
                callingModule,
                _target,
                _value,
                _data
            );
        }

        // Check the caller module's permission to make this call on the target address.
        //
        // 1. Check that the target is permitted at all, and if so check that any one of the following is true:
        //   a. Is any selector permitted?
        //   b. Is the calldata empty? (allow empty data calls by default if the target address is permitted)
        //   c. Is the selector in the call permitted?
        // 2. If the target is not permitted, instead check whether all external calls are permitted.
        //
        // `addressPermitted` can only be true if `anyExternalAddressPermitted` is false, so we can reduce our
        // worst-case `sloads` by 1 by not checking `anyExternalAddressPermitted` if `addressPermitted` is true.
        //
        // We allow calls where the data may be less than 4 bytes - it's up to the calling contract to
        // determine how to handle this.

        PermittedExternalCallData
            storage permittedExternalCallData = mscaStorage
                .permittedExternalCalls[IModule(callingModule)][_target];

        bool isTargetCallPermitted;
        if (permittedExternalCallData.addressPermitted) {
            isTargetCallPermitted = (permittedExternalCallData
                .anySelectorPermitted ||
                _data.length == 0 ||
                permittedExternalCallData.permittedSelectors[bytes4(_data)]);
        } else {
            isTargetCallPermitted = mscaStorage
                .moduleData[callingModule]
                .anyExternalAddressPermitted;
        }

        // If the target is not permitted, check if the caller module is permitted to make any external call
        if (!isTargetCallPermitted) {
            revert ExecFromModuleExternalNotPermitted(
                callingModule,
                _target,
                _value,
                _data
            );
        }

        // Run any pre exec hooks for the "executeFromModuleExternal" selector
        SelectorData storage selectorData = mscaStorage.selectorData[
            IModuleExecutor.executeFromModuleExternal.selector
        ];

        (
            FunctionReference[][] memory postHooksToRun,
            bytes[] memory postHookArgs
        ) = _doPreExecHooks(selectorData, "");

        bytes memory returnData = _exec(_target, _value, _data);

        _doCachedPostHooks(postHooksToRun, postHookArgs);

        return returnData;
    }

    function execute(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) external payable override returns (bytes memory result) {
        (
            FunctionReference[][] memory postExecHooks,
            bytes[] memory postHookArgs
        ) = _preNativeFunction(this.execute.selector);
        result = _exec(_target, _value, _data);
        _postNativeFunction(postExecHooks, postHookArgs);
    }

    function executeBatch(
        Call[] calldata _calls
    ) external payable override returns (bytes[] memory results) {
        (
            FunctionReference[][] memory postExecHooks,
            bytes[] memory postHookArgs
        ) = _preNativeFunction(this.executeBatch.selector);

        uint256 callsLength = _calls.length;
        results = new bytes[](callsLength);

        for (uint256 i = 0; i < callsLength; ) {
            results[i] = _exec(
                _calls[i].target,
                _calls[i].value,
                _calls[i].data
            );
            unchecked {
                ++i;
            }
        }

        _postNativeFunction(postExecHooks, postHookArgs);
    }

    // UTILS
    function _preNativeFunction(
        bytes4 _selector
    )
        internal
        returns (
            FunctionReference[][] memory postExecHooks,
            bytes[] memory postHookArgs
        )
    {
        bytes memory callBuffer = "";

        if (msg.sender != address(s.entryPoint)) {
            // TODO: Check msg.data usage as fallback is wrapped with mscaFallback(). Should take this into account.
            callBuffer = _doRuntimeValidation(_selector, msg.data);
        }

        (postExecHooks, postHookArgs) = _doPreExecHooks(
            LibMSCAStorage.mscaStorage().selectorData[_selector],
            callBuffer
        );
    }

    /// @dev To support gas estimation, we don't fail early when the failure is caused by a signature failure.
    function _doUserOpValidation(
        bytes4 _selector,
        FunctionReference _userOpValidationFunction,
        UserOperation calldata _userOp,
        bytes32 _userOpHash,
        bool _doPreValidationHooks
    ) internal returns (uint256 validationData) {
        if (_userOpValidationFunction.isEmpty()) {
            revert UserOpValidationFunctionMissing(_selector);
        }

        bytes memory callBuffer = _allocateUserOpCallBuffer(
            IModule.preUserOpValidationHook.selector,
            _userOp,
            _userOpHash
        );

        uint256 currentValidationData;
        uint256 preUserOpValidationHooksLength;

        if (_doPreValidationHooks) {
            // Do preUserOpValidation hooks
            FunctionReference[] memory preUserOpValidationHooks = LibCast
                .toFunctionReferenceArray(
                    LibMSCAStorage
                        .mscaStorage()
                        .selectorData[_selector]
                        .preUserOpValidationHooks
                        .getAll()
                );

            preUserOpValidationHooksLength = preUserOpValidationHooks.length;
            for (uint256 i = 0; i < preUserOpValidationHooksLength; ++i) {
                // FunctionReference preUserOpValidationHook = preUserOpValidationHooks[i];

                if (preUserOpValidationHooks[i].isEmptyOrMagicValue()) {
                    // Empty function reference is impossible here due to the element coming from a LinkedListSet.
                    // Runtime Validation Always Allow is not assignable here.
                    // Pre Hook Always Deny is the only assignable magic value here.
                    revert AlwaysDenyRule();
                }

                (address module, uint8 functionId) = preUserOpValidationHooks[i]
                    .unpack();

                _updateModuleCallBufferFunctionId(callBuffer, functionId);

                currentValidationData = _executeUserOpModuleFunction(
                    callBuffer,
                    module
                );

                if (uint160(currentValidationData) > 1) {
                    // If the aggregator is not 0 or 1, it is an unexpected value
                    revert UnexpectedAggregator(
                        module,
                        functionId,
                        address(uint160(currentValidationData))
                    );
                }
                validationData = _coalescePreValidation(
                    validationData,
                    currentValidationData
                );
            }
        }

        // Run the user op validation function
        {
            _updateModuleCallBufferSelector(
                callBuffer,
                IModule.userOpValidationFunction.selector
            );
            // No magic values are assignable here, and we already checked whether or not the function was empty,
            // so we're OK to use the function immediately
            (address module, uint8 functionId) = _userOpValidationFunction
                .unpack();

            _updateModuleCallBufferFunctionId(callBuffer, functionId);

            currentValidationData = _executeUserOpModuleFunction(
                callBuffer,
                module
            );

            if (preUserOpValidationHooksLength != 0) {
                // If we have other validation data we need to coalesce with
                validationData = _coalesceValidation(
                    validationData,
                    currentValidationData
                );
            } else {
                validationData = currentValidationData;
            }
        }
    }

    function _doRuntimeValidation(
        bytes4 _msgSig,
        bytes calldata _fallbackData
    ) internal returns (bytes memory callBuffer) {
        MSCAStorage storage mscaStorage = LibMSCAStorage.mscaStorage();
        FunctionReference runtimeValidationFunction = mscaStorage
            .selectorData[_msgSig]
            .runtimeValidation;
        bool doPreRuntimeValidationHooks = mscaStorage
            .selectorData[_msgSig]
            .hasPreRuntimeValidationHooks;

        // Allocate the call buffer for preRuntimeValidationHook
        // NOTE: Here, we need to make changes if msg.data is wrapped
        if (_fallbackData.length == 0) {
            revert ZeroLengthCallBuffer();
        }

        callBuffer = _allocateRuntimeCallBuffer(_fallbackData);

        if (doPreRuntimeValidationHooks) {
            _updateModuleCallBufferSelector(
                callBuffer,
                IModule.preRuntimeValidationHook.selector
            );

            // Run all preRuntimeValidation hooks
            FunctionReference[] memory preRuntimeValidationHooks = LibCast
                .toFunctionReferenceArray(
                    LibMSCAStorage
                        .mscaStorage()
                        .selectorData[_msgSig]
                        .preRuntimeValidationHooks
                        .getAll()
                );

            uint256 preRuntimeValidationHooksLength = preRuntimeValidationHooks
                .length;
            for (uint256 i = 0; i < preRuntimeValidationHooksLength; ) {
                FunctionReference preRuntimeValidationHook = preRuntimeValidationHooks[
                        i
                    ];

                if (preRuntimeValidationHook.isEmptyOrMagicValue()) {
                    revert AlwaysDenyRule();
                }

                (address module, uint8 functionId) = preRuntimeValidationHook
                    .unpack();

                _updateModuleCallBufferFunctionId(callBuffer, functionId);

                _executeRuntimeModuleFunction(
                    callBuffer,
                    module,
                    PreRuntimeValidationHookFailed.selector
                );

                unchecked {
                    ++i;
                }
            }
        }

        {
            if (runtimeValidationFunction.isEmptyOrMagicValue()) {
                if (
                    runtimeValidationFunction.isEmpty() &&
                    ((_msgSig != IModuleManager.installModule.selector) ||
                        msg.sender != address(this))
                ) {
                    revert RuntimeValidationFunctionMissing(_msgSig);
                }
            } else {
                _updateModuleCallBufferSelector(
                    callBuffer,
                    IModule.runtimeValidationFunction.selector
                );

                (address module, uint8 functionId) = runtimeValidationFunction
                    .unpack();

                _updateModuleCallBufferFunctionId(callBuffer, functionId);

                _executeRuntimeModuleFunction(
                    callBuffer,
                    module,
                    RuntimeValidationFunctionReverted.selector
                );
            }
        }
    }

    function _doPreExecHooks(
        SelectorData storage _selectorData,
        bytes memory _callBuffer
    )
        internal
        returns (
            FunctionReference[][] memory postHooksToRun,
            bytes[] memory postHookArgs
        )
    {
        FunctionReference[] memory preExecHooks;

        bool hasPreExecHooks = _selectorData.hasPreExecHooks;
        bool hasPostOnlyExecHooks = _selectorData.hasPostOnlyExecHooks;

        if (hasPreExecHooks) {
            preExecHooks = LibCast.toFunctionReferenceArray(
                _selectorData.executionHooks.preHooks.getAll()
            );
        }

        uint256 postHooksToRunLength = preExecHooks.length +
            (hasPostOnlyExecHooks ? 1 : 0);
        postHooksToRun = new FunctionReference[][](postHooksToRunLength);
        postHookArgs = new bytes[](postHooksToRunLength);

        _cacheAssociatedPostHooks(
            preExecHooks,
            _selectorData.executionHooks,
            postHooksToRun
        );

        if (hasPostOnlyExecHooks) {
            postHooksToRun[postHooksToRunLength - 1] = LibCast
                .toFunctionReferenceArray(
                    _selectorData.executionHooks.postOnlyHooks.getAll()
                );
        }

        _doPreHooks(preExecHooks, _callBuffer, postHooksToRun, postHookArgs);
    }

    function _doPreHooks(
        FunctionReference[] memory _preHooks,
        bytes memory _callBuffer,
        FunctionReference[][] memory _postHooks,
        bytes[] memory _hookReturnData
    ) internal {
        uint256 preExecHooksLength = _preHooks.length;

        if (preExecHooksLength == 0) {
            return;
        }

        if (_callBuffer.length == 0) {
            revert ZeroLengthCallBuffer();
        }

        _updateModuleCallBufferSelector(
            _callBuffer,
            IModule.preExecutionHook.selector
        );

        for (uint256 i = 0; i < preExecHooksLength; ) {
            FunctionReference preExecHook = _preHooks[i];

            if (preExecHook.isEmptyOrMagicValue()) {
                revert AlwaysDenyRule();
            }

            (address module, uint8 functionId) = preExecHook.unpack();

            _updateModuleCallBufferFunctionId(_callBuffer, functionId);

            _executeRuntimeModuleFunction(
                _callBuffer,
                module,
                PreExecHookReverted.selector
            );

            if (_postHooks[i].length > 0) {
                _hookReturnData[i] = abi.decode(_collectReturnData(), (bytes));
            }

            unchecked {
                ++i;
            }
        }
    }

    function _doCachedPostHooks(
        FunctionReference[][] memory _postHooks,
        bytes[] memory _postHookArgs
    ) internal {
        // Run post hooks in reverse order of their associated pre hooks
        uint256 postHookArrsLength = _postHooks.length;
        for (uint256 i = postHookArrsLength; i > 0; ) {
            uint256 index;
            unchecked {
                index = i - 1;
            }
            FunctionReference[] memory postHooksToRun = _postHooks[index];

            uint256 postHooksToRunLength = postHooksToRun.length;
            for (uint256 j = 0; j < postHooksToRunLength; ) {
                (address module, uint8 functionId) = postHooksToRun[j].unpack();

                try
                    IModule(module).postExecutionHook(
                        functionId,
                        _postHookArgs[index]
                    )
                {} catch (bytes memory revertReason) {
                    revert PostExecHookReverted(
                        module,
                        functionId,
                        revertReason
                    );
                }
                unchecked {
                    ++j;
                }
            }

            unchecked {
                --i;
            }
        }
    }

    function _postNativeFunction(
        FunctionReference[][] memory _postExecHooks,
        bytes[] memory _postHookArgs
    ) internal {
        _doCachedPostHooks(_postExecHooks, _postHookArgs);
    }

    function _selectorFromCallData(
        bytes calldata _data
    ) internal pure returns (bytes4) {
        // TODO: Recheck this function implementation
        if (_data.length < 4) {
            revert UnrecognizedFunction(bytes4(_data));
        }

        if (bytes4(_data) != this.mscaFallback.selector) {
            return bytes4(_data);
        } else {
            if (_data.length < 72) {
                revert InvalidFunctionLength();
            } else {
                // 4 bytes  : selector
                // 32 bytes : memory offset of the starting point - 0x20
                // 32 bytes : length of the data
                // hence we get the data from 68~72 which is the selector of the actual function
                return bytes4(_data[68:72]);
            }
        }
    }

    function _cacheAssociatedPostHooks(
        FunctionReference[] memory _preExecHooks,
        HookGroup storage _hookGroup,
        FunctionReference[][] memory _postHooks
    ) internal view {
        uint256 preExecHooksLength = _preExecHooks.length;
        for (uint256 i = 0; i < preExecHooksLength; ) {
            FunctionReference preExecHook = _preExecHooks[i];

            if (
                _hookGroup.preHooks.flagsEnabled(
                    LibCast.toSetValue(preExecHook),
                    _PRE_EXEC_HOOK_HAS_POST_FLAG
                )
            ) {
                _postHooks[i] = LibCast.toFunctionReferenceArray(
                    _hookGroup.associatedPostHooks[preExecHook].getAll()
                );
            }
            unchecked {
                ++i;
            }
        }
    }

    /////////////////////////
    // 6900 ACCOUNT LOUPE
    /////////////////////////
    function getExecutionFunctionConfig(
        bytes4 _selector
    ) external view override returns (ExecutionFunctionConfig memory config) {
        MSCAStorage storage mscaStorage = LibMSCAStorage.mscaStorage();

        if (SelectorChecker.isNativeFunction(_selector)) {
            config.module = address(this);
        } else {
            config.module = mscaStorage.selectorData[_selector].module;
        }

        config.userOpValidationFunction = mscaStorage
            .selectorData[_selector]
            .userOpValidation;
        config.runtimeValidationFunction = mscaStorage
            .selectorData[_selector]
            .runtimeValidation;
    }

    function getExecutionHooks(
        bytes4 _selector
    ) external view override returns (ExecutionHooks[] memory execHooks) {
        execHooks = _getHooks(
            LibMSCAStorage.mscaStorage().selectorData[_selector].executionHooks
        );
    }

    function getPreValidationHooks(
        bytes4 _selector
    )
        external
        view
        override
        returns (
            FunctionReference[] memory preUserOpValidationHooks,
            FunctionReference[] memory preRuntimeValidationHooks
        )
    {
        SelectorData storage selectorData = LibMSCAStorage
            .mscaStorage()
            .selectorData[_selector];
        preUserOpValidationHooks = LibCast.toFunctionReferenceArray(
            selectorData.preUserOpValidationHooks.getAll()
        );
        preRuntimeValidationHooks = LibCast.toFunctionReferenceArray(
            selectorData.preRuntimeValidationHooks.getAll()
        );
    }

    function getInstalledModules()
        external
        view
        override
        returns (address[] memory moduleAddress)
    {
        moduleAddress = LibCast.toAddressArray(
            LibMSCAStorage.mscaStorage().modules.getAll()
        );
    }

    function _getHooks(
        HookGroup storage _storedHooks
    ) internal view returns (ExecutionHooks[] memory execHooks) {
        FunctionReference[] memory preExecHooks = LibCast
            .toFunctionReferenceArray(_storedHooks.preHooks.getAll());
        FunctionReference[] memory postOnlyExecHooks = LibCast
            .toFunctionReferenceArray(_storedHooks.postOnlyHooks.getAll());

        uint256 preExecHooksLength = preExecHooks.length;
        uint256 postOnlyExecHooksLength = postOnlyExecHooks.length;
        uint256 maxExecHooksLength = postOnlyExecHooksLength;

        // There can only be as many associated post hooks to run as there are pre hooks
        for (uint256 i = 0; i < preExecHooksLength; ) {
            unchecked {
                maxExecHooksLength += _storedHooks.preHooks.getCount(
                    LibCast.toSetValue(preExecHooks[i])
                );
                ++i;
            }
        }

        // Overallocate on length - not all of this may get filled up. We set the correct length later.
        execHooks = new ExecutionHooks[](maxExecHooksLength);
        uint256 actualExecHooksLength = 0;

        for (uint256 i = 0; i < preExecHooksLength; ) {
            FunctionReference[] memory associatedPostExecHooks = LibCast
                .toFunctionReferenceArray(
                    _storedHooks.associatedPostHooks[preExecHooks[i]].getAll()
                );
            uint256 associatedPostExecHooksLength = associatedPostExecHooks
                .length;

            if (associatedPostExecHooksLength > 0) {
                for (uint256 j = 0; j < associatedPostExecHooksLength; ) {
                    execHooks[actualExecHooksLength].preExecHook = preExecHooks[
                        i
                    ];
                    execHooks[actualExecHooksLength]
                        .postExecHook = associatedPostExecHooks[j];

                    unchecked {
                        ++actualExecHooksLength;
                        ++j;
                    }
                }
            } else {
                execHooks[actualExecHooksLength].preExecHook = preExecHooks[i];

                unchecked {
                    ++actualExecHooksLength;
                }
            }

            unchecked {
                ++i;
            }
        }

        for (uint256 i = 0; i < postOnlyExecHooksLength; ) {
            execHooks[actualExecHooksLength].postExecHook = postOnlyExecHooks[
                i
            ];

            unchecked {
                ++actualExecHooksLength;
            }
        }

        assembly ("memory-safe") {
            mstore(execHooks, actualExecHooksLength)
        }
    }
    //////////////////////////
    // END OF ACCOUNT LOUPE
    //////////////////////////
}
