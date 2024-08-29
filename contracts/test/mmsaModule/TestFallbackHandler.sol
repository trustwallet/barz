// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {FALLBACK_MODULE_TYPE} from "../../facets/mmsa/utils/Constants.sol";

contract TestFallbackHandler {
    uint256 public count;
    string public constant NAME = "Default Handler";
    string public constant VERSION = "1.0.0";

    event GenericFallbackCalled(address sender, uint256 value, bytes data); // Event for generic fallback

    error NonExistingMethodCalled(bytes4 selector);

    fallback() external {
        revert NonExistingMethodCalled(msg.sig);
    }

    // Example function to manually trigger the fallback mechanism
    function onGenericFallback(
        address sender,
        uint256 value,
        bytes memory data
    ) external returns (bytes4) {
        emit GenericFallbackCalled(sender, value, data);
        return this.onGenericFallback.selector;
    }

    function onInstall(bytes calldata data) external {}

    function onUninstall(bytes calldata data) external {}

    function isModuleType(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == FALLBACK_MODULE_TYPE;
    }

    function isInitialized(address) external pure returns (bool) {
        return false;
    }

    function stateChangingFunction() external {
        count++;
    }

    function successFunction() external pure returns (bytes32) {
        return keccak256("SUCCESS");
    }

    function revertingFunction() external pure {
        revert("REVERT");
    }

    function longReturnFunction() external pure returns (bytes memory) {
        return
            abi.encodeWithSelector(
                this.onGenericFallback.selector,
                address(1),
                uint256(1111),
                abi.encodePacked(hex"1234")
            );
    }

    function getState() external view returns (uint256) {
        return count;
    }
}
