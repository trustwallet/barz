// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IDiamondLoupe} from "../facets/base/interfaces/IDiamondLoupe.sol";
import {IGuardianFacet} from "../facets/interfaces/IGuardianFacet.sol";

/**
 * @title Remote Storage
 * @dev Remote storage allows you to associate addresses with an array of addresses on a standalone smart contract.
 * This could be useful when you don't want to use the local diamond storage for some purpose.
 * @author Ruslan Serebriakov (@rsrbk)
 * @author David Yongjun Kim (@Powerstream3604)
 */
abstract contract RemoteStorage {
    struct StorageConfig {
        address[] addresses;
        mapping(address => Info) info;
    }

    struct Info {
        bool exists;
        uint128 index;
    }

    mapping(address => StorageConfig) internal configs;

    event Added(address _address);
    event Removed(address _address);

    error RemoteStorage__CallerNotOwner();
    error RemoteStorage__CallerNotGuardianOrOwner();
    error RemoteStorage__AlreadyExists();
    error RemoteStorage__NotFound();
    error RemoteStorage__CallerNotGuardian();

    bytes4 constant IS_GUARDIAN_SELECTOR =
        bytes4(keccak256("isGuardian(address)"));
    bytes4 constant GUARDIAN_COUNT = bytes4(keccak256("guardianCount()"));

    /**
     * @notice Modifier to only allow the self to call. Reverts otherwise
     */
    modifier onlyWallet(address _wallet) {
        if (msg.sender != _wallet) revert RemoteStorage__CallerNotOwner();
        _;
    }

    /**
     * @notice Enfore the callet to be wallet of guardian of the wallet
     * @param _wallet Address of wallet
     */
    function enforceGuardianOrWallet(address _wallet) internal view {
        if (msg.sender == _wallet) return;
        address facetAddress = IDiamondLoupe(_wallet).facetAddress(
            IS_GUARDIAN_SELECTOR
        );
        if (facetAddress != address(0))
            if (IGuardianFacet(_wallet).isGuardian(msg.sender)) return;
        revert RemoteStorage__CallerNotGuardianOrOwner();
    }

    /**
     * @notice Enforce the caller to be wallet IF guardians doesn't exists and only guardian when guardians exists
     * @param _wallet Target wallet address to be handled by infrastructure contracts
     */
    function enforceWalletOrGuardianIfExists(address _wallet) internal view {
        address facetAddress;
        if (msg.sender == _wallet) {
            facetAddress = IDiamondLoupe(_wallet).facetAddress(GUARDIAN_COUNT);
            if (facetAddress == address(0)) return;
            uint256 guardianCount = IGuardianFacet(_wallet).guardianCount();
            if (guardianCount != 0) revert RemoteStorage__CallerNotGuardian();
            return;
        }
        facetAddress = IDiamondLoupe(_wallet).facetAddress(
            IS_GUARDIAN_SELECTOR
        );
        if (facetAddress != address(0))
            if (IGuardianFacet(_wallet).isGuardian(msg.sender)) return;

        revert RemoteStorage__CallerNotGuardianOrOwner();
    }

    /**
     * @notice Add address to storage and reverts if the address already exists.
     *         This is an internal function callable from contracts that inherit this abstract contract
     * @param _wallet Address of wallet to add the address
     * @param _address Address to be added to wallet
     */
    function addAddress(address _wallet, address _address) internal {
        StorageConfig storage config = configs[_wallet];
        if (config.info[_address].exists) revert RemoteStorage__AlreadyExists();

        config.info[_address].exists = true;
        config.info[_address].index = uint128(config.addresses.length);
        config.addresses.push(_address);

        emit Added(_address);
    }

    /**
     * @notice Remove address from storage and reverts if the address already exists.
     *         This is an internal function callable from contracts that inherit this abstract contract
     * @param _wallet Address of wallet to remove the address
     * @param _address Address to be removed from wallet
     */
    function removeAddress(address _wallet, address _address) internal {
        StorageConfig storage config = configs[_wallet];
        if (!config.info[_address].exists) revert RemoteStorage__NotFound();

        address lastAddress = config.addresses[config.addresses.length - 1];
        if (_address != lastAddress) {
            uint128 targetIndex = config.info[_address].index;
            config.addresses[targetIndex] = lastAddress;
            config.info[lastAddress].index = targetIndex;
        }
        config.addresses.pop();
        delete config.info[_address];

        emit Removed(_address);
    }

    /**
     * @notice Returns the address added to the given wallet
     * @param _wallet Address of wallet to fetch the addresses added to it
     * @return addresses List of addresses added to the wallet
     */
    function getAddresses(
        address _wallet
    ) internal view returns (address[] memory addresses) {
        StorageConfig storage config = configs[_wallet];
        addresses = new address[](config.addresses.length);
        uint addressesLen = config.addresses.length;
        for (uint256 i; i < addressesLen; ) {
            addresses[i] = config.addresses[i];
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Returns bool value checking if the address exists in the given wallet address
     * @param _wallet Wallet address to check
     * @param _address Address to fetch if the address if added to given wallet
     * @return exists_ Bool value showing if the address exists in wallet
     */
    function exists(
        address _wallet,
        address _address
    ) internal view returns (bool exists_) {
        exists_ = configs[_wallet].info[_address].exists;
    }

    /**
     * @notice Returns the number of addresses added to the wallet
     * @param _wallet Address of wallet to check
     * @return count_ Number of addresses added to wallet
     */
    function count(address _wallet) internal view returns (uint256 count_) {
        count_ = configs[_wallet].addresses.length;
    }
}
