// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {LibDiamond} from "../../libraries/LibDiamond.sol";
import {LibGuardian} from "../../libraries/LibGuardian.sol";
import {ISecurityManager} from "../../infrastructure/interfaces/ISecurityManager.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {LibFacetStorage, DiamondCutApprovalConfig, ApprovalConfig} from "../../libraries/LibFacetStorage.sol";
import {Modifiers} from "../Modifiers.sol";
import {IDiamondCut} from "./interfaces/IDiamondCut.sol";

/**
 * @title DiamondCut Facet
 * @dev Responsible for adding/removing/replace facets in Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract DiamondCutFacet is Modifiers, IDiamondCut {
    ISecurityManager public immutable securityManager;

    /**
     * @notice This constructor sets the Security Manager address which is an immutable variable.
     *         Immutable variables do not impact the storage of diamond
     * @param _securityManager Security Manager contract that holds the security related variables for all wallets
     */
    constructor(address _securityManager) {
        securityManager = ISecurityManager(_securityManager);
    }

    /**
     * @notice Updates the flag for the interfaceId
     * @param _interfaceId InterfaceID to update the mapping
     * @param _flag Bool value to update the mapping of the given interface ID
     */
    function updateSupportsInterface(
        bytes4 _interfaceId,
        bool _flag
    ) external override onlyWhenUnlocked {
        LibDiamond.enforceIsSelf();
        LibDiamond.diamondStorage().supportedInterfaces[_interfaceId] = _flag;
        emit SupportsInterfaceUpdated(_interfaceId, _flag);
    }

    /**
     * @notice Add/replace/remove any number of functions and optionally execute
     *         a function with delegatecall when guardians don't exist
     * @param _diamondCut Contains the facet addresses and function selectors
     * @param _init The address of the contract or facet to execute _calldata. It's prohibited in Barz
     */
    function diamondCut(
        FacetCut[] calldata _diamondCut,
        address _init,
        bytes calldata
    ) external override onlyWhenUnlocked {
        LibDiamond.enforceIsSelf();

        _checkFacetCutValidity(_diamondCut);
        // require approval from guardian if guardian exists
        if (0 != LibGuardian.guardianCount())
            revert DiamondCutFacet__InvalidRouteWithGuardian();
        if (address(0) != _init) revert DiamondCutFacet__InvalidInitAddress();

        unchecked {
            ++LibFacetStorage.diamondCutStorage().nonce;
        }
        LibDiamond.diamondCut(_diamondCut, address(0), "");
    }

    /**
     * @notice Add/replace/remove any number of functions and optionally execute
     *         a function with delegatecall when guardians exist
     * @param _diamondCut Contains the facet addresses and function selectors
     * @param _approvers Guardian or owner address that approves the diamond cut
     * @param _signatures Signature of Guardians or owner that approves the diamond cut
     */
    function diamondCutWithGuardian(
        FacetCut[] calldata _diamondCut,
        address[] calldata _approvers,
        bytes[] calldata _signatures
    ) external override onlyWhenUnlocked {
        if (_approvers.length != _signatures.length)
            revert DiamondCutFacet__InvalidArrayLength();
        _checkFacetCutValidity(_diamondCut);
        if (0 == LibGuardian.guardianCount())
            revert DiamondCutFacet__InvalidRouteWithGuardian();

        bytes32 cutHash = getDiamondCutHash(_diamondCut);

        _checkApprover(_approvers);
        _checkDuplicateOnChainApprover(cutHash, _approvers);

        bool onChainOwnerApproval = getOwnerCutApprovalWithTimeValidity(
            cutHash
        );

        uint256 threshold = onChainOwnerApproval ? 0 : 1;
        if (
            _approvers.length +
                getDiamondCutApprovalCountWithTimeValidity(cutHash) <
            LibGuardian.majorityOfGuardians() + threshold
        ) revert DiamondCutFacet__InsufficientApprovers();

        bool ownerApproved;
        for (uint256 i; i < _approvers.length; ) {
            if (
                !LibGuardian.isGuardian(_approvers[i]) &&
                _approvers[i] != address(this)
            ) revert DiamondCutFacet__InvalidApprover();
            if (_approvers[i] == address(this)) {
                if (onChainOwnerApproval)
                    revert DiamondCutFacet__OwnerAlreadyApproved();
                ownerApproved = true;
            }
            if (
                !SignatureChecker.isValidSignatureNow(
                    _approvers[i],
                    cutHash,
                    _signatures[i]
                )
            ) revert DiamondCutFacet__InvalidApproverSignature();
            unchecked {
                ++i;
            }
        }
        if (!ownerApproved && !onChainOwnerApproval)
            revert DiamondCutFacet__LackOfOwnerApproval();

        unchecked {
            ++LibFacetStorage.diamondCutStorage().nonce;
        }
        LibDiamond.diamondCut(_diamondCut, address(0), "");
    }

    /**
     * @notice Approves diamond cut. This can only be called directly from guardian or owner
     * @param _diamondCut Contains the facet addresses and function selectors
     */
    function approveDiamondCut(
        FacetCut[] calldata _diamondCut
    ) public override onlyGuardianOrOwner onlyWhenUnlocked {
        if (LibGuardian.guardianCount() == 0)
            revert DiamondCutFacet__InvalidRouteWithoutGuardian();
        DiamondCutApprovalConfig storage ds = LibFacetStorage
            .diamondCutStorage()
            .diamondCutApprovalConfigs[INNER_STRUCT];
        _checkFacetCutValidity(_diamondCut);

        bytes32 cutHash = getDiamondCutHash(_diamondCut);
        uint64 approvalValidUntil = uint64(
            block.timestamp + getApprovalValidationPeriod()
        );
        ds.isDiamondCutApproved[cutHash][msg.sender] = ApprovalConfig(
            true,
            approvalValidUntil
        );
        emit DiamondCutApproved(_diamondCut);
        if (
            (getDiamondCutApprovalCountWithTimeValidity(cutHash) >=
                LibGuardian.majorityOfGuardians()) &&
            getOwnerCutApprovalWithTimeValidity(cutHash)
        ) {
            unchecked {
                ++LibFacetStorage.diamondCutStorage().nonce;
            }
            LibDiamond.diamondCut(_diamondCut, address(0), "");
        }
    }

    /**
     * @notice Revokes the approval of diamond cut. This can only be called directly from guardian or owner
     * @param _diamondCut Contains the facet addresses and function selectors
     */
    function revokeDiamondCutApproval(
        FacetCut[] calldata _diamondCut
    ) public override onlyGuardianOrOwner onlyWhenUnlocked {
        DiamondCutApprovalConfig storage ds = LibFacetStorage
            .diamondCutStorage()
            .diamondCutApprovalConfigs[INNER_STRUCT];
        bytes32 cutHash = getDiamondCutHash(_diamondCut);
        if (!ds.isDiamondCutApproved[cutHash][msg.sender].isApproved)
            revert DiamondCutFacet__CannotRevokeUnapproved();
        ds.isDiamondCutApproved[cutHash][msg.sender] = ApprovalConfig(false, 0);
        emit DiamondCutApprovalRevoked(_diamondCut);
    }

    /**
     * @notice Gets the number of approvals of diamond cut from guardians
     * @param _diamondCutHash Hash of diamondCut information including the facet addresses and function selectors
     */
    function getDiamondCutApprovalCountWithTimeValidity(
        bytes32 _diamondCutHash
    ) public view override returns (uint256 approvalCount) {
        address[] memory guardians = LibGuardian.getGuardians();
        uint256 guardiansLength = guardians.length;
        for (uint256 i; i < guardiansLength; ) {
            if (isCutApproved(_diamondCutHash, guardians[i])) {
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
     * @notice Returns if the owner has approved the diamond cut
     * @param _diamondCutHash Hash of diamondCut information including the facet addresses and function selectors
     * @return isApprovedByOwner Bool value showing if the owner approved the cut
     */
    function getOwnerCutApprovalWithTimeValidity(
        bytes32 _diamondCutHash
    ) public view override returns (bool isApprovedByOwner) {
        isApprovedByOwner = isCutApproved(_diamondCutHash, address(this));
    }

    /**
     * @notice Returns if the given approver has approved the diamond cut
     * @param _diamondCutHash Hash of diamondCut information including the facet addresses and function selectors
     * @param _approver Address of approver
     * @return isApproved Bool value showing if the approver approved the cut
     */
    function isCutApproved(
        bytes32 _diamondCutHash,
        address _approver
    ) public view override returns (bool isApproved) {
        DiamondCutApprovalConfig storage ds = LibFacetStorage
            .diamondCutStorage()
            .diamondCutApprovalConfigs[INNER_STRUCT];
        isApproved = (ds
        .isDiamondCutApproved[_diamondCutHash][_approver].isApproved &&
            block.timestamp <
            ds.isDiamondCutApproved[_diamondCutHash][_approver].validUntil);
    }

    /**
     * @notice Checks if their is duplicate approver is included in off-chain approval verification and on-chain approval
     *         Approvers who approved on-chain should not be included in the off-chain approval
     * @param _diamondCutHash Hash of diamondCut information including the facet addresses and function selectors
     * @param _approvers List of approver addresses
     */
    function _checkDuplicateOnChainApprover(
        bytes32 _diamondCutHash,
        address[] memory _approvers
    ) public view {
        address[] memory guardians = LibGuardian.getGuardians();
        uint256 guardianLength = guardians.length;
        uint256 approversLength = _approvers.length;
        for (uint256 i; i < guardianLength; ) {
            if (isCutApproved(_diamondCutHash, guardians[i])) {
                for (uint256 j; j < approversLength; ) {
                    if (_approvers[j] == guardians[i])
                        revert DiamondCutFacet__DuplicateApproval();
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
     * @notice Returns the diamond cut hash. This function ensures that this hash is safe from replay attack by including
     *         salt, address, chainId, and nonce, etc.
     * @param _diamondCut Contains the facet addresses and function selectors
     * @return cutHash Diamond Cut Hash
     */
    function getDiamondCutHash(
        FacetCut[] calldata _diamondCut
    ) public view override returns (bytes32 cutHash) {
        cutHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encode(
                        keccak256(abi.encode(_diamondCut)),
                        address(this),
                        block.chainid,
                        LibFacetStorage.diamondCutStorage().nonce
                    )
                )
            )
        );
    }

    /**
     * @notice Returns the approval validation Period
     * @dev This method fetches the validation period from the security manager
     * @return approvalValidationPeriod Approval validation period of Barz contract fetched from security manager
     */
    function getApprovalValidationPeriod()
        internal
        view
        returns (uint256 approvalValidationPeriod)
    {
        approvalValidationPeriod = securityManager.approvalValidationPeriodOf(
            address(this)
        );
        if (approvalValidationPeriod <= 0)
            revert DiamondCutFacet__InvalidApprovalValidationPeriod();
    }

    /**
     * @notice Returns the diamond cut nonce of this wallet
     * @dev This method fetches the nonce from diamond cut storage
     * @return cutNonce Nonce of diamond cut to protect from reply attacks
     */
    function getDiamondCutNonce()
        public
        view
        override
        returns (uint128 cutNonce)
    {
        cutNonce = LibFacetStorage.diamondCutStorage().nonce;
    }
}
