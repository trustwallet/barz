// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {LibRecoverSpender} from "../libraries/LibRecoverSpender.sol";
import {WhitelistStorage} from "../infrastructure/WhitelistStorage.sol";
import {IRestriction} from "./IRestriction.sol";

/**
 * @title Whitelist Restriction
 * @dev This restriction defines a list of accepted addresses and denies any interaction with addresses outside of it.
 * @author Ruslan Serebriakov (@rsrbk)
 */
contract WhitelistRestriction is IRestriction {
    WhitelistStorage public immutable whitelistStorage;

    constructor(WhitelistStorage _whitelistStorage) {
        whitelistStorage = _whitelistStorage;
    }

    /**
     * @notice Helper method to recover the spender from a contract call.
     * The method returns the contract unless the call is to a standard method of a ERC20/ERC721/ERC1155 token
     * in which case the spender is recovered from the data.
     * @param _to The target contract.
     * @param _data The data payload.
     */
    function recoverSpender(
        address _to,
        bytes memory _data
    ) public pure returns (address spender) {
        return LibRecoverSpender._recover(_to, _data);
    }

    /*
     * @dev IRestriction's implementation. It will allow transaction if the sender is whitelisted, or user, or the whitelist storage.
     * @param _from The address of the sender, that will be signing the transaction.
     * @param _to The receiving address.
     * @param _calldata Optional field to include arbitrary data.
     * @return result value for whether the check is passed
     */
    function check(
        address _from,
        address _to,
        uint256 /*_value*/,
        bytes calldata _calldata
    ) external view override returns (bool result) {
        return
            whitelistStorage.isWhitelisted(
                _from,
                LibRecoverSpender._recover(_to, _calldata)
            ) ||
            _to == address(whitelistStorage) ||
            _to == msg.sender;
    }
}
