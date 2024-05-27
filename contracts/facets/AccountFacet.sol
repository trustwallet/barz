// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {UserOperation} from "../aa-4337/interfaces/UserOperation.sol";
import {IEntryPoint} from "../aa-4337/interfaces/IEntryPoint.sol";
import {BaseAccount} from "../aa-4337/core/BaseAccount.sol";
import {LibAppStorage, BarzStorage} from "../libraries/LibAppStorage.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {LibLoupe} from "../libraries/LibLoupe.sol";
import {IFacetRegistry} from "../infrastructure/interfaces/IFacetRegistry.sol";
import {IDiamondCut} from "../facets/base/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../facets/base/interfaces/IDiamondLoupe.sol";
import {IVerificationFacet} from "./interfaces/IVerificationFacet.sol";
import {IERC1271} from "../interfaces/ERC/IERC1271.sol";
import {IAccountFacet} from "./interfaces/IAccountFacet.sol";

/**
 * @title Account Facet
 * @dev Account module contract that provides the account features and initialization of signer
 *      compatible with EIP-1271 & EIP-4337
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract AccountFacet is IAccountFacet, BarzStorage, BaseAccount {
    using ECDSA for bytes32;

    /**
     * @notice This constructor ensures that this contract can only be used as singleton for Proxy contracts
     */
    constructor() {
        LibAppStorage.enforceAccountInitialize();
    }

    /**
     * @notice Returns the address of EntryPoint contract registered to Barz account
     */
    function entryPoint() public view override returns (IEntryPoint) {
        return s.entryPoint;
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

        bytes memory initCall = abi.encodeWithSignature(
            "initializeSigner(bytes)",
            _ownerPublicKey
        );
        // Every Verification Facet should comply with initializeSigner(bytes)
        // to be compatible with the Barz contract(for initialization)
        (bool success, bytes memory result) = _verificationFacet.delegatecall(
            initCall
        );
        if (!success || uint256(bytes32(result)) != 1) {
            revert AccountFacet__InitializationFailure();
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
    function execute(
        address _dest,
        uint256 _value,
        bytes calldata _func
    ) external override onlyWhenUnlocked {
        _requireFromEntryPoint();
        address restrictionsFacet = LibDiamond.restrictionsFacet();
        if (restrictionsFacet == address(0)) _call(_dest, _value, _func);
        else _callWithRestrictions(_dest, _value, _func, restrictionsFacet);
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
    ) external override onlyWhenUnlocked {
        _requireFromEntryPoint();
        if (_dest.length != _func.length || _dest.length != _value.length)
            revert AccountFacet__InvalidArrayLength();
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
    }

    /**
     * @notice Validates the signature field of UserOperation
     * @dev This method validates if the signature of UserOp is indeed valid by delegating the call to Verification Facet
     *      Barz makes a call to the pre-registered Verification Facet address in App Storage
     * @param _userOp UserOperation from owner to be validated
     * @param _userOpHash Hash of UserOperation given from the EntryPoint contract
     */
    function _validateSignature(
        UserOperation calldata _userOp,
        bytes32 _userOpHash
    ) internal override returns (uint256 validationData) {
        // Get Facet with Function Selector
        address facet = LibLoupe.facetAddress(s.validateOwnerSignatureSelector);
        if (facet == address(0))
            revert AccountFacet__NonExistentVerificationFacet();

        // Make function call to VerificationFacet
        bytes memory validateCall = abi.encodeWithSelector(
            s.validateOwnerSignatureSelector,
            _userOp,
            _userOpHash
        );
        (bool success, bytes memory result) = facet.delegatecall(validateCall);
        if (!success) revert AccountFacet__CallNotSuccessful();
        validationData = uint256(bytes32(result));
        if (validationData == 0) emit VerificationSuccess(_userOpHash);
        else emit VerificationFailure(_userOpHash);
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
        if (_checkRestrictions(_restrictionsFacet, _target, _value, _data) != 0)
            revert AccountFacet__RestrictionsFailure();

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
        bytes memory call = abi.encodeWithSignature(
            "verifyRestrictions(address,address,uint256,bytes)",
            address(this),
            _target,
            _value,
            _data
        );
        (bool success, bytes memory response) = _facet.delegatecall(call);
        if (!success) revert AccountFacet__RestrictionsFailure();
        result = uint256(bytes32(response));
    }
}
