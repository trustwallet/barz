// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title Interface for restrictions
 * @dev Restriction is a contract which decides whether to approve a certain kind of transaction, based on its internal logic.
 * @author Ruslan Serebriakov (@rsrbk)
 */
interface IRestriction {
    /**
     * @dev Based on restriction's internal logic, it should accept or reject a certain transaction.
     * @param from The address of the sender, that will be signing the transaction.
     * @param to The receiving address.
     * @param value Amount of ETH to transfer from sender to recipient.
     * @param _calldata Optional field to include arbitrary data.
     * @return bool value for whether the check is passed
     */
    function check(
        address from,
        address to,
        uint256 value,
        bytes calldata _calldata
    ) external returns (bool);
}
