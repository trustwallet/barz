// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IVerificationFacet} from "../facets/interfaces/IVerificationFacet.sol";
import {IERC1271} from "../interfaces/ERC/IERC1271.sol";
import {AppStorage, LibAppStorage, BarzStorage} from "../libraries/LibAppStorage.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {LibFacetStorage, Secp256k1VerificationStorage} from "../libraries/LibFacetStorage.sol";
import {UserOperation} from "../aa-4337/interfaces/UserOperation.sol";

/**
 * @title Test Secp256k1 verification facet
 * @dev Default Ethereum's elliptic curve
 * @author David Yongjun Kim (@Powerstream3604)
 * @author Ruslan Serebriakov (@rsrbk)
 */
contract TestInvalidSecp256k1VerificationFacet is BarzStorage, IERC1271 {
    using ECDSA for bytes32;
    error Secp256k1VerificationFacet__InvalidSignerLength();
    error VerificationFacet__ValidateOwnerSignatureSelectorNotSet();

    event SignerUninitialized();

    constructor() {
        LibAppStorage.enforceSignerInitialize();
    }

    // THIS INVALID FACET DOES NOT INCLUDE initializeSigner()
    // THIS FACET IS USED TO TEST WHEN initializeSigner() DOESN'T EXIST IN FACET

    function uninitializeSigner() external returns (uint256 uninitSuccess) {
        LibAppStorage.enforceSignerMigration();
        LibAppStorage.setSignerUninitialized();
        Secp256k1VerificationStorage storage k1Storage = LibFacetStorage
            .k1Storage();
        k1Storage.signer = address(0);

        if (LibAppStorage.getValidateOwnerSignatureSelector() == bytes4(0))
            revert VerificationFacet__ValidateOwnerSignatureSelectorNotSet();
        LibAppStorage.setValidateOwnerSignatureSelector(bytes4(0));

        uninitSuccess = 1;

        emit SignerUninitialized();
    }

    function validateOwnerSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) public view returns (uint256 validationData) {
        Secp256k1VerificationStorage storage k1Storage = LibFacetStorage
            .k1Storage();
        return validateSignature(userOp, userOpHash, k1Storage.signer);
    }

    function validateSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        address signer
    ) public pure returns (uint256) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        if (signer != hash.recover(userOp.signature)) return 1;
        return 0;
    }

    // This is REMOVED for testing purpose
    function validateOwnerSignatureSelector() public pure returns (bytes4) {
        // return this.validateOwnerSignature.selector;
        // The signature name could change according to the facet but the param format(UserOp, UserOpHash) should not change
    }

    function owner() public view returns (bytes memory) {
        Secp256k1VerificationStorage storage k1Storage = LibFacetStorage
            .k1Storage();
        return abi.encodePacked(k1Storage.signer);
    }

    function isValidKeyType(
        bytes memory _publicKey
    ) public pure returns (bool) {
        return (_publicKey.length == 65 && _publicKey[0] == 0x04);
    }

    function isValidSignature(
        bytes32 _hash,
        bytes memory _signature
    ) public view override returns (bytes4 magicValue) {
        magicValue = (_hash.recover(_signature) ==
            LibFacetStorage.k1Storage().signer)
            ? this.isValidSignature.selector
            : bytes4(0xffffffff);
    }
}
