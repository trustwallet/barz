// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {IEntryPoint} from "../../../aa-4337/interfaces/IEntryPoint.sol";

/// @title Account View Interface
interface IAccountView {
    /// @notice Get the entry point for this account.
    /// @return entryPoint The entry point for this account.
    function entryPoint() external view returns (IEntryPoint);

    /// @notice Get the account nonce.
    /// @dev Uses key 0.
    /// @return nonce The next account nonce.
    function getNonce() external view returns (uint256);
}
