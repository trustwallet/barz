// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {UserOperation} from "../../aa-4337/interfaces/UserOperation.sol";
import {IAccount} from "../../aa-4337/interfaces/IAccount.sol";
import {LibMMSAStorage, FallbackHandler} from "../../libraries/LibMMSAStorage.sol";
import {LibSentinelList} from "../../libraries/LibSentinelList.sol";
import {LibMode} from "../../libraries/LibMode.sol";
import {LibVerification} from "../../libraries/LibVerification.sol";
import {BarzStorage} from "../../libraries/LibAppStorage.sol";
import {Executor} from "./utils/Executor.sol";
import {ExecMode, CallType, ExecType, Execution, ValidationMode, ValidationId, ValidationType} from "./utils/Types.sol";
import {VALIDATOR_MODULE_TYPE, EXECUTOR_MODULE_TYPE, FALLBACK_MODULE_TYPE, HOOK_MODULE_TYPE, CALLTYPE_SINGLE, CALLTYPE_STATIC, CALLTYPE_BATCH, EXECTYPE_DEFAULT, EXECTYPE_TRY} from "./utils/Constants.sol";
import {ModuleManager} from "./utils/ModuleManager.sol";
import {ValidationManager} from "./utils/ValidationManager.sol";
import {IValidator} from "./interfaces/IValidator.sol";
import {IModule} from "./interfaces/IModule.sol";
import {IHook} from "./interfaces/IHook.sol";
import {IMMSAFacet} from "./interfaces/IMMSAFacet.sol";
import {RegistryAdapter, IERC7484} from "./utils/RegistryAdapter.sol";

/**
 * @title MMSA(Minimal Modular Smart Account) Facet
 * @dev Facet enabling Barz to be ERC-7579 compatible account
 * @author David Yongjun Kim (@PowerStream3604)
 */
