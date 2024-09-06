// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {EXECUTOR_MODULE_TYPE} from "../../facets/mmsa/utils/Constants.sol";
import {LibEncoder} from "./LibEncoder.sol";
import {IMMSAFacet} from "../../facets/mmsa/interfaces/IMMSAFacet.sol";

contract TestMMSAExecutor {
    mapping(address => bool) public isExecutorInitialized;

    event ExecutorInstalled();
    event ExecutorUninstalled();

    function onInstall(bytes calldata) external {
        isExecutorInitialized[msg.sender] = true;
        emit ExecutorInstalled();
    }

    function onUninstall(bytes calldata) external {
        isExecutorInitialized[msg.sender] = false;
        emit ExecutorUninstalled();
    }

    function triggerCounter(address _testCounter) external {
        IMMSAFacet(msg.sender).executeFromExecutor(
            LibEncoder.encodeSimpleSingle(),
            abi.encodePacked(
                _testCounter,
                uint256(0),
                abi.encodeWithSignature("incrementCounter()")
            )
        );
    }

    function triggerSelf() external {
        IMMSAFacet(msg.sender).executeFromExecutor(
            LibEncoder.encodeSimpleSingle(),
            abi.encodePacked(
                msg.sender,
                uint256(0),
                abi.encodeWithSignature(
                    "onERC721Received(address,address,uint256,bytes)",
                    address(1),
                    address(1),
                    1,
                    "0x00"
                )
            )
        );
    }

    function isModuleType(uint256 typeID) external pure returns (bool) {
        return typeID == EXECUTOR_MODULE_TYPE;
    }
}
