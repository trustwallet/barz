// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

interface IERC1271 {
    function isValidSignature(
        bytes32 hash,
        bytes memory signature
    ) external view returns (bytes4);
}