contract MMSAFacet is
    IMMSAFacet,
    IAccount,
    ModuleManager,
    ValidationManager,
    Executor,
    RegistryAdapter,
    BarzStorage
{
    using LibSentinelList for LibSentinelList.SentinelList;
    using LibMode for ExecMode;

    uint256 private constant VALIDATION_FAILED = 1;
    address private constant ENTRYPOINT =
        0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789; // v0.6 EntryPoint contract

    // keccak256("Barz7579Message(bytes message)")
    bytes32 private constant MMSA_MSG_TYPEHASH =
        0x1efeaafa8dd3a6b211b37d11cde4213d4845ad021eed8dda5ba6003c5c9aa534;

    modifier onlyEntryPointOrSelf() {
        if (msg.sender != ENTRYPOINT && msg.sender != address(this)) {
            revert MMSAFacet__NotfromEntryPointOrSelf();
        }
        _;
    }

    modifier withHook() {
        address hook = address(LibMMSAStorage.mmsaStorage().hook);
        if (hook == address(0)) {
            _;
        } else {
            bytes memory hookData = IHook(hook).preCheck(
                msg.sender,
                msg.value,
                msg.data
            );
            _;
            IHook(hook).postCheck(hookData);
        }
    }

    function initMMSA(
        address registry,
        address[] calldata attesters,
        uint8 threshold
    ) external onlyEntryPointOrSelf {
        _initialize();
        _configureRegistry({
            registry: IERC7484(registry),
            attesters: attesters,
            threshold: threshold
        });
    }

    function validateUserOp(
        UserOperation calldata _userOp,
        bytes32 _userOpHash,
        uint256 /* missingAccountFunds */
    ) external override returns (uint256 validationData) {
        if (msg.sender != ENTRYPOINT) {
            revert MMSAFacet__NotFromEntryPoint();
        }

        (, ValidationId validationId) = decodeNonce(_userOp.nonce);
        validationData = _validate(validationId, _userOp, _userOpHash);
    }

    // UserOp.nonce is 32bytes in total
    // |      1byte      |       20 bytes        | 1 byte |      2 bytes      |   8 bytes   |
    // | Validation Type |    Validator Address  | unused |  validator system |   nonceKey  | -> If Validation Type is Validator
    // |             Validation ID               |

    // |      1byte      |  4 bytes   | 16 bytes | 1 byte |      2 bytes      |   8 bytes   |
    // | Validation Type |PermissionId|  unused  | unused |  validator system |   nonceKey  | -> If Validation Type is Permission
    // |             Validation ID               |
    function decodeNonce(
        uint256 _nonce
    )
        internal
        pure
        returns (ValidationType validationType, ValidationId validation)
    {
        assembly {
            validationType := _nonce
            validation := _nonce
        }
    }

    function execute(
        ExecMode _mode,
        bytes calldata _executionCalldata
    ) external payable override onlyEntryPointOrSelf onlyWhenUnlocked withHook {
        _decodeAndExecute(_mode, _executionCalldata);
    }

    function executeFromExecutor(
        ExecMode _mode,
        bytes calldata _executionCalldata
    )
        external
        payable
        override
        onlyWhenUnlocked
        withHook
        withRegistry(msg.sender, EXECUTOR_MODULE_TYPE)
        returns (bytes[] memory returnData)
    {
        if (!_isExecutorInstalled(msg.sender)) {
            revert MMSAFacet__InvalidExecutor();
        }
        returnData = _decodeAndExecute(_mode, _executionCalldata);
    }

    function accountId() external pure override returns (string memory) {
        return "trustwallet.barz.v0.2.0";
    }

    function supportsExecutionMode(
        ExecMode _mode
    ) external pure override returns (bool isSupported) {
        (CallType callType, ExecType execType) = _mode.decodeBasic();

        isSupported =
            (callType == CALLTYPE_SINGLE || callType == CALLTYPE_BATCH) &&
            (execType == EXECTYPE_DEFAULT || execType == EXECTYPE_TRY);
    }

    function supportsModule(
        uint256 _moduleTypeId
    ) external pure override returns (bool isSupported) {
        isSupported = (_moduleTypeId < 5) ? true : false;
    }

    function getModulesPaginated(
        uint256 _moduleTypeId,
        address _start,
        uint256 _pageSize
    )
        external
        view
        override
        returns (address[] memory moduleList, address next)
    {
        if (_moduleTypeId == EXECUTOR_MODULE_TYPE) {
            (moduleList, next) = LibMMSAStorage
                .mmsaStorage()
                .executors
                .getEntriesPaginated(_start, _pageSize);
        } else if (_moduleTypeId == VALIDATOR_MODULE_TYPE) {
            (moduleList, next) = LibMMSAStorage
                .mmsaStorage()
                .validators
                .getEntriesPaginated(_start, _pageSize);
        } else {
            revert MMSAFacet__InvalidModuleType();
        }
    }

    function installModule(
        uint256 _moduleTypeId,
        address _module,
        bytes calldata _initData
    )
        external
        payable
        override
        onlyEntryPointOrSelf
        onlyWhenUnlocked
        withHook
        withRegistry(_module, _moduleTypeId)
    {
        if (!IModule(_module).isModuleType(_moduleTypeId)) {
            revert MMSAFacet__InvalidModule(_moduleTypeId, _module);
        }

        if (isModuleInstalled(_moduleTypeId, _module, _initData)) {
            revert MMSAFacet__ModuleAlreadyInstalled();
        }

        if (_moduleTypeId > 4 || _moduleTypeId == 0) {
            revert MMSAFacet__InvalidModuleType();
        }

        if (_moduleTypeId == VALIDATOR_MODULE_TYPE) {
            _installValidator(_module, _initData);
        } else if (_moduleTypeId == EXECUTOR_MODULE_TYPE) {
            _installExecutor(_module, _initData);
        } else if (_moduleTypeId == FALLBACK_MODULE_TYPE) {
            _installFallbackHandler(_module, _initData);
        } else if (_moduleTypeId == HOOK_MODULE_TYPE) {
            _installHook(_module, _initData);
        } else {
            revert MMSAFacet__InvalidModuleType();
        }

        emit ModuleInstalled(_moduleTypeId, _module);
    }

    function uninstallModule(
        uint256 _moduleTypeId,
        address _module,
        bytes calldata _uninitData
    ) external override onlyEntryPointOrSelf onlyWhenUnlocked {
        if (!IModule(_module).isModuleType(_moduleTypeId)) {
            revert MMSAFacet__InvalidModule(_moduleTypeId, _module);
        }

        if (!isModuleInstalled(_moduleTypeId, _module, _uninitData)) {
            revert MMSAFacet__ModuleNotInstalled(_moduleTypeId, _module);
        }

        if (_moduleTypeId > 4 || _moduleTypeId == 0) {
            revert MMSAFacet__InvalidModuleType();
        }

        if (_moduleTypeId == VALIDATOR_MODULE_TYPE) {
            _uninstallValidator(_module, _uninitData);
        } else if (_moduleTypeId == EXECUTOR_MODULE_TYPE) {
            _uninstallExecutor(_module, _uninitData);
        } else if (_moduleTypeId == FALLBACK_MODULE_TYPE) {
            _uninstallFallbackHandler(_module, _uninitData);
        } else if (_moduleTypeId == HOOK_MODULE_TYPE) {
            _uninstallHook(_module, _uninitData);
        }

        emit ModuleUninstalled(_moduleTypeId, _module);
    }

    function installValidations(
        ValidationId[] calldata _vIds,
        bytes[] calldata _validationData
    ) external override onlyEntryPointOrSelf onlyWhenUnlocked {
        for (uint256 i = 0; i < _vIds.length; ++i) {
            _installValidation(_vIds[i], _validationData[i]);
        }
    }

    function isModuleInstalled(
        uint256 _moduleTypeId,
        address _module,
        bytes calldata _additionalContext
    ) public view override returns (bool isInstalled) {
        isInstalled = _isModuleInstalled(
            _moduleTypeId,
            _module,
            _additionalContext
        );
    }

    function mmsaFallback(
        bytes calldata _fallbackData
    ) external payable override onlyWhenUnlocked returns (bytes memory) {
        bytes4 msgSig = bytes4(_fallbackData[0:4]);
        FallbackHandler storage fallbackHandler = LibMMSAStorage
            .mmsaStorage()
            .fallbacks[msgSig];

        address handler = fallbackHandler.handler;
        CallType calltype = fallbackHandler.calltype;

        if (handler == address(0) || handler == address(this)) {
            revert MMSAFacet__InvalidFallbackHandler(msgSig);
        }

        if (calltype == CALLTYPE_STATIC) {
            assembly {
                calldatacopy(0, _fallbackData.offset, _fallbackData.length)
                mstore(_fallbackData.length, shl(96, caller()))

                if iszero(
                    staticcall(
                        gas(),
                        handler,
                        0,
                        add(_fallbackData.length, 20),
                        codesize(),
                        0x00
                    )
                ) {
                    returndatacopy(0, 0, returndatasize())
                    revert(0, returndatasize())
                }

                returndatacopy(0, 0, returndatasize())
                return(0, returndatasize())
            }
        } else if (calltype == CALLTYPE_SINGLE) {
            assembly {
                calldatacopy(0, _fallbackData.offset, _fallbackData.length)
                mstore(_fallbackData.length, shl(96, caller()))

                if iszero(
                    call(
                        gas(),
                        handler,
                        0,
                        0,
                        add(_fallbackData.length, 20),
                        codesize(),
                        0x00
                    )
                ) {
                    returndatacopy(0, 0, returndatasize())
                    revert(0, returndatasize())
                }

                returndatacopy(0, 0, returndatasize())
                return(0, returndatasize())
            }
        } else {
            revert MMSAFacet__InvalidCallType();
        }
    }

    // solhint-disable-next-line no-unused-vars
    function mmsaStaticFallback(
        bytes calldata _fallbackData
    ) external view override onlyWhenUnlocked returns (bytes memory) {
        bytes4 msgSig = bytes4(_fallbackData[0:4]);
        FallbackHandler storage fallbackHandler = LibMMSAStorage
            .mmsaStorage()
            .fallbacks[msgSig];

        address handler = fallbackHandler.handler;
        CallType calltype = fallbackHandler.calltype;

        if (handler == address(0) || handler == address(this)) {
            revert MMSAFacet__InvalidFallbackHandler(msgSig);
        }

        if (calltype == CALLTYPE_STATIC) {
            assembly {
                calldatacopy(0, _fallbackData.offset, _fallbackData.length)
                mstore(_fallbackData.length, shl(96, caller()))

                if iszero(
                    staticcall(
                        gas(),
                        handler,
                        0,
                        add(_fallbackData.length, 20),
                        codesize(),
                        0x00
                    )
                ) {
                    returndatacopy(0, 0, returndatasize())
                    revert(0, returndatasize())
                }

                returndatacopy(0, 0, returndatasize())
                return(0, returndatasize())
            }
        }
        revert("Unsupprted");
    }

    function mmsaIsValidSignature(
        bytes32 _msgHash,
        bytes calldata _signature
    ) external view returns (bytes4 magicValue) {
        address validator = address(bytes20(_signature[0:20]));
        if (!_isValidatorInstalled(validator)) {
            revert MMSAFacet__InvalidValidator(validator);
        }

        magicValue = IValidator(validator).isValidSignatureWithSender(
            msg.sender,
            _getEncodedHash(_msgHash),
            _signature[20:]
        );
    }

    function _getEncodedHash(
        bytes32 _msgHash
    ) internal view returns (bytes32 encodedHash) {
        bytes32 messageHash = keccak256(
            abi.encode(MMSA_MSG_TYPEHASH, keccak256(abi.encode(_msgHash)))
        );
        encodedHash = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator(), messageHash)
        );
    }

    function _domainSeparator()
        internal
        view
        returns (bytes32 domainSeparator)
    {
        return
            keccak256(
                abi.encode(
                    LibVerification.DOMAIN_SEPARATOR_TYPEHASH,
                    block.chainid,
                    address(this)
                )
            );
    }

    function _decodeAndExecute(
        ExecMode _mode,
        bytes calldata _executionCalldata
    ) private returns (bytes[] memory returnData) {
        (CallType callType, ExecType execType) = _mode.decodeBasic();

        if (callType == CALLTYPE_BATCH) {
            Execution[] calldata executions = _decodeBatch(_executionCalldata);
            if (execType == EXECTYPE_DEFAULT) {
                returnData = _execute(executions);
            } else if (execType == EXECTYPE_TRY) {
                returnData = _tryExecute(executions);
            }
        } else if (callType == CALLTYPE_SINGLE) {
            (
                address target,
                uint256 value,
                bytes calldata callData
            ) = _decodeSingle(_executionCalldata);
            returnData = new bytes[](1);
            if (execType == EXECTYPE_DEFAULT) {
                returnData[0] = _execute(target, value, callData);
            } else if (execType == EXECTYPE_TRY) {
                bool success;
                (success, returnData[0]) = _tryExecute(target, value, callData);
                if (!success) {
                    emit TryExecFailure(0, returnData[0]);
                }
            }
        } else {
            revert MMSAFacet__UnsupportedCallType();
        }
    }
}
