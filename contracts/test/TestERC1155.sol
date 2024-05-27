// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract TestERC1155 is ERC1155 {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;

    constructor() ERC1155("") {}

    function mint(address account, uint256 amount) external {
        uint256 tokenId = _getNextTokenId();
        _mint(account, tokenId, amount, "");
    }

    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes memory data
    ) external {
        require(
            ids.length == amounts.length,
            "TestERC1155: arrays length mismatch"
        );

        _mintBatch(to, ids, amounts, data);
    }

    function _getNextTokenId() private returns (uint256) {
        _tokenIds.increment();
        return _tokenIds.current();
    }
}
