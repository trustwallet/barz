// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {LibAppStorage} from "../libraries/LibAppStorage.sol";
import {LibFacetStorage, SignatureMigrationStorage, SignatureMigrationConfig, SignatureMigrationApprovalConfig, ApprovalConfig} from "../libraries/LibFacetStorage.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {LibGuardian} from "../libraries/LibGuardian.sol";
import {LibLoupe} from "../libraries/LibLoupe.sol";
import {Modifiers} from "./Modifiers.sol";
import {ISecurityManager} from "../infrastructure/interfaces/ISecurityManager.sol";
import {IDiamondCut} from "./base/interfaces/IDiamondCut.sol";
import {IVerificationFacet} from "./interfaces/IVerificationFacet.sol";
import {ISignatureMigrationFacet} from "./interfaces/ISignatureMigrationFacet.sol";

/**
 * @title Signature Migration Facet
 * @dev Responsible for migrating user signature scheme to a new scheme user sets
 *      Which could include
 *          - ECDSA on Secp256K1 Curve
 *          - ECDSA on Secp256R1 Curve
 *          - BLS, Schnorr, etc
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract SignatureMigrationFacet is ISignatureMigrationFacet, Modifiers {
    bytes constant UNINIT_CALL =
        abi.encodeWithSignature("uninitializeSigner()");
    ISecurityManager public immutable securityManager;

    /**
     * @notice This modifier verifies if the public key format matches with the new verification facet
     * @param _publicKey Bytes of public key to be validated for the new verification facet
     * @param _newVerificationFacet Address of new verification facet
     */
    modifier validateKeyType(
        bytes memory _publicKey,
        address _newVerificationFacet
    ) {
        if (
            !IVerificationFacet(_newVerificationFacet).isValidKeyType(
                _publicKey
            )
        ) {
            revert SignatureMigrationFacet__InvalidKeyType();
        }
        _;
    }

    /**
     * @notice This constructor sets the Security Manager address which is an immutable variable.
     *         Immutable variables do not impact the storage of diamond
     * @param _securityManager Security Manager contract that holds the security related variables for all wallets
     */
    constructor(address _securityManager) {
        securityManager = ISecurityManager(_securityManager);
    }

    // IMPORTANT NOTE: In the client side when they call this function, the func selectors should be sorted in ascending order
    // to prevent different hash with same items in the array
    /**
     * @notice Moves the state of migration to a pending state. When pending state is over after pending period time,
     *         Migration can be finalized. This function can only be called by self and when the account is unlocked.
     * @dev This method checks if the caller is self and if guardians exists. It migrates signature request to a pending state
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     */
    function migrateSignatureScheme(
        address _newVerificationFacet,
        bytes calldata _newPublicKey,
        bytes4[] calldata _newVerificationFuncSelectors
    )
        public
        override
        onlyWhenUnlocked
        validateKeyType(_newPublicKey, _newVerificationFacet)
    {
        // Only self contract can call this function
        LibDiamond.enforceIsSelf();
        // Should revert if guardian exist
        if (0 != LibGuardian.guardianCount()) {
            revert SignatureMigrationFacet__InvalidRouteWithGuardian();
        }
        {
            _checkMigrationCutValidity(
                _newVerificationFacet,
                _newVerificationFuncSelectors
            );
        }
        _migrateSignatureScheme(
            _newVerificationFacet,
            _newPublicKey,
            _newVerificationFuncSelectors
        );
    }

    // NOTE: Migration requires a pending period & confirmation from owner to prevent a
    // single call changing the ownership of the wallet
    /**
     * @notice Migrate signature scheme when guardians exists. Verifies the signature of guardians and moves migration to pending state.
     *       Which can then be finalized when pending period is over. Owner's approval is mandatory for migration to happen
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     * @param _approvers List of approvers. This could include owner
     */
    function migrateSignatureSchemeWithGuardian(
        address _newVerificationFacet,
        bytes calldata _newPublicKey,
        bytes4[] calldata _newVerificationFuncSelectors,
        address[] calldata _approvers,
        bytes[] calldata _signatures
    )
        public
        override
        onlyWhenUnlocked
        validateKeyType(_newPublicKey, _newVerificationFacet)
    {
        // Should revert if does not guardian exist
        if (0 == LibGuardian.guardianCount()) {
            revert SignatureMigrationFacet__InvalidRouteWithGuardian();
        }
        if (_approvers.length != _signatures.length) {
            revert SignatureMigrationFacet__InvalidArrayLength();
        }

        {
            _checkMigrationCutValidity(
                _newVerificationFacet,
                _newVerificationFuncSelectors
            );
        }
        bytes32 migrationPublicKeyHash = getApprovalMigrationKeyHash(
            _newPublicKey,
            _newVerificationFacet,
            _newVerificationFuncSelectors,
            "MigrateSignature"
        );

        _checkApprover(_approvers);
        _checkDuplicateOnChainApprover(migrationPublicKeyHash, _approvers);

        bool onChainOwnerApproval = getMigrationOwnerApprovalWithTimeValidity(
            migrationPublicKeyHash
        );
        uint256 threshold = onChainOwnerApproval ? 0 : 1;

        if (
            _approvers.length +
                getMigrationApprovalCountWithTimeValidity(
                    migrationPublicKeyHash
                ) <
            LibGuardian.majorityOfGuardians() + threshold
        ) {
            revert SignatureMigrationFacet__InsufficientApprovers();
        }
        {
            // To prevent Stack too deep
            bool ownerApproved;
            for (uint256 i; i < _approvers.length; ) {
                if (
                    !LibGuardian.isGuardian(_approvers[i]) &&
                    address(this) != _approvers[i]
                ) {
                    revert SignatureMigrationFacet__InvalidGuardian();
                }
                if (_approvers[i] == address(this)) {
                    if (onChainOwnerApproval) {
                        revert SignatureMigrationFacet__OwnerAlreadyApproved();
                    }
                    ownerApproved = true;
                }
                if (
                    !SignatureChecker.isValidSignatureNow(
                        _approvers[i],
                        migrationPublicKeyHash,
                        _signatures[i]
                    )
                ) {
                    revert SignatureMigrationFacet__InvalidApproverSignature();
                }
                unchecked {
                    ++i;
                }
            }

            if (!ownerApproved && !onChainOwnerApproval) {
                revert SignatureMigrationFacet__LackOfOwnerApproval();
            }
        }
        _migrateSignatureScheme(
            _newVerificationFacet,
            _newPublicKey,
            _newVerificationFuncSelectors
        );
    }

    /**
     * @notice Internal function that moves signature mgiration to a pending state.
     * @dev This method increments migration nonce and sets the migration in the migration config. Emits events for migration execution
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     */
    function _migrateSignatureScheme(
        address _newVerificationFacet,
        bytes memory _newPublicKey,
        bytes4[] memory _newVerificationFuncSelectors
    ) internal {
        SignatureMigrationStorage storage ms = LibFacetStorage
            .migrationStorage();
        unchecked {
            ++ms.nonce;
        }
        uint64 migrateAfter = uint64(block.timestamp + getMigrationPeriod());

        ms.migrationConfigs[INNER_STRUCT] = SignatureMigrationConfig(
            _newPublicKey,
            _newVerificationFacet,
            _newVerificationFuncSelectors,
            migrateAfter
        );

        emit SignatureMigrationExecuted(
            _newVerificationFacet,
            _newPublicKey,
            _newVerificationFuncSelectors,
            migrateAfter
        );
    }

    /**
     * @notice Approves signature scheme migration on-chain. This can be called by owner or guardian only when the account is unlocked.
     *         When the threshold of the migration approval passed and owner approval is granted, it automatically moves migration to a pending state
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     */
    function approveSignatureSchemeMigration(
        address _newVerificationFacet,
        bytes calldata _newPublicKey,
        bytes4[] calldata _newVerificationFuncSelectors
    )
        public
        override
        onlyGuardianOrOwner
        onlyWhenUnlocked
        validateKeyType(_newPublicKey, _newVerificationFacet)
    {
        {
            _checkMigrationCutValidity(
                _newVerificationFacet,
                _newVerificationFuncSelectors
            );
        }

        SignatureMigrationApprovalConfig storage ms = LibFacetStorage
            .migrationStorage()
            .migrationApprovalConfigs[INNER_STRUCT];
        bytes32 migrationPublicKeyHash = getApprovalMigrationKeyHash(
            _newPublicKey,
            _newVerificationFacet,
            _newVerificationFuncSelectors,
            "MigrateSignature"
        );
        uint64 approvalValidUntil = uint64(
            block.timestamp + getApprovalValidationPeriod()
        );
        ms.isMigrationApproved[migrationPublicKeyHash][
            msg.sender
        ] = ApprovalConfig(true, approvalValidUntil);
        emit SignatureMigrationApproved(
            _newPublicKey,
            _newVerificationFacet,
            _newVerificationFuncSelectors,
            msg.sender,
            approvalValidUntil
        );
        if (
            getMigrationApprovalCountWithTimeValidity(migrationPublicKeyHash) >=
            LibGuardian.majorityOfGuardians() &&
            getMigrationOwnerApprovalWithTimeValidity(migrationPublicKeyHash)
        ) {
            _migrateSignatureScheme(
                _newVerificationFacet,
                _newPublicKey,
                _newVerificationFuncSelectors
            );
        }
    }

    /**
     * @notice Revokes the approval of signature migration done on-chain. Emits revoke event when revoked.
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     */
    function revokeSignatureMigrationApproval(
        address _newVerificationFacet,
        bytes calldata _newPublicKey,
        bytes4[] calldata _newVerificationFuncSelectors
    )
        external
        override
        onlyGuardianOrOwner
        onlyWhenUnlocked
        validateKeyType(_newPublicKey, _newVerificationFacet)
    {
        SignatureMigrationApprovalConfig storage ms = LibFacetStorage
            .migrationStorage()
            .migrationApprovalConfigs[INNER_STRUCT];
        bytes32 migrationPublicKeyHash = getApprovalMigrationKeyHash(
            _newPublicKey,
            _newVerificationFacet,
            _newVerificationFuncSelectors,
            "MigrateSignature"
        );
        if (!isMigrationApproved(migrationPublicKeyHash, msg.sender)) {
            revert SignatureMigrationFacet__CannotRevokeUnapproved();
        }

        ms.isMigrationApproved[migrationPublicKeyHash][
            msg.sender
        ] = ApprovalConfig(false, 0);
        emit SignatureMigrationApprovalRevoked(
            _newPublicKey,
            _newVerificationFacet,
            _newVerificationFuncSelectors,
            msg.sender
        );
    }

    /**
     * @notice Finalizes the pending signature scheme migration. This function can only be called by owner.
     *         It removes the facets of the previous verification facet and adds the new verification facet.
     *         After finalizing migration, it emits migration event which shows the change of the verification facet
     */
    function finalizeSignatureMigration() external override {
        // NOTE: Only owner can call this function
        LibDiamond.enforceIsSelf();

        SignatureMigrationStorage storage ms = LibFacetStorage
            .migrationStorage();

        if (!isMigrationPending()) {
            revert SignatureMigrationFacet__NonexistentMigration();
        }

        if (
            uint64(block.timestamp) <=
            ms.migrationConfigs[INNER_STRUCT].migrateAfter
        ) {
            revert SignatureMigrationFacet__MigrationPeriodNotOver();
        }
        address newVerificationFacet = ms
            .migrationConfigs[INNER_STRUCT]
            .migrationVerificationFacet;
        bytes4[] memory newVerificationFuncSelectors = ms
            .migrationConfigs[INNER_STRUCT]
            .migrationSelectors;
        bytes memory newPublicKey = ms
            .migrationConfigs[INNER_STRUCT]
            .migrationPublicKey;

        address prevVerificationFacet = LibLoupe.facetAddress(
            s.validateOwnerSignatureSelector
        );
        if (prevVerificationFacet == address(0)) {
            revert SignatureMigrationFacet__NonExistentVerificationFacet();
        }

        IDiamondCut.FacetCut[] memory UninitCut;
        IDiamondCut.FacetCut[] memory InitCut;
        {
            bytes4[] memory prevVerificationFuncSelectors = LibLoupe
                .facetFunctionSelectors(prevVerificationFacet);

            UninitCut = new IDiamondCut.FacetCut[](1);
            InitCut = new IDiamondCut.FacetCut[](1);
            UninitCut[0] = IDiamondCut.FacetCut({
                facetAddress: address(0),
                action: IDiamondCut.FacetCutAction.Remove,
                functionSelectors: prevVerificationFuncSelectors
            });
            InitCut[0] = IDiamondCut.FacetCut({
                facetAddress: newVerificationFacet,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: newVerificationFuncSelectors
            });
            {
                IDiamondCut.FacetCut[]
                    memory facetCuts = new IDiamondCut.FacetCut[](2);
                facetCuts[0] = UninitCut[0];
                facetCuts[1] = InitCut[0];
                _checkFacetCutValidity(facetCuts);
            }
            LibAppStorage.initiateSignerMigration();
            address verificationFacet = address(
                bytes20(
                    LibDiamond.diamondStorage().facets[
                        s.validateOwnerSignatureSelector
                    ]
                )
            );

            (bool uninitSuccess, bytes memory uninitResult) = verificationFacet
                .delegatecall(UNINIT_CALL);
            if (!uninitSuccess || uint256(bytes32(uninitResult)) != 1) {
                revert SignatureMigrationFacet__SignerUninitializationFailure();
            }
            LibAppStorage.finalizeSignerMigration();

            LibDiamond.diamondCut(UninitCut, address(0), "");
        }
        {
            bytes memory initCall = abi.encodeWithSignature(
                "initializeSigner(bytes)",
                newPublicKey
            );

            // Every Verification Facet should comply with initializeSigner(bytes)
            // to be compatible with the Barz contract(for initialization)
            LibDiamond.diamondCut(InitCut, address(0), "");
            (bool initSuccess, bytes memory initResult) = newVerificationFacet
                .delegatecall(initCall);
            if (!initSuccess || uint256(bytes32(initResult)) != 1) {
                revert SignatureMigrationFacet__SignerInitializationFailure();
            }

            emit SignatureSchemeMigration(
                prevVerificationFacet,
                newVerificationFacet,
                newPublicKey,
                newVerificationFuncSelectors
            );
        }
    }

    /**
     * @notice Approve cancellation of signature migration. If cancellation approval passes guardian threshold with owner approval
     *         it automatically cancels the migration.
     * @dev This method checks if the caller is one of guardian or owner and sets true for the cancellation hash in the approval config.
     *      It internally calls _cancelSignatureMigration for canceling the migration
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     */
    function approveCancelSignatureMigration(
        address _newVerificationFacet,
        bytes calldata _newPublicKey,
        bytes4[] calldata _newVerificationFuncSelectors
    )
        external
        override
        onlyGuardianOrOwner
        onlyWhenUnlocked
        validateKeyType(_newPublicKey, _newVerificationFacet)
    {
        SignatureMigrationApprovalConfig storage ms = LibFacetStorage
            .migrationStorage()
            .migrationApprovalConfigs[INNER_STRUCT];
        bytes32 migrationPublicKeyHash = getApprovalMigrationKeyHash(
            _newPublicKey,
            _newVerificationFacet,
            _newVerificationFuncSelectors,
            "CancelSignatureMigration"
        );
        uint64 approvalValidUntil = uint64(
            block.timestamp + getApprovalValidationPeriod()
        );
        ms.isMigrationApproved[migrationPublicKeyHash][
            msg.sender
        ] = ApprovalConfig(true, approvalValidUntil);
        emit SignatureMigrationCancellationApproved(
            _newVerificationFacet,
            _newPublicKey,
            _newVerificationFuncSelectors
        );
        if (
            getMigrationApprovalCountWithTimeValidity(migrationPublicKeyHash) >=
            LibGuardian.majorityOfGuardians() &&
            getMigrationOwnerApprovalWithTimeValidity(migrationPublicKeyHash)
        ) {
            _cancelSignatureMigration(
                _newVerificationFacet,
                _newPublicKey,
                _newVerificationFuncSelectors
            );
        }
    }

    /**
     * @notice Verifies the signature of guardians/owner and cancels the signature migration.
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     * @param _approvers List of approvers. This could include owner
     */
    function cancelSignatureMigration(
        address _newVerificationFacet,
        bytes calldata _newPublicKey,
        bytes4[] calldata _newVerificationFuncSelectors,
        address[] calldata _approvers,
        bytes[] calldata _signatures
    )
        external
        override
        validateKeyType(_newPublicKey, _newVerificationFacet)
        onlyWhenUnlocked
    {
        if (_approvers.length != _signatures.length) {
            revert SignatureMigrationFacet__InvalidArrayLength();
        }

        bytes32 migrationPublicKeyHash = getApprovalMigrationKeyHash(
            _newPublicKey,
            _newVerificationFacet,
            _newVerificationFuncSelectors,
            "CancelSignatureMigration"
        );

        _checkApprover(_approvers);
        _checkDuplicateOnChainApprover(migrationPublicKeyHash, _approvers);

        bool onChainOwnerApproval = getMigrationOwnerApprovalWithTimeValidity(
            migrationPublicKeyHash
        );
        uint256 threshold = onChainOwnerApproval ? 0 : 1;
        if (
            _approvers.length +
                getMigrationApprovalCountWithTimeValidity(
                    migrationPublicKeyHash
                ) <
            LibGuardian.majorityOfGuardians() + threshold
        ) {
            revert SignatureMigrationFacet__InsufficientApprovers();
        }
        {
            // To prevent stack too deep
            bool ownerApproved;
            for (uint256 i; i < _approvers.length; ) {
                if (
                    !LibGuardian.isGuardian(_approvers[i]) &&
                    address(this) != _approvers[i]
                ) {
                    revert SignatureMigrationFacet__NonExistentApprover();
                }
                if (_approvers[i] == address(this)) {
                    if (onChainOwnerApproval) {
                        revert SignatureMigrationFacet__OwnerAlreadyApproved();
                    }
                    ownerApproved = true;
                }
                if (
                    !SignatureChecker.isValidSignatureNow(
                        _approvers[i],
                        migrationPublicKeyHash,
                        _signatures[i]
                    )
                ) {
                    revert SignatureMigrationFacet__InvalidApproverSignature();
                }
                unchecked {
                    ++i;
                }
            }
            if (!ownerApproved && !onChainOwnerApproval) {
                revert SignatureMigrationFacet__LackOfOwnerApproval();
            }
        }
        _cancelSignatureMigration(
            _newVerificationFacet,
            _newPublicKey,
            _newVerificationFuncSelectors
        );
    }

    /**
     * @notice Internal function that cancels signature migration.
     * @dev This method increments migration nonce and deletes the migration from the migration config. Emits events for migration cancellation
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     */
    function _cancelSignatureMigration(
        address _newVerificationFacet,
        bytes memory _newPublicKey,
        bytes4[] memory _newVerificationFuncSelectors
    ) internal {
        if (!isMigrationPending())
            revert SignatureMigrationFacet__NonexistentMigration();
        SignatureMigrationStorage storage ms = LibFacetStorage
            .migrationStorage();
        unchecked {
            ++ms.nonce;
        }
        delete ms.migrationConfigs[INNER_STRUCT];
        emit SignatureMigrationCanceled(
            _newVerificationFacet,
            _newPublicKey,
            _newVerificationFuncSelectors
        );
    }

    /**
     * @notice Checks if the facets to be added from new verification facet is registered to facet registry
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     */
    function _checkMigrationCutValidity(
        address _newVerificationFacet,
        bytes4[] memory _newVerificationFuncSelectors
    ) internal view {
        IDiamondCut.FacetCut[] memory facetCuts = new IDiamondCut.FacetCut[](1);
        facetCuts[0] = IDiamondCut.FacetCut({
            facetAddress: _newVerificationFacet,
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: _newVerificationFuncSelectors
        });
        _checkFacetCutValidity(facetCuts);
    }

    /**
     * @notice Returns if the migration is pending of not
     * @dev This method fetches the migration storage and checks if the migrate after is above 0 value
     * @return isPending Bool value that shows if the migration is pending
     */
    function isMigrationPending()
        public
        view
        override
        returns (bool isPending)
    {
        SignatureMigrationStorage storage rs = LibFacetStorage
            .migrationStorage();
        isPending = rs.migrationConfigs[INNER_STRUCT].migrateAfter > 0;
    }

    /**
     * @notice Returns the migration hash. This function ensures that this hash is safe from replay attack by including
     *         public key, verification facet, function selectors, salt, address, chainId, and nonce.
     * @param _newPublicKey Public key that will be used for the new verification facet that replaces the previous one
     * @param _newVerificationFacet Verification facet that will replace the existing verification facet
     * @param _newVerificationFuncSelectors Function Selectors of new verification facet that will be added to the diamond
     * @param _saltString Salt value for generating the migration hash
     * @return migrationKeyHash Bytes32 string of the migration key hash
     */
    function getApprovalMigrationKeyHash(
        bytes memory _newPublicKey,
        address _newVerificationFacet,
        bytes4[] memory _newVerificationFuncSelectors,
        string memory _saltString
    ) public view override returns (bytes32 migrationKeyHash) {
        migrationKeyHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encode(
                        _newPublicKey,
                        _newVerificationFacet,
                        keccak256(abi.encode(_newVerificationFuncSelectors)),
                        _saltString,
                        address(this),
                        block.chainid,
                        LibFacetStorage.migrationStorage().nonce
                    )
                )
            )
        );
    }

    /**
     * @notice Checks if the owner approved the hash for migration
     * @param _migrationPublicKeyHash Hash of the public key and configuration for migration
     * @return isApprovedByOwner Bool value of showing if the owner approved it or not
     */
    function getMigrationOwnerApprovalWithTimeValidity(
        bytes32 _migrationPublicKeyHash
    ) public view override returns (bool isApprovedByOwner) {
        isApprovedByOwner = isMigrationApproved(
            _migrationPublicKeyHash,
            address(this)
        );
    }

    /**
     * @notice Checks how many of the guardians approved the migration hash
     * @param _migrationPublicKeyHash Hash of the public key and configuration for migration
     * @return approvalCount Number of approvals
     */
    function getMigrationApprovalCountWithTimeValidity(
        bytes32 _migrationPublicKeyHash
    ) public view override returns (uint256 approvalCount) {
        address[] memory guardians = LibGuardian.getGuardians();
        uint256 guardiansLength = guardians.length;
        for (uint256 i; i < guardiansLength; ) {
            if (isMigrationApproved(_migrationPublicKeyHash, guardians[i])) {
                unchecked {
                    ++approvalCount;
                }
            }
            unchecked {
                ++i;
            }
        }
        return approvalCount;
    }

    /**
     * @notice Checks if the migration is approved by the given approver
     * @param _migrationPublicKeyHash Hash of the public key and configuration for migration
     * @param _approver Address of approver
     * @return isApproved Bool value if migration hash is approved
     */
    function isMigrationApproved(
        bytes32 _migrationPublicKeyHash,
        address _approver
    ) public view override returns (bool isApproved) {
        SignatureMigrationApprovalConfig storage ms = LibFacetStorage
            .migrationStorage()
            .migrationApprovalConfigs[INNER_STRUCT];
        isApproved = (ms
        .isMigrationApproved[_migrationPublicKeyHash][_approver].isApproved &&
            block.timestamp <
            ms
            .isMigrationApproved[_migrationPublicKeyHash][_approver]
                .validUntil);
    }

    /**
     * @notice Checks if their is duplicate approver is included in off-chain approval verification and on-chain approval
     *         Approvers who approved on-chain should not be included in the off-chain approval
     * @param _migrationPublicKeyHash Hash of migration information
     * @param _approvers List of approver addresses
     */
    function _checkDuplicateOnChainApprover(
        bytes32 _migrationPublicKeyHash,
        address[] memory _approvers
    ) public view {
        address[] memory guardians = LibGuardian.getGuardians();
        uint256 guardianLength = guardians.length;
        uint256 approversLength = _approvers.length;
        for (uint256 i; i < guardianLength; ) {
            if (isMigrationApproved(_migrationPublicKeyHash, guardians[i])) {
                for (uint256 j; j < approversLength; ) {
                    if (_approvers[j] == guardians[i])
                        revert SignatureMigrationFacet__DuplicateApproval();
                    unchecked {
                        ++j;
                    }
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Returns the migration period of this wallet
     * @dev This method fetches the migration period from the security manager
     * @return migrationPeriod Migration period of Barz contract fetched from security manager
     */
    function getMigrationPeriod()
        internal
        view
        returns (uint128 migrationPeriod)
    {
        migrationPeriod = securityManager.migrationPeriodOf(address(this));
        if (migrationPeriod == 0)
            revert SignatureMigrationFacet__InvalidMigrationPeriod();
    }

    /**
     * @notice Returns the validation period of this wallet
     * @dev This method fetches the validation period from the security manager
     * @return approvalValidationPeriod Validation period of Barz contract fetched from security manager
     */
    function getApprovalValidationPeriod()
        internal
        view
        returns (uint256 approvalValidationPeriod)
    {
        approvalValidationPeriod = securityManager.approvalValidationPeriodOf(
            address(this)
        );
        if (approvalValidationPeriod == 0)
            revert SignatureMigrationFacet__InvalidApprovalValidationPeriod();
    }

    /**
     * @notice Returns the migration nonce of this wallet
     * @dev This method fetches the nonce from migration storage
     * @return migrationNonce Nonce of migration to protect from reply attacks
     */
    function getMigrationNonce()
        public
        view
        override
        returns (uint128 migrationNonce)
    {
        migrationNonce = LibFacetStorage.migrationStorage().nonce;
    }

    /**
     * @notice Returns the migration configuration of this wallet
     * @dev This method fetches the migration config from the migration storage
     * @return pendingMigrationConfig Migration config currently pending for signature migration
     */
    function getPendingMigration()
        external
        view
        override
        returns (SignatureMigrationConfig memory pendingMigrationConfig)
    {
        pendingMigrationConfig = LibFacetStorage
            .migrationStorage()
            .migrationConfigs[INNER_STRUCT];
    }
}
