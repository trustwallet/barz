// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {UserOperation} from "../aa-4337/interfaces/UserOperation.sol";
import {IAccount} from "../aa-4337/interfaces/IAccount.sol";
import {IEntryPoint} from "../aa-4337/interfaces/IEntryPoint.sol";
import {LibAppStorage, BarzStorage} from "../libraries/LibAppStorage.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {LibFacetGuard} from "../libraries/LibFacetGuard.sol";
import {LibLoupe} from "../libraries/LibLoupe.sol";
import {LibValidationModuleFacetStorage} from "../libraries/LibValidationModuleFacetStorage.sol";
import {IFacetRegistry} from "../infrastructure/interfaces/IFacetRegistry.sol";
import {IDiamondCut} from "../facets/base/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../facets/base/interfaces/IDiamondLoupe.sol";
import {IVerificationFacet} from "./interfaces/IVerificationFacet.sol";
import {IERC1271} from "../interfaces/ERC/IERC1271.sol";
import {IAccountFacetV2} from "./interfaces/IAccountFacetV2.sol";

/**
 * @title Account Facet V2
 * @dev Account module contract that provides the account features and initialization of signer
 *      compatible with EIP-1271 & EIP-4337
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract AccountFacetV2 is IAccountFacetV2, IAccount, BarzStorage {
    using ECDSA for bytes32;

    modifier onlyEntryPoint() {
        if (msg.sender != entryPoint()) {
            revert AccountFacetV2__NotFromEntryPoint();
        }
        _;
    }

    /**
     * @notice This constructor ensures that this contract can only be used as singleton for Proxy contracts
     */
    constructor() {
        LibAppStorage.enforceAccountInitialize();
    }

    /**
     * @notice Returns the address of EntryPoint contract registered to Barz account
     */
    function entryPoint() public pure returns (address) {
        return 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;
    }

    /**
     * @notice Initializes the initial storage of the Barz contract.
     * @dev This method can only be called during the initialization or signature migration.
     *      If the proxy contract was created without initialization, anyone can call initialize.
     *      Barz calls initialize in constructor in an atomic transaction during deployment
     * @param _verificationFacet Facet contract handling the verificationi
     * @param _anEntryPoint Entrypoint contract defined in EIP-4337 handling the flow of UserOp
     * @param _facetRegistry Registry of Facets that hold all facet information
     * @param _defaultFallBackHandler Middleware contract for default facets
     * @param _ownerPublicKey Bytes of owner public key
     */
    function initialize(
        address _verificationFacet,
        address _anEntryPoint,
        address _facetRegistry,
        address _defaultFallBackHandler,
        bytes calldata _ownerPublicKey
    ) public override returns (uint256 initSuccess) {
        LibAppStorage.enforceAccountInitialize();
        s.entryPoint = IEntryPoint(_anEntryPoint);
        s.facetRegistry = IFacetRegistry(_facetRegistry);
        LibDiamond.diamondStorage().defaultFallbackHandler = IDiamondLoupe(
            _defaultFallBackHandler
        );

        _cutDiamondAccountFacet(_verificationFacet);

        bytes memory initCall = abi.encodeWithSelector(
            0xcd9b47e4, // initializeSigner(bytes)
            _ownerPublicKey
        );
        // Every Verification Facet should comply with initializeSigner(bytes)
        // to be compatible with the Barz contract(for initialization)
        (bool success, bytes memory result) = _verificationFacet.delegatecall(
            initCall
        );
        if (!success || uint256(bytes32(result)) != 1) {
            revert AccountFacetV2__InitializationFailure();
        }

        initSuccess = 1;
        emit AccountInitialized(s.entryPoint, _ownerPublicKey);
    }

    function _cutDiamondAccountFacet(address _verificationFacet) internal {
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](1);

        bytes4 ownerVerificationFuncSelector = IVerificationFacet(
            _verificationFacet
        ).validateOwnerSignatureSelector();

        bytes4[] memory verificationFunctionSelectors = new bytes4[](3);
        verificationFunctionSelectors[0] = IERC1271.isValidSignature.selector;
        verificationFunctionSelectors[1] = ownerVerificationFuncSelector;
        verificationFunctionSelectors[2] = IVerificationFacet.owner.selector;
        cut[0] = IDiamondCut.FacetCut({
            facetAddress: _verificationFacet,
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: verificationFunctionSelectors
        });

        LibDiamond.diamondCut(cut, address(0), "");
    }

    /**
     * @notice Calls the destination with inputted calldata and value from EntryPoint
     * @dev This method executes the calldata coming from the EntryPoint.
     *      Barz will make a call to this function for majority of typical execution(e.g. Swap, Token Transfer)
     * @param _dest Address of destination where the call will be forwarded to
     * @param _value Amount of native coin the owner is willing to send(e.g. ETH, BNB)
     * @param _func Bytes of calldata to execute in the destination address
     */
    function executeSingle(
        address _dest,
        uint256 _value,
        bytes calldata _func
    ) external override onlyEntryPoint onlyWhenUnlocked {
        LibFacetGuard.enforceFacetValidation();
        address restrictionsFacet = LibDiamond.restrictionsFacet();
        if (restrictionsFacet == address(0)) {
            _call(_dest, _value, _func);
        } else {
            _callWithRestrictions(_dest, _value, _func, restrictionsFacet);
        }
        LibFacetGuard.closeFacetValidation();
    }

    /**
     * @notice Batch calls the destination with inputted calldata and value from EntryPoint
     * @dev This method batch executes the calldata coming from the EntryPoint.
     *      Barz will make a call to this function for majority of typical execution(e.g. Swap, Token Transfer)
     * @param _dest Array of addresses of destination where the call will be forwarded to
     * @param _value Array of amount of native coin the owner is willing to send(e.g. ETH, BNB)
     * @param _func Array of bytes of calldata to execute in the destination address
     */
    function executeBatch(
        address[] calldata _dest,
        uint256[] calldata _value,
        bytes[] calldata _func
    ) external override onlyEntryPoint onlyWhenUnlocked {
        LibFacetGuard.enforceFacetValidation();
        if (_dest.length != _func.length || _dest.length != _value.length) {
            revert AccountFacetV2__InvalidArrayLength();
        }
        address restrictionsFacet = LibDiamond.restrictionsFacet();
        if (restrictionsFacet == address(0)) {
            for (uint256 i; i < _dest.length; ) {
                _call(_dest[i], _value[i], _func[i]);
                unchecked {
                    ++i;
                }
            }
        } else {
            for (uint256 i; i < _dest.length; ) {
                _callWithRestrictions(
                    _dest[i],
                    _value[i],
                    _func[i],
                    restrictionsFacet
                );
                unchecked {
                    ++i;
                }
            }
        }
        LibFacetGuard.closeFacetValidation();
    }

    /**
     * @notice Validates the signature field of UserOperation
     * @dev This method validates if the signature of UserOp is indeed valid by delegating the call to Verification Facet
     *      Barz makes a call to the pre-registered Verification Facet address in App Storage
     * @param _userOp UserOperation from owner to be validated
     * @param _userOpHash Hash of UserOperation given from the EntryPoint contract
     */
    function validateUserOp(
        UserOperation calldata _userOp,
        bytes32 _userOpHash,
        uint256 _missingAccountFunds
    )
        external
        virtual
        override
        onlyEntryPoint
        onlyWhenUnlocked
        returns (uint256 validationData)
    {
        address validatorSystem;
        bytes2 validatorKey;
        bytes memory validateCall;
        uint256 facetCall;
        validatorKey = _extractValidatorSystem(_userOp);
        if (validatorKey != bytes2(0)) {
            // Make function call to ValidatorSystem. e.g., 6900, 7579, etc
            validateCall = abi.encodeWithSelector(
                this.validateUserOp.selector,
                _userOp,
                _userOpHash,
                _missingAccountFunds
            );
            validatorSystem = LibValidationModuleFacetStorage
                .validationModuleFacetStorage()
                .validationModuleFacet[_extractValidatorSystem(_userOp)];
            if (validatorSystem == address(0)) {
                revert AccountFacetV2__NonExistentValidatorSystem();
            }
        } else {
            // Get Facet with Function Selector
            validatorSystem = LibLoupe.facetAddress(
                s.validateOwnerSignatureSelector
            );
            if (validatorSystem == address(0)) {
                revert AccountFacetV2__NonExistentVerificationFacet();
            }

            // Make function call to VerificationFacet
            validateCall = abi.encodeWithSelector(
                s.validateOwnerSignatureSelector,
                _userOp,
                _userOpHash
            );
            facetCall = 1;
        }

        (bool success, bytes memory result) = validatorSystem.delegatecall(
            validateCall
        );
        if (!success) {
            revert AccountFacetV2__CallNotSuccessful();
        }
        validationData = uint256(bytes32(result));
        if (validationData == 0) {
            if (facetCall == 1) {
                LibFacetGuard.allowFacetValidation();
            }
            emit VerificationSuccess(_userOpHash);
        } else {
            emit VerificationFailure(_userOpHash);
        }

        // Send missingAccountFunds to EntryPoint contract
        // TODO: Update this
        assembly {
            if _missingAccountFunds {
                pop(
                    call(
                        gas(),
                        caller(),
                        _missingAccountFunds,
                        callvalue(),
                        callvalue(),
                        callvalue(),
                        callvalue()
                    )
                )
            }
        }
    }

    function addValidatorSystem(
        bytes2 _systemKey,
        address _system
    ) external override onlyWhenUnlocked {
        LibDiamond.enforceIsSelf();
        LibFacetGuard.enforceFacetValidation();

        if (getValidatorSystem(_systemKey) != address(0)) {
            revert AccountFacetV2__ValidatorSystemAlreadyExists();
        }

        _setValidatorSystem(_systemKey, _system);
        emit ValidatorSystemAdded(_systemKey, _system);
    }

    function removeValidatorSystem(
        bytes2 _systemKey
    ) external override onlyWhenUnlocked {
        LibDiamond.enforceIsSelf();
        LibFacetGuard.enforceFacetValidation();

        if (getValidatorSystem(_systemKey) == address(0)) {
            revert AccountFacetV2__NonexistentValidatorSystem();
        }

        _setValidatorSystem(_systemKey, address(0));
        emit ValidatorSystemRemoved(_systemKey);
    }

    function getValidatorSystem(
        bytes2 _systemKey
    ) public view returns (address system) {
        system = LibValidationModuleFacetStorage
            .validationModuleFacetStorage()
            .validationModuleFacet[_systemKey];
    }

    function nonce(
        uint192 key
    ) external view virtual override returns (uint256) {
        return IEntryPoint(entryPoint()).getNonce(address(this), key);
    }

    /**
     * @notice Calls the target with the inputted value and calldata
     * @dev This method is the actual function in Barz that makes a call with an arbitrary owner-given data
     * @param _target Address of the destination contract which the call is getting forwarded to
     * @param _value Amount of Native coin the owner is wanting to make in this call
     * @param _data Calldata the owner is forwarding together in the call e.g. Swap/Token Transfer
     */
    function _call(
        address _target,
        uint256 _value,
        bytes memory _data
    ) internal {
        (bool success, bytes memory result) = _target.call{value: _value}(
            _data
        );
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /**
     * @notice Calls the target with the inputted value and calldata together with restrictions check
     * @dev This method is the actual function in Barz that makes a call with an arbitrary owner-given data
     * @param _target Address of the destination contract which the call is getting forwarded to
     * @param _value Amount of Native coin the owner is wanting to make in this call
     * @param _data Calldata the owner is forwarding together in the call e.g. Swap/Token Transfer
     * @param _restrictionsFacet Address of Facet to validate restrictions
     */
    function _callWithRestrictions(
        address _target,
        uint256 _value,
        bytes memory _data,
        address _restrictionsFacet
    ) internal {
        // NOTE: No restrictions facet, so restriction validation passes
        if (
            _checkRestrictions(_restrictionsFacet, _target, _value, _data) != 0
        ) {
            revert AccountFacetV2__RestrictionsFailure();
        }

        (bool success, bytes memory result) = _target.call{value: _value}(
            _data
        );
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /**
     * @notice Checks restrictions if the restrictions facet exists
     * @dev This method checks if the restrictions facet exists and makes a verification call to an array of restrictions facet
     * @param _facet Address that holds the restrictions logic
     * @param _target Address the call is getting forwarded to
     * @param _value Amount of native coin the call is sending together with the call
     * @param _data Calldata to trigger execution in target address
     */
    function _checkRestrictions(
        address _facet,
        address _target,
        uint256 _value,
        bytes memory _data
    ) internal returns (uint256 result) {
        bytes memory call = abi.encodeWithSelector(
            0xac87185d, // verifyRestrictions(address,address,uint256,bytes)
            address(this),
            _target,
            _value,
            _data
        );
        (bool success, bytes memory response) = _facet.delegatecall(call);
        if (!success) {
            revert AccountFacetV2__RestrictionsFailure();
        }
        result = uint256(bytes32(response));
    }

    // 32 bytes
    // 20 bytes - validator address
    // 20-24 bytes - validator system
    // 8 bytes - scalar value
    function _extractValidatorSystem(
        UserOperation calldata _userOp
    ) internal pure returns (bytes2) {
        bytes2 validatorSystem;
        uint256 _nonce = _userOp.nonce;
        assembly {
            validatorSystem := shl(176, _nonce)
        }
        return validatorSystem;
    }

    function _setValidatorSystem(bytes2 _systemKey, address _system) internal {
        LibValidationModuleFacetStorage
            .validationModuleFacetStorage()
            .validationModuleFacet[_systemKey] = _system;
    }
}
