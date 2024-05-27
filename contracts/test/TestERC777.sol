// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";

contract TestERC777 is ERC777 {
    constructor(
        address[] memory _operators
    ) ERC777("TestERC777", "TERC777", _operators) {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount, "", "");
    }
}
