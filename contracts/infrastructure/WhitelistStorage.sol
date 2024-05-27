// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {RemoteStorage} from "./RemoteStorage.sol";

/**
 * @title Whitelist storage
 * @dev Maps addresses to the corresponsing array of whitelisted addresses for each of them.
 * @author Ruslan Serebriakov (@rsrbk)
 */
contract WhitelistStorage is RemoteStorage {
    /**
     * @dev Add the address to the whitelist storage
     * @param _wallet User wallet
     * @param _address Address to be whitelisted
     */
    function whitelistAddress(address _wallet, address _address) external {
        enforceWalletOrGuardianIfExists(_wallet);
        addAddress(_wallet, _address);
    }

    /**
     * @dev Removes the address from the whitelist storage
     * @param _wallet User wallet
     * @param _address Address to be removed from the whitelist
     */
    function blacklistAddress(address _wallet, address _address) external {
        enforceGuardianOrWallet(_wallet);
        removeAddress(_wallet, _address);
    }

    /**
     * @dev Returns whether the address exists in the whitelist storage, associated with the wallet
     * @param _wallet User wallet
     * @param _address Address to be whitelisted
     */
    function isWhitelisted(
        address _wallet,
        address _address
    ) external view returns (bool) {
        return exists(_wallet, _address);
    }

    /**
     * @dev Returns all whitelisted addresses associated with the wallet
     * @param _wallet User wallet
     */
    function getWhitelistedAddresses(
        address _wallet
    ) external view returns (address[] memory) {
        return getAddresses(_wallet);
    }
}
