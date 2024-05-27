// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {ReentrancyGuard} from "./ReentrancyGuard.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {LibAppStorage} from "../libraries/LibAppStorage.sol";
import {LibFacetStorage, RestrictionsStorage} from "../libraries/LibFacetStorage.sol";
import {IRestriction} from "../restrictions/IRestriction.sol";
import {IRestrictionsFacet} from "./interfaces/IRestrictionsFacet.sol";

/**
 * @title Restrictions facet
 * @dev Responsible for storing and verifying different kinds of restrictions, for example:
 *         - Whitelist / Blacklist
 *         - Daily limits
 *         - Trading time restrictions
 * @author Ruslan Serebriakov (@rsrbk)
 */
contract RestrictionsFacet is IRestrictionsFacet, ReentrancyGuard {
    /**
     * @notice This constructor ensures that this contract can only be used as singleton for Proxy contracts
     */
    constructor() {
        LibAppStorage.enforceRestrictionsInitialize();
    }

    /**
     * @notice Intialize restrictions of Barz. Restrictions facet call restriction contracts for restriction validation
     *         before each call
     * @param _restrictions The initial array of restrictions.
     * @return initSuccess Int value showing if the initialization of restriction is successful
     */
    function initializeRestrictions(
        address[] calldata _restrictions
    ) public override returns (uint256 initSuccess) {
        LibDiamond.enforceIsSelf();
        LibAppStorage.enforceRestrictionsInitialize();

        if (_restrictions.length == 0) {
            // You can't initialize RestrictionsFacet with an empty list of restrictions
            revert RestrictionsFacet__EmptyRestrictionsList();
        }
        for (uint256 i; i < _restrictions.length; ) {
            if (_restrictions[i] == address(0))
                revert RestrictionsFacet__ZeroAddressRestrictions();
            unchecked {
                ++i;
            }
        }

        LibFacetStorage.restrictionsStorage().restrictions = _restrictions;
        _updateRestrictionsMap(_restrictions, true);
        initSuccess = 1;
    }

    /**
     * @notice Unitialize restrictions of Barz
     * @return uninitSuccess Int value showing if the initialization of restriction is successful
     */
    function uninitializeRestrictions()
        external
        override
        returns (uint256 uninitSuccess)
    {
        LibDiamond.enforceIsSelf();
        LibAppStorage.setRestrictionsUninitialized();
        RestrictionsStorage storage restrictionsStorage = LibFacetStorage
            .restrictionsStorage();
        _updateRestrictionsMap(restrictionsStorage.restrictions, false);
        restrictionsStorage.restrictions = new address[](0);
        uninitSuccess = 1;
    }

    /**
     * @notice Returns the list of Restrictions contract address
     * @return restrictions Addresses of IRestriction which are currently active
     */
    function getRestrictions()
        public
        view
        override
        returns (address[] memory restrictions)
    {
        RestrictionsStorage storage restrictionsStorage = LibFacetStorage
            .restrictionsStorage();
        restrictions = restrictionsStorage.restrictions;
    }

    /**
     * @notice Adds restrictions to Barz with validation on the restriction contract address.
     *         This method is only callable by the owner(self).
     * @param _restriction The address of the restriction to be added.
     */
    function addRestriction(address _restriction) external override {
        LibDiamond.enforceIsSelf();
        if (LibDiamond.restrictionsFacet() == address(0)) {
            revert RestrictionsFacet__ZeroAddressRestrictionsFacet();
        }
        RestrictionsStorage storage restrictionsStorage = LibFacetStorage
            .restrictionsStorage();
        if (_restriction == address(0)) {
            revert RestrictionsFacet__ZeroAddressRestrictions();
        }
        if (restrictionsStorage.exists[_restriction]) {
            revert RestrictionsFacet__RestrictionAlreadyExists();
        }

        restrictionsStorage.restrictions.push(_restriction);
        restrictionsStorage.exists[_restriction] = true;

        emit RestrictionAdded(_restriction);
    }

    /**
     * @notice Remove restrictions from Barz if it existed. This method is only callable by the owner(self).
     * @param _restriction The address of the restriction to be removed.
     */
    function removeRestriction(address _restriction) external override {
        LibDiamond.enforceIsSelf();
        RestrictionsStorage storage restrictionsStorage = LibFacetStorage
            .restrictionsStorage();

        if (!restrictionsStorage.exists[_restriction]) {
            revert RestrictionsFacet__RestrictionNotFound();
        }

        address[] storage restrictions = restrictionsStorage.restrictions;

        uint256 indexToDelete = restrictions.length;
        uint256 restrictionsLen = restrictions.length;
        for (uint256 i; i < restrictionsLen; ) {
            if (restrictions[i] == _restriction) {
                indexToDelete = i;
                break;
            }
            unchecked {
                ++i;
            }
        }

        if (indexToDelete == 0 && restrictionsLen == 1) {
            revert RestrictionsFacet__RemainingRestrictionsCantBeEmpty();
        } else if (indexToDelete == restrictionsLen) {
            revert RestrictionsFacet__RestrictionNotFound();
        } else {
            restrictions[indexToDelete] = restrictions[restrictionsLen - 1];
            restrictions.pop();
        }

        restrictionsStorage.exists[_restriction] = false;
        emit RestrictionRemoved(_restriction);
    }

    /**
     * @notice Sets the restrictions address value mapping to true or false when adding/removing restriction contracts
     * @param _restrictions List of restriction contracts address
     * @param _newValue Bool value to flag to the list of restrictions contracts
     */
    function _updateRestrictionsMap(
        address[] memory _restrictions,
        bool _newValue
    ) internal {
        RestrictionsStorage storage restrictionsStorage = LibFacetStorage
            .restrictionsStorage();

        uint restrictionsLen = _restrictions.length;
        for (uint256 i; i < restrictionsLen; ) {
            restrictionsStorage.exists[_restrictions[i]] = _newValue;
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Iterates over all restrictions and verifies each of them with the transaction parameters.
     * @param _from The address of the sender, that will be signing the transaction.
     * @param _to The receiving address.
     * @param _value Amount of ETH to transfer from sender to recipient.
     * @param _calldata Optional field to include arbitrary data.
     * @return 0 if all the checks passed, 1 otherwise.
     */
    function verifyRestrictions(
        address _from,
        address _to,
        uint256 _value,
        bytes calldata _calldata
    ) external nonReentrant returns (uint256) {
        RestrictionsStorage storage restrictionsStorage = LibFacetStorage
            .restrictionsStorage();

        uint restrictionsLen = restrictionsStorage.restrictions.length;
        for (uint256 i; i < restrictionsLen; ) {
            IRestriction restriction = IRestriction(
                restrictionsStorage.restrictions[i]
            );
            bool checkPassed = restriction.check(_from, _to, _value, _calldata);
            if (!checkPassed) {
                return 1;
            }
            unchecked {
                ++i;
            }
        }

        return 0;
    }
}
