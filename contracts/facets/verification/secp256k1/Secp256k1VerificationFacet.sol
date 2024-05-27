// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {UserOperation} from "../../../aa-4337/interfaces/UserOperation.sol";
import {LibAppStorage} from "../../../libraries/LibAppStorage.sol";
import {LibVerification} from "../../../libraries/LibVerification.sol";
import {LibFacetStorage, Secp256k1VerificationStorage} from "../../../libraries/LibFacetStorage.sol";
import {LibLoupe} from "../../../libraries/LibLoupe.sol";
import {IERC1271} from "../../../interfaces/ERC/IERC1271.sol";
import {IVerificationFacet} from "../../interfaces/IVerificationFacet.sol";

/**
 * @title Secp256k1 verification facet
 * @dev Default Ethereum's elliptic curve
 * @author David Yongjun Kim (@Powerstream3604)
 * @author Ruslan Serebriakov (@rsrbk)
 */
contract Secp256k1VerificationFacet is IVerificationFacet, IERC1271 {
    using ECDSA for bytes32;
    error Secp256k1VerificationFacet__InvalidSignerLength();
    address public immutable self;

    /**
     * @notice This constructor ensures that this contract can only be used as singleton for Proxy contracts
     */
    constructor() {
        LibAppStorage.enforceSignerInitialize();
        self = address(this);
    }

    /**
     * @notice Initializes the signer in K1 Facet Storage. This can only be called when the account is uninitialized or during signature migration.
     * @dev This method checks if the signer has already been initialized. If already initialized, it reverts.
     *      It checks if the public key is in the light format and initializes signer storage in k1 storage.
     * @param _publicKey Bytes of owner public key
     * @return initSuccess Uint value representing the success of init operation
     */
    function initializeSigner(
        bytes calldata _publicKey
    ) public override returns (uint256 initSuccess) {
        LibAppStorage.enforceSignerInitialize();
        if (!isValidKeyType(_publicKey)) {
            revert Secp256k1VerificationFacet__InvalidSignerLength();
        }

        Secp256k1VerificationStorage storage k1Storage = LibFacetStorage
            .k1Storage();
        address signer;
        assembly {
            // Check if the length of the publicKey is 20 bytes
            switch eq(_publicKey.length, 20)
            case 0 {
                let ptr := mload(0x40)
                calldatacopy(ptr, add(_publicKey.offset, 1), 64)
                signer := keccak256(ptr, sub(_publicKey.length, 1))
            }
            case 1 {
                // address is encoded with zero padded at the end part. e,g,m 0x1234...0000
                // calldataload will load the 32 bytes and assigning it to signer(with type address) will truncate the first 12bytes, which returns invalid address
                // hence, we sub 12 to the offset so the signer will be a valid address
                signer := calldataload(sub(_publicKey.offset, 12))                
            }
            default {
                revert (0, 0)
            }
        }
        k1Storage.signer = signer;

        bytes4 validateSelector = validateOwnerSignatureSelector();

        if (LibAppStorage.getValidateOwnerSignatureSelector() != bytes4(0)) {
            revert VerificationFacet__ValidateOwnerSignatureSelectorAlreadySet();
        }
        if (LibLoupe.facetAddress(validateSelector) != self) {
            revert VerificationFacet__InvalidFacetMapping();
        }

        // initialize verification function selector
        LibAppStorage.setValidateOwnerSignatureSelector(validateSelector);

        initSuccess = 1;

        emit SignerInitialized(_publicKey);
    }

    /**
     * @notice Uninitialize signer in K1 Facet Storage. This can only be called when the account is undergoing signature migration
     *         and has already been initialized.
     * @dev This method checks if the signature migration is undergoing, signer is initialized and sets the signer to zero value.
     * @return uninitSuccess Uint value representing the success of uninit operation
     */
    function uninitializeSigner()
        external
        override
        returns (uint256 uninitSuccess)
    {
        LibAppStorage.enforceSignerMigration();
        LibAppStorage.setSignerUninitialized();
        Secp256k1VerificationStorage storage k1Storage = LibFacetStorage
            .k1Storage();
        k1Storage.signer = address(0);

        if (LibAppStorage.getValidateOwnerSignatureSelector() == bytes4(0)) {
            revert VerificationFacet__ValidateOwnerSignatureSelectorNotSet();
        }
        LibAppStorage.setValidateOwnerSignatureSelector(bytes4(0));

        uninitSuccess = 1;

        emit SignerUninitialized();
    }

    /**
     * @notice Validates if the user operation is signed by the owner.
     * @dev This method validates if the user operation is signed by the owner. It internally calls validateSignature with
     *      signer public key.
     * @param userOp UserOperation including all information for execution
     * @param userOpHash Hash of UserOperation given from EntryPoint. This hash is used for signature validation
     * @return validationData Uint value representing whether the validation is successful. 0 for success, 1 for failure
     */
    function validateOwnerSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) public view override returns (uint256 validationData) {
        Secp256k1VerificationStorage storage k1Storage = LibFacetStorage
            .k1Storage();
        validationData = validateSignature(
            userOp,
            userOpHash,
            k1Storage.signer
        );
    }

    /**
     * @notice Validates if the signature of UserOperation is signed by the given signer
     * @dev This method uses OpenZeppelin library to validate if the signature of UserOperation is signed by the signer address
     * @param userOp UserOperation including all information for execution
     * @param userOpHash Hash of UserOperation given from EntryPoint. This hash is used for signature validation
     * @param signer Address of signer who signed the contract, to be validated
     * @return isValid Uint value representing whether the validation is successful. 0 for success, 1 for failure
     */
    function validateSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        address signer
    ) public pure returns (uint256 isValid) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        isValid = (signer != hash.recover(userOp.signature)) ? 1 : 0;
    }

    /**
     * @notice Returns the selector of function to validate the signature of UserOperation
     * @return ownerSignatureValidatorSelector Bytes4 selector of function signature to validate account owner's UserOperation signature
     */
    function validateOwnerSignatureSelector()
        public
        pure
        override
        returns (bytes4 ownerSignatureValidatorSelector)
    {
        ownerSignatureValidatorSelector = this.validateOwnerSignature.selector;
        // NOTE: The signature name could change according to the facet but the param format(UserOp, UserOpHash) should not change
    }

    /**
     * @notice Returns the owner of the account
     * @return signer Bytes of owner address
     */
    function owner() public view override returns (bytes memory signer) {
        Secp256k1VerificationStorage storage k1Storage = LibFacetStorage
            .k1Storage();
        signer = abi.encodePacked(k1Storage.signer);
    }

    /**
     * @notice Validates if the format of public key is valid for this verification facet
     * @dev For this Secp256k1Verification Facet, the public key length should be 65 in an uncompressed public key format
     * @param _publicKey Bytes of public key for format check
     * @return isValid Boolean variable representing if the format of public key is valid
     */
    function isValidKeyType(
        bytes memory _publicKey
    ) public pure override returns (bool isValid) {
        isValid = (_publicKey.length == 65 && _publicKey[0] == 0x04) || (_publicKey.length == 20);
    }

    /**
     * @notice Validates if the signature is valid. Function to be compatible with EIP-1271
     * @dev This method verifies the signature if the owner indeed signed the hash. Returns magic value if true
     * @param _hash Hash value the owner signed
     * @param _signature Signature that signed the above hash
     * @return magicValue Bytes4 value representing the success/failure of validation
     */
    function isValidSignature(
        bytes32 _hash,
        bytes memory _signature
    ) public view override returns (bytes4 magicValue) {
        bytes32 messageData = LibVerification.getMessageHash(_hash);
        magicValue = (messageData.recover(_signature) ==
            LibFacetStorage.k1Storage().signer)
            ? this.isValidSignature.selector
            : bytes4(0xffffffff);
    }
}
