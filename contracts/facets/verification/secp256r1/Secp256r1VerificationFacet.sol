// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {UserOperation} from "../../../aa-4337/interfaces/UserOperation.sol";
import {LibAppStorage} from "../../../libraries/LibAppStorage.sol";
import {LibLoupe} from "../../../libraries/LibLoupe.sol";
import {LibFacetStorage, Secp256r1VerificationStorage} from "../../../libraries/LibFacetStorage.sol";
import {Base64} from "./utils/Base64.sol";
import {LibSecp256r1} from "./utils/LibSecp256r1.sol";
import {IERC1271} from "../../../interfaces/ERC/IERC1271.sol";
import {IVerificationFacet} from "../../interfaces/IVerificationFacet.sol";

/**
 * @title Secp256r1 verification facet
 * @dev Primarily used to verify user ops signed with passkeys
 * @author Ruslan Serebriakov (@rsrbk)
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract Secp256r1VerificationFacet is IVerificationFacet, IERC1271 {
    error Secp256r1VerificationFacet__InvalidSignerLength();
    address public immutable self;

    /**
     * @notice This constructor ensures that this contract can only be used as singleton for Proxy contracts
     */
    constructor() {
        LibAppStorage.enforceSignerInitialize();
        self = address(this);
    }

    /**
     * @notice Initializes the signer in R1 Facet Storage. This can only be called when the account is uninitialized or during signature migration.
     * @dev This method checks if the signer has already been initialized. If already initialized, it reverts.
     *      It checks if the public key is in the light format and initializes signer storage in k1 storage.
     * @param _publicKey Bytes of owner public key
     * @return initSuccess Uint value representing the success of init operation
     */
    function initializeSigner(
        bytes calldata _publicKey
    ) public override returns (uint256 initSuccess) {
        LibAppStorage.enforceSignerInitialize();

        if (!isValidKeyType(_publicKey))
            revert Secp256r1VerificationFacet__InvalidSignerLength();

        bytes memory publicKeyCoordinates = _publicKey[1:];
        uint256[2] memory q;
        assembly {
            // Copy the bytes from the input data into the uint256 array
            mstore(q, mload(add(publicKeyCoordinates, 32)))
            mstore(add(q, 32), mload(add(publicKeyCoordinates, 64)))
        }
        Secp256r1VerificationStorage storage r1Storage = LibFacetStorage
            .r1Storage();
        r1Storage.q = q;

        bytes4 validateSelector = validateOwnerSignatureSelector();

        if (LibAppStorage.getValidateOwnerSignatureSelector() != bytes4(0))
            revert VerificationFacet__ValidateOwnerSignatureSelectorAlreadySet();
        if (LibLoupe.facetAddress(validateSelector) != self)
            revert VerificationFacet__InvalidFacetMapping();

        // initialize verification function selector
        LibAppStorage.setValidateOwnerSignatureSelector(validateSelector);

        initSuccess = 1;

        emit SignerInitialized(_publicKey);
    }

    /**
     * @notice Uninitialize signer in R1 Facet Storage. This can only be called when the account is undergoing signature migration
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
        Secp256r1VerificationStorage storage r1Storage = LibFacetStorage
            .r1Storage();
        r1Storage.q = [0, 0];

        if (LibAppStorage.getValidateOwnerSignatureSelector() == bytes4(0))
            revert VerificationFacet__ValidateOwnerSignatureSelectorNotSet();
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
        Secp256r1VerificationStorage storage r1Storage = LibFacetStorage
            .r1Storage();
        validationData = validateSignature(userOp, userOpHash, r1Storage.q);
    }

    /**
     * @notice Validates if the signature of UserOperation is signed by the given signer
     * @dev This method uses OpenZeppelin library to validate if the signature of UserOperation is signed by the signer address
     * @param userOp UserOperation including all information for execution
     * @param userOpHash Hash of UserOperation given from EntryPoint. This hash is used for signature validation
     * @param q Public Key of signer who signed the contract, to be validated
     * @return isValid Uint value representing whether the validation is successful. 0 for success, 1 for failure
     */
    function validateSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256[2] memory q
    ) public view returns (uint256 isValid) {
        isValid = (_validateSignature(q, userOpHash, userOp.signature)) ? 0 : 1;
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
        return this.validateOwnerSignature.selector; // validateOwnerSignature(UserOperation calldata userOp,bytes32 userOpHash)
        // The signature name could change according to the facet but the param format(UserOp, UserOpHash) should not change
    }

    /**
     * @notice Returns the owner of the account
     * @return signer Bytes of owner address
     */
    function owner() public view override returns (bytes memory signer) {
        Secp256r1VerificationStorage storage r1Storage = LibFacetStorage
            .r1Storage();
        signer = abi.encodePacked(r1Storage.q);
    }

    /**
     * @notice Validates if the format of public key is valid for this verification facet
     * @dev For this Secp256k1Verification Facet, the public key should in an uncompressed public key format
     * @param _publicKey Bytes of public key for format check
     * @return isValid Boolean variable representing if the format of public key is valid
     */
    function isValidKeyType(
        bytes memory _publicKey
    ) public pure override returns (bool isValid) {
        isValid = (_publicKey.length == 65 && _publicKey[0] == 0x04);
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
        magicValue = _validateSignature(
            LibFacetStorage.r1Storage().q,
            _hash,
            _signature
        )
            ? this.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    function _validateSignature(
        uint256[2] memory q,
        bytes32 _hash,
        bytes memory _signature
    ) internal view returns (bool) {
        (
            uint256 rValue,
            uint256 sValue,
            bytes memory authenticatorData,
            string memory clientDataJSONPre,
            string memory clientDataJSONPost
        ) = abi.decode(_signature, (uint256, uint256, bytes, string, string));
        bytes32 clientHash;
        {
            string memory opHashBase64 = Base64.encode(bytes.concat(_hash));
            string memory clientDataJSON = string.concat(
                clientDataJSONPre,
                opHashBase64,
                clientDataJSONPost
            );
            clientHash = sha256(bytes(clientDataJSON));
        }
        bytes32 sigHash = sha256(bytes.concat(authenticatorData, clientHash));
        return LibSecp256r1.Verify(q, rValue, sValue, uint256(sigHash));
    }
}
