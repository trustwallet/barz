// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {UserOperation} from "../../aa-4337/interfaces/UserOperation.sol";
import {LibDiamond} from "../../libraries/LibDiamond.sol";
import {LibLoupe} from "../../libraries/LibLoupe.sol";
import {LibAppStorage} from "../../libraries/LibAppStorage.sol";
import {LibVerification} from "../../libraries/LibVerification.sol";
import {LibMultiSigStorage, MultiSigStorage} from "../../libraries/LibMultiSigStorage.sol";
import {IERC1271} from "../../interfaces/ERC/IERC1271.sol";
import {IVerificationFacet} from "../interfaces/IVerificationFacet.sol";
import {IMultiSigFacet} from "../interfaces/IMultiSigFacet.sol";

/**
 * @title Multi-sig facet
 * @dev Multi-signature Facet with custom threshold.
 *      Wallet that adds this facet becomes a multi-sig wallet.
 *      Reference signature_format.md documentation for Multi-sig facet details
 * @author David Yongjun Kim (@Powerstream3604)
 * NOTE: This Facet hasn't been audited yet and it's planning to be audited soon.
 */
contract MultiSigFacet is IMultiSigFacet, IVerificationFacet, IERC1271 {
    using ECDSA for bytes32;

    address public immutable self;

    address internal constant SENTINEL_OWNERS = address(0x1);
    uint256 internal constant ADDRESS = 20;
    uint256 internal constant SIG_TYPE = 1;
    uint256 internal constant SIG_LEN = 4;
    uint256 internal constant THRESHOLD = 4;
    uint256 internal constant INVALID_SIG = 1;
    uint256 internal constant VALID_SIG = 0;

    /**
     * @notice This constructor ensures that this contract can only be used as singleton for Proxy contracts
     */
    constructor() {
        LibAppStorage.enforceSignerInitialize();
        self = address(this);
    }

    /**
     * @notice Initializes the signer in Multisig Facet Storage. This can only be called when the account is uninitialized or during signature migration.
     * @dev This method checks if the signer has already been initialized. If already initialized, it reverts.
     *      It checks if the public key is in the right format and initializes signer storage in k1 storage.
     * @param _owners Bytes of owner public key
     * @return initSuccess Uint value representing the success of init operation
     */
    function initializeSigner(
        bytes calldata _owners
    ) public override returns (uint256 initSuccess) {
        LibAppStorage.enforceSignerInitialize();

        if (!isValidKeyType(_owners)) {
            revert MultiSigFacet__InvalidInitData();
        }

        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        uint256 threshold = uint256(uint32(bytes4(_owners)));
        uint256 ownerCount = (_owners.length - THRESHOLD) / ADDRESS;

        if (threshold == 0) {
            revert MultiSigFacet__InvalidThreshold();
        }
        if (ownerCount == 0) {
            revert MultisigFacet__InvalidOwnerCount();
        }

        address currentOwner = SENTINEL_OWNERS;
        uint256 ptr = THRESHOLD;
        address owner_;
        for (uint256 i; i < ownerCount; ) {
            owner_ = address(bytes20(_owners[ptr:ptr + ADDRESS]));
            ptr += ADDRESS;
            if (
                owner_ == address(0) ||
                owner_ == SENTINEL_OWNERS ||
                owner_ == address(this) ||
                owner_ == currentOwner
            ) {
                revert MultiSigFacet__InvalidOwnerAddress();
            }
            if (ms.owners[owner_] != address(0)) {
                revert MultiSigFacet__DuplicateOwner();
            }

            ms.owners[currentOwner] = owner_;
            currentOwner = owner_;

            unchecked {
                ++i;
            }
        }
        ms.owners[currentOwner] = SENTINEL_OWNERS;
        ms.ownerCount = ownerCount;
        ms.threshold = threshold;

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

        emit SignerInitialized(_owners);
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

        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();
        ++ms.counter;
        address[] memory ownerlist = getOwners();
        uint256 ownerlistLength = ownerlist.length;
        for (uint256 i; i < ownerlistLength; ) {
            ms.owners[ownerlist[i]] = address(0);
            unchecked {
                ++i;
            }
        }
        ms.owners[SENTINEL_OWNERS] = address(0);

        if (LibAppStorage.getValidateOwnerSignatureSelector() == bytes4(0))
            revert VerificationFacet__ValidateOwnerSignatureSelectorNotSet();
        LibAppStorage.setValidateOwnerSignatureSelector(bytes4(0));

        uninitSuccess = 1;

        emit SignerUninitialized();
    }

    /**
     * @notice Validates if the user operation is signed by the owner.
     * @dev This method validates if the user operation is signed by the owner. It internally calls checkSignatures with
     *      user operation hash and signature together with the threshold.
     * @param userOp UserOperation including all information for execution
     * @param userOpHash Hash of UserOperation given from EntryPoint. This hash is used for signature validation
     * @return validationData Uint value representing whether the validation is successful. 0 for success, 1 for failure
     */
    function validateOwnerSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) public view override returns (uint256 validationData) {
        // Data 1 is invalid, Data 0 is valid
        validationData = checkSignatures(
            userOpHash,
            userOp.signature,
            LibMultiSigStorage.multisigStorage().threshold
        );
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
        return this.validateOwnerSignature.selector;
        // The signature name could change according to the facet but the param format(UserOp, UserOpHash) should not change
    }

    /**
     * @notice Returns the owner of the account
     * @return signer Bytes of owner address
     */
    function owner() public view override returns (bytes memory) {
        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        uint totalLength = ms.ownerCount * ADDRESS;
        bytes memory result = new bytes(totalLength);

        // populate return array
        uint256 index;
        address currentOwner = ms.owners[SENTINEL_OWNERS];
        while (currentOwner != SENTINEL_OWNERS) {
            assembly {
                mstore(
                    add(result, add(32, mul(index, ADDRESS))),
                    shl(96, currentOwner)
                )
            }
            currentOwner = ms.owners[currentOwner];
            index++;
        }

        return result;
    }

    /**
     * @notice Validates if the format of public key is valid for this verification facet
     * @dev For this Secp256k1Verification Facet, the public key should comply with the format in the signature_format.md doc
     * @param _publicKey Bytes of public key for format check
     * @return isValid Boolean variable representing if the format of public key is valid
     */
    function isValidKeyType(
        bytes memory _publicKey
    ) public pure override returns (bool isValid) {
        uint256 publicKeyLength = _publicKey.length;
        if (
            publicKeyLength < ADDRESS + THRESHOLD ||
            (publicKeyLength - THRESHOLD) % ADDRESS != 0
        ) {
            return false;
        }

        uint256 threshold = uint256(uint32(bytes4(_publicKey)));
        uint256 ownerCount = (publicKeyLength - THRESHOLD) / ADDRESS;

        isValid = !(ownerCount < threshold || threshold == 0);
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
        bytes calldata _signature
    ) public view override returns (bytes4 magicValue) {
        bytes32 messageData = LibVerification.getMessageHash(_hash);
        magicValue = (checkSignatures(
            messageData,
            _signature,
            LibMultiSigStorage.multisigStorage().threshold
        ) == VALID_SIG)
            ? this.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    /**
     * @notice Validates the format of the signature and verifies if the signature is signed by the expected key.
     *         Reference signature_format.md doc for details about signature format and signature types
     * @param _dataHash Bytes value of data hash signed by the owners
     * @param _signatures Bytes value of signature which should comply with signature format
     * @param _threshold Uint256 value of current Multi-sig Barz's threshold
     */
    function checkSignatures(
        bytes32 _dataHash,
        bytes calldata _signatures,
        uint256 _threshold
    ) public view returns (uint256) {
        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        address lastOwner = address(0);
        address currentOwner;
        bytes memory signature;
        uint256 signatureType;
        uint256 nextOffset;
        uint256 i;
        for (i; i < _threshold; ) {
            (
                currentOwner,
                signature,
                signatureType,
                nextOffset
            ) = splitSignatures(_signatures, nextOffset);
            if (nextOffset == 0 && i + 1 < _threshold) {
                return INVALID_SIG;
            }
            if (signatureType == 1) {
                // If signatureType is 1 then it is default dataHash signed.
                // This also includes the contract signature
                if (
                    !SignatureChecker.isValidSignatureNow(
                        currentOwner,
                        _dataHash,
                        signature
                    )
                ) {
                    return INVALID_SIG;
                }
            } else if (signatureType == 2) {
                // If signatureType is 2 then it is an approved hash
                if (ms.approvedHashes[ms.counter][currentOwner][_dataHash] == 0) {
                    return INVALID_SIG;
                }
            } else if (signatureType == 3) {
                // If signatureType is 3 then it is a signed message hash
                // This also includes the contract signature
                bytes32 msgHash = _dataHash.toEthSignedMessageHash();
                if (
                    !SignatureChecker.isValidSignatureNow(
                        currentOwner,
                        msgHash,
                        signature
                    )
                ) {
                    return INVALID_SIG;
                }
            } else revert MultiSigFacet__InvalidRoute();
            if (
                currentOwner <= lastOwner ||
                ms.owners[currentOwner] == address(0) ||
                currentOwner == SENTINEL_OWNERS
            ) {
                return INVALID_SIG;
            }
            lastOwner = currentOwner;

            unchecked {
                ++i;
            }
        }
        return VALID_SIG;
    }

    /**
     * @notice Split signatures into each individual signatures. Should comply with signature format to be split
     * @param _signatures Bytes value of signature
     * @param _nextOffset Uint256 value of next offset to start splitting the signature
     */
    function splitSignatures(
        bytes calldata _signatures,
        uint256 _nextOffset
    )
        public
        pure
        returns (
            address owner_,
            bytes memory signature,
            uint256 signatureType,
            uint256 nextOffset
        )
    {
        uint256 signaturesLength = _signatures.length;

        if (signaturesLength <= _nextOffset + ADDRESS + SIG_LEN) {
            revert MultiSigFacet__InsufficientSignerLength();
        }

        owner_ = address(
            bytes20(_signatures[_nextOffset:_nextOffset + ADDRESS])
        );

        signatureType = uint256(
            uint8(
                bytes1(
                    _signatures[_nextOffset + ADDRESS:_nextOffset +
                        ADDRESS +
                        SIG_TYPE]
                )
            )
        );

        if (signatureType > 3 || signatureType == 0) {
            revert MultiSigFacet__InvalidSignatureType();
        }
        uint256 offSet = _nextOffset + ADDRESS + SIG_TYPE;
        uint256 siglen = uint256(
            uint32(bytes4(_signatures[offSet:offSet + SIG_LEN]))
        );
        if (offSet + siglen > signaturesLength) {
            revert MultiSigFacet__InvalidSignatureLength();
        }

        offSet += SIG_LEN;
        if (offSet + siglen == signaturesLength) {
            nextOffset = 0;
        } else {
            nextOffset = offSet + siglen;
        }

        signature = _signatures[offSet:offSet + siglen];
    }

    /**
     * @notice Approves the hash of userOperation on-chain. This can only be called by owners.
     * @param _hashToApprove Bytes value of UserOperation hash to approve
     */
    function approveHash(bytes32 _hashToApprove) external {
        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        if (ms.owners[msg.sender] == address(0)) {
            revert MultiSigFacet__OnlyOwner();
        }

        ms.approvedHashes[ms.counter][msg.sender][_hashToApprove] = 1;
        emit HashApproved(_hashToApprove, msg.sender);
    }

    /**
     * @notice Add owner to Barz. Update thresold if threshold is given different from current threshold
     * @dev This can only be done via a Self call.
     * @param _newOwner Address of new owner to be added
     * @param _threshold Uint256 value of threshold
     */
    function addOwner(address _newOwner, uint256 _threshold) external {
        LibDiamond.enforceIsSelf();

        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        if (
            _newOwner == address(0) ||
            _newOwner == SENTINEL_OWNERS ||
            _newOwner == address(this)
        ) {
            revert MultiSigFacet__InvalidOwnerAddress();
        }
        if (ms.owners[_newOwner] != address(0)) {
            revert MultiSigFacet__DuplicateOwner();
        }

        ms.owners[_newOwner] = ms.owners[SENTINEL_OWNERS];
        ms.owners[SENTINEL_OWNERS] = _newOwner;
        ++ms.ownerCount;
        emit OwnerAdded(_newOwner);

        if (ms.threshold != _threshold) {
            changeThreshold(_threshold);
        }
    }

    /**
     * @notice Remove owner from Barz. Update thresold if threshold is given different from current threshold
     * @dev This can only be done via a Self call.
     * @param _prevOwner Address of owner located right behind the removed owner address in the linked list
     * @param _removedOwner Address of owner to be removed
     * @param _threshold Uint256 value of threshold
     */
    function removeOwner(
        address _prevOwner,
        address _removedOwner,
        uint256 _threshold
    ) external {
        LibDiamond.enforceIsSelf();

        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        if (ms.ownerCount - 1 < _threshold) {
            revert MultiSigFacet__InvalidThreshold();
        }
        if (_removedOwner == address(0) || _removedOwner == SENTINEL_OWNERS) {
            revert MultiSigFacet__InvalidOwnerAddress();
        }
        if (ms.owners[_prevOwner] != _removedOwner) {
            revert MultiSigFacet__InvalidOwnerPair();
        }

        ms.owners[_prevOwner] = ms.owners[_removedOwner];
        ms.owners[_removedOwner] = address(0);
        --ms.ownerCount;
        emit OwnerRemoved(_removedOwner);

        if (ms.threshold != _threshold) {
            changeThreshold(_threshold);
        }
    }

    /**
     * @notice Swap owner in Barz.
     * @dev This can only be done via a Self call.
     * @param _prevOwner Address of owner located right behind the removed owner address in the linked list
     * @param _oldOwner Address of owner to be removed
     * @param _newOwner Address of owner to be added
     */
    function swapOwner(
        address _prevOwner,
        address _oldOwner,
        address _newOwner
    ) public {
        LibDiamond.enforceIsSelf();

        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        if (
            _newOwner == address(0) ||
            _newOwner == SENTINEL_OWNERS ||
            _newOwner == address(this)
        ) {
            revert MultiSigFacet__InvalidOwnerAddress();
        }
        if (ms.owners[_newOwner] != address(0)) {
            revert MultiSigFacet__DuplicateOwner();
        }
        if (_oldOwner == address(0) || _oldOwner == SENTINEL_OWNERS) {
            revert MultiSigFacet__InvalidOwnerAddress();
        }
        if (ms.owners[_prevOwner] != _oldOwner) {
            revert MultiSigFacet__InvalidOwnerPair();
        }

        ms.owners[_newOwner] = ms.owners[_oldOwner];
        ms.owners[_prevOwner] = _newOwner;
        ms.owners[_oldOwner] = address(0);
        emit OwnerRemoved(_oldOwner);
        emit OwnerAdded(_newOwner);
    }

    /**
     * @notice Changes the threshold of the Barz to `_threshold`.
     * @dev This can only be done via a Self call.
     * @param _threshold New threshold
     */
    function changeThreshold(uint256 _threshold) public {
        LibDiamond.enforceIsSelf();

        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        if (_threshold > ms.ownerCount || _threshold == 0) {
            revert MultiSigFacet__InvalidThreshold();
        }

        ms.threshold = _threshold;
        emit ThresholdChanged(_threshold);
    }

    /**
     * @notice Checks if the given address is owner
     * @param _owner Address to be checked if it's owner
     * @return isOwner_ Bool value showing if it's owner address
     */
    function isOwner(address _owner) public view returns (bool isOwner_) {
        isOwner_ = (_owner != SENTINEL_OWNERS &&
            LibMultiSigStorage.multisigStorage().owners[_owner] != address(0));
    }

    /**
     * @notice Returns the threshold of Barz
     * @return threshold Threshold of the Barz account
     */
    function getThreshold() public view returns (uint256 threshold) {
        threshold = LibMultiSigStorage.multisigStorage().threshold;
    }

    /**
     * @notice Returns the list of owner addresses
     * @return owners List of owners
     */
    function getOwners() public view returns (address[] memory owners) {
        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();
        owners = new address[](ms.ownerCount);

        uint256 index;
        address currentOwner = ms.owners[SENTINEL_OWNERS];
        while (currentOwner != SENTINEL_OWNERS) {
            owners[index] = currentOwner;
            currentOwner = ms.owners[currentOwner];
            index++;
        }
    }

    /**
     * @notice Returns the previous owner in the linked list
     * @param _owner Address of owner
     * @return prevOwner Address of previous owner
     */
    function getPrevOwner(
        address _owner
    ) public view returns (address prevOwner) {
        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();

        address currentOwner = ms.owners[SENTINEL_OWNERS];
        if (currentOwner == _owner) return SENTINEL_OWNERS;
        while (currentOwner != SENTINEL_OWNERS) {
            if (ms.owners[currentOwner] == _owner) {
                return currentOwner;
            }

            currentOwner = ms.owners[currentOwner];
        }
        return address(0);
    }

    /**
     * @notice Returns of the owner is approved by given owner address
     * @param _owner Address of owner
     * @param _hash Hash of UserOperation
     * @return isApproved Bool value showing if the hash is approved by owner
     */
    function isApprovedHash(
        address _owner,
        bytes32 _hash
    ) public view returns (bool isApproved) {
        MultiSigStorage storage ms = LibMultiSigStorage.multisigStorage();
        isApproved = (ms.approvedHashes[ms.counter][_owner][_hash] == 1);
    }
}
