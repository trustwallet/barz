// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

interface IERC677Receiver {
    function onTokenTransfer(
        address sender,
        uint value,
        bytes calldata data
    ) external pure returns (bool);
}
