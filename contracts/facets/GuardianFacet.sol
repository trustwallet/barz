// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import {LibFacetStorage, GuardianStorage, StorageConfig} from "../libraries/LibFacetStorage.sol";
import {LibGuardian} from "../libraries/LibGuardian.sol";
import {ISecurityManager} from "../infrastructure/interfaces/ISecurityManager.sol";
import {IGuardianFacet} from "./interfaces/IGuardianFacet.sol";
import {IVerificationFacet} from "./interfaces/IVerificationFacet.sol";

/**
 * @title Guardian Facet
 * @dev Contract that enables addition/removal of guardians from Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract GuardianFacet is IGuardianFacet {
    ISecurityManager public immutable securityManager;
    uint8 public constant INNER_STRUCT = 0;

    /**
     * @notice This constructor sets the Security Manager address which is an immutable variable.
     *         Immutable variables do not impact the storage of diamond
     * @param _securityManager Security Manager contract that holds the security related variables for all wallets
     */
    constructor(address _securityManager) {
        securityManager = ISecurityManager(_securityManager);
    }

    /**
     * @notice Add guardians to Barz.
     * @dev This method internally calls addGuardian which checks the validity of guardian address and adds
     *      as guardian if valid
     * @param _guardians Array of addresses to add as guardian
     */
    function addGuardians(address[] calldata _guardians) external override {
        LibDiamond.enforceIsSelf();
        for (uint256 i; i < _guardians.length; ) {
            addGuardian(_guardians[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Add a guardian to Barz.
     * @dev This method checks if the function is called by the owner and validates the address of guardian
     *      When the validation passes, guardian address is added to the pending state waiting for confirmation
     * @param _guardian Address to add as guardian
     */
    function addGuardian(address _guardian) public override {
        LibDiamond.enforceIsSelf();
        GuardianStorage storage gs = LibFacetStorage.guardianStorage();
        if (_guardian == address(this)) {
            revert GuardianFacet__GuardianCannotBeSelf();
        }
        if (isGuardian(_guardian)) {
            revert GuardianFacet__DuplicateGuardian();
        }
        if (_guardian == address(0)) {
            revert GuardianFacet__ZeroAddressGuardian();
        }
        if (
            keccak256(abi.encodePacked(_guardian)) ==
            keccak256(IVerificationFacet(address(this)).owner())
        ) {
            revert GuardianFacet__OwnerCannotBeGuardian();
        }

        bytes32 id = keccak256(abi.encodePacked(_guardian, "ADD"));
        if (
            gs.pending[id] != 0 ||
            block.timestamp <= gs.pending[id] + getSecurityWindow()
        ) {
            revert GuardianFacet__DuplicateGuardianAddition();
        }

        uint256 securityPeriod = getAdditionSecurityPeriod();
        gs.pending[id] = block.timestamp + securityPeriod;
        emit GuardianAdditionRequested(
            _guardian,
            block.timestamp + securityPeriod
        );
    }

    /**
     * @notice Remove guardians from Barz.
     * @dev This method internally calls removeGuardian which checks the validity of guardian and removes
     *      guardian when the request is valid
     * @param _guardians Array of addresses to be removed
     */
    function removeGuardians(address[] calldata _guardians) external override {
        LibDiamond.enforceIsSelf();
        for (uint256 i; i < _guardians.length; ) {
            removeGuardian(_guardians[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Remove a guardian from Barz.
     * @dev This method validates if the guardian to be removed is a guardian and puts the guardian removal
     *      to a pending state waiting to be confirmed.
     * @param _guardian Address of guardian to be removed
     */
    function removeGuardian(address _guardian) public override {
        LibDiamond.enforceIsSelf();
        if (!isGuardian(_guardian)) {
            revert GuardianFacet__NonExistentGuardian();
        }
        GuardianStorage storage gs = LibFacetStorage.guardianStorage();
        bytes32 id = keccak256(abi.encodePacked(_guardian, "REMOVE"));
        if (
            gs.pending[id] != 0 ||
            block.timestamp <= gs.pending[id] + getSecurityWindow()
        ) {
            revert GuardianFacet__DuplicateGuardianRemoval();
        }

        uint256 securityPeriod = getRemovalSecurityPeriod();
        gs.pending[id] = block.timestamp + securityPeriod;
        emit GuardianRemovalRequested(
            _guardian,
            block.timestamp + securityPeriod
        );
    }

    /**
     * @notice Confirm addition of guardians
     * @dev This method internally calls confirmGuardianAddition which checks the validity of pending request.
     *      Guardians are fully added when they pass the validation. Anyone can call this function.
     * @param _guardians Array of guardian addresses to be added
     */
    function confirmGuardianAdditions(
        address[] calldata _guardians
    ) external override {
        for (uint256 i; i < _guardians.length; ) {
            confirmGuardianAddition(_guardians[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Confirm addition of a guardian
     * @dev This method checks the validity of pending request.
     *      Guardians are fully added when they pass the validation. Anyone can call this function.
     * @param _guardian Guardian address to be added
     */
    function confirmGuardianAddition(address _guardian) public override {
        bytes32 id = keccak256(abi.encodePacked(_guardian, "ADD"));
        GuardianStorage storage gs = LibFacetStorage.guardianStorage();
        if (gs.pending[id] == 0) {
            revert GuardianFacet__UnknownPendingAddition();
        }
        if (gs.pending[id] >= block.timestamp) {
            revert GuardianFacet__PendingAdditionNotOver();
        }
        if (block.timestamp >= gs.pending[id] + getSecurityWindow()) {
            revert GuardianFacet__PendingAdditionExpired();
        }

        _addGuardian(_guardian);

        delete gs.pending[id];
        emit GuardianAdded(_guardian);
    }

    /**
     * @notice Confirm removal of guardians
     * @dev This method internally calls confirmGuardianRemoval to check the validity guardian removal confirmation.
     *      Guardians are fully removed when they pass the validation. Anyone can call this function.
     * @param _guardians Array of guardian addresses to be removed
     */
    function confirmGuardianRemovals(
        address[] calldata _guardians
    ) external override {
        for (uint256 i; i < _guardians.length; ) {
            confirmGuardianRemoval(_guardians[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Confirm removal of a guardian
     * @dev This method checks the validity guardian removal confirmation.
     *      Guardian is fully removed when they pass the validation. Anyone can call this function.
     * @param _guardian Guardian address to be removed
     */
    function confirmGuardianRemoval(address _guardian) public override {
        bytes32 id = keccak256(abi.encodePacked(_guardian, "REMOVE"));
        GuardianStorage storage gs = LibFacetStorage.guardianStorage();
        if (gs.pending[id] == 0) {
            revert GuardianFacet__UnknownPendingRemoval();
        }
        if (gs.pending[id] >= block.timestamp) {
            revert GuardianFacet__PendingRemovalNotOver();
        }
        if (block.timestamp >= gs.pending[id] + getSecurityWindow()) {
            revert GuardianFacet__PendingAdditionExpired();
        }

        _removeGuardian(_guardian);
        delete gs.pending[id];
        emit GuardianRemoved(_guardian);
    }

    /**
     * @notice Cancel pending guardian addition
     * @dev This method checks if the previous request for guardian request exists.
     *      It reverts if previous request is not pending and cancels the addition otherwise.
     * @param _guardian Guardian address to be canceled from addition
     */
    function cancelGuardianAddition(address _guardian) external override {
        LibDiamond.enforceIsSelf();
        bytes32 id = keccak256(abi.encodePacked(_guardian, "ADD"));
        GuardianStorage storage gs = LibFacetStorage.guardianStorage();
        if (gs.pending[id] == 0) {
            revert GuardianFacet__UnknownPendingAddition();
        }
        delete gs.pending[id];
        emit GuardianAdditionCancelled(_guardian);
    }

    /**
     * @notice Cancel pending guardian removal
     * @dev This method checks if the previous request for guardian request exists.
     *      It reverts if previous request is not pending and cancels the removal otherwise.
     * @param _guardian Guardian address to be canceled from removal
     */
    function cancelGuardianRemoval(address _guardian) external override {
        LibDiamond.enforceIsSelf();
        bytes32 id = keccak256(abi.encodePacked(_guardian, "REMOVE"));
        GuardianStorage storage gs = LibFacetStorage.guardianStorage();
        if (gs.pending[id] == 0) {
            revert GuardianFacet__UnknownPendingRemoval();
        }
        delete gs.pending[id];
        emit GuardianRemovalCancelled(_guardian);
    }

    /**
     * @notice Get the addition security period of current account from security manager
     * @dev This method returns the uint value if addition security period
     * @return additionSecurityPeriod Uint256 value of addition security period
     */
    function getAdditionSecurityPeriod()
        public
        view
        override
        returns (uint256 additionSecurityPeriod)
    {
        additionSecurityPeriod = securityManager.additionSecurityPeriodOf(
            address(this)
        );
        if (additionSecurityPeriod == 0) {
            revert GuardianFacet__InvalidAdditionSecurityPeriod();
        }
    }

    /**
     * @notice Get the removal security period of current account from security manager
     * @dev This method returns the uint value if removal security period
     * @return removalSecurityPeriod Uint256 value of removal security period
     */
    function getRemovalSecurityPeriod()
        public
        view
        override
        returns (uint256 removalSecurityPeriod)
    {
        removalSecurityPeriod = securityManager.removalSecurityPeriodOf(
            address(this)
        );
        if (removalSecurityPeriod == 0) {
            revert GuardianFacet__InvalidRemovalSecurityPeriod();
        }
    }

    /**
     * @notice Get the security window of current account from security manager
     * @dev This method returns the uint value if security window
     * @return securityWindow Uint256 value of removal security period
     */
    function getSecurityWindow()
        public
        view
        override
        returns (uint256 securityWindow)
    {
        securityWindow = securityManager.securityWindowOf(address(this));
        if (securityWindow == 0) {
            revert GuardianFacet__InvalidSecurityWindow();
        }
    }

    /**
     * @notice Checks if the addition of the given guardian address is pending
     * @dev This method returns the bool value of whether the guardian address is pending addition
     * @return isPending Bool value of representing the pending of guardian addition
     */
    function isAdditionPending(
        address _guardian
    ) public view override returns (bool isPending) {
        bytes32 id = keccak256(abi.encodePacked(_guardian, "ADD"));
        isPending = _isPending(id);
    }

    /**
     * @notice Checks if the removal of the given guardian address is pending
     * @dev This method returns the bool value of whether the guardian address is pending removal
     * @return isPending Bool value of representing the pending of guardian removal
     */
    function isRemovalPending(
        address _guardian
    ) public view override returns (bool isPending) {
        bytes32 id = keccak256(abi.encodePacked(_guardian, "REMOVE"));
        isPending = _isPending(id);
    }

    /**
     * @notice Checks if the given hash is pending
     * @dev This method returns the bool value whether the hash is pending
     * @return isPending Bool value of representing the pending of guardian operation
     */
    function _isPending(
        bytes32 _idHash
    ) internal view returns (bool isPending) {
        GuardianStorage storage gs = LibFacetStorage.guardianStorage();
        isPending = ((gs.pending[_idHash] > 0 &&
            gs.pending[_idHash] < block.timestamp) &&
            block.timestamp < gs.pending[_idHash] + getSecurityWindow());
    }

    /**
     * @notice Adds guardian to storage config. This is called when guardian is fully added.
     * @dev This method add guardian address and config information to Facet Storage dedicated for guardian
     *      When this function is called, guardian is fully added to this Barz Smart Account
     * @param _guardian Address of guardian to be added
     */
    function _addGuardian(address _guardian) internal {
        if (!isAdditionPending(_guardian)) {
            revert GuardianFacet__InvalidGuardianAddition();
        }
        StorageConfig storage config = LibFacetStorage
            .guardianStorage()
            .configs[INNER_STRUCT];
        if (config.info[_guardian].exists) {
            revert GuardianFacet__AlreadyExists();
        }

        config.info[_guardian].exists = true;
        config.info[_guardian].index = uint128(config.addresses.length);
        config.addresses.push(_guardian);
    }

    /**
     * @notice Removes guardian to storage config. This is called when guardian is fully removed.
     * @dev This method remove guardian address and config information to Facet Storage dedicated for guardian
     *      When this function is called, guardian is fully removed from this Barz Smart Account
     * @param _guardian Address of guardian to be removed
     */
    function _removeGuardian(address _guardian) internal {
        if (!isRemovalPending(_guardian)) {
            revert GuardianFacet__InvalidGuardianRemoval();
        }
        StorageConfig storage config = LibFacetStorage
            .guardianStorage()
            .configs[INNER_STRUCT];
        if (!config.info[_guardian].exists) {
            revert GuardianFacet__NonExistentGuardian();
        }

        address lastAddress = config.addresses[config.addresses.length - 1];
        if (_guardian != lastAddress) {
            uint128 targetIndex = config.info[_guardian].index;
            config.addresses[targetIndex] = lastAddress;
            config.info[lastAddress].index = targetIndex;
        }
        config.addresses.pop();
        delete config.info[_guardian];

        emit GuardianRemoved(_guardian);
    }

    /**
     * @notice Reads guardian storage and fetches the addresses into an array from the storage
     * @dev This method fetches the guardian storage and returns the list of guardian addresses
     * @return guardians Array of addresses comprised of guardian
     */
    function getGuardians()
        public
        view
        override
        returns (address[] memory guardians)
    {
        StorageConfig storage config = LibFacetStorage
            .guardianStorage()
            .configs[INNER_STRUCT];
        uint256 guardiansLen = config.addresses.length;
        guardians = new address[](guardiansLen);
        for (uint256 i; i < guardiansLen; ) {
            guardians[i] = config.addresses[i];
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Returns the number of majority of guardians
     * @return majorityOfGuardians_ Number of majority of guardians e.g., 2 if 3 guardians / 3 if 5 guardians
     */
    function majorityOfGuardians()
        public
        view
        override
        returns (uint256 majorityOfGuardians_)
    {
        majorityOfGuardians_ = LibGuardian.majorityOfGuardians();
    }

    /**
     * @notice Reads guardian storage and fetches the addresses into an array from the storage
     * @dev This method fetches the guardian storage and returns the list of guardian addresses
     * @return guardianNumber Array of guardians in the account
     */
    function guardianCount()
        public
        view
        override
        returns (uint256 guardianNumber)
    {
        StorageConfig storage config = LibFacetStorage
            .guardianStorage()
            .configs[INNER_STRUCT];
        guardianNumber = config.addresses.length;
    }

    /**
     * @notice Reads guardian storage and checks if the given address is a guardian
     * @return isGuardian_ Bool value representing if the given address is guardian
     */
    function isGuardian(
        address _guardian
    ) public view override returns (bool isGuardian_) {
        StorageConfig storage config = LibFacetStorage
            .guardianStorage()
            .configs[INNER_STRUCT];
        isGuardian_ = config.info[_guardian].exists;
    }

    /**
     * @notice Checks if the guardian number is zero and returns of guardian facet is okay to be removed
     * @return isRemovable Bool value representing if guardian facet is removable
     */
    function isGuardianFacetRemovable()
        external
        view
        override
        returns (bool isRemovable)
    {
        isRemovable = (0 == guardianCount());
    }
}
