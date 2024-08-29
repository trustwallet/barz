// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {UserOperation} from "../../../aa-4337/interfaces/UserOperation.sol";
import {IModule} from "./IModule.sol";

interface ISigner is IModule {
    function checkUserOpSignature(bytes32 id, UserOperation calldata userOp, bytes32 userOpHash)
        external
        payable
        returns (uint256);
    function checkSignature(bytes32 id, address sender, bytes32 hash, bytes calldata sig)
        external
        view
        returns (bytes4);
}
