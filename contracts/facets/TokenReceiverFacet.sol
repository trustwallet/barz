// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {IERC1155Receiver} from "../interfaces/ERC/IERC1155Receiver.sol";
import {IERC677Receiver} from "../interfaces/ERC/IERC677Receiver.sol";

/**
 * @title TokenReceiver Facet
 * @dev Contract that enables receiving ERC721/ERC1155/ERC777/ERC677 Tokens with safe transfer
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract TokenReceiverFacet is
    IERC721Receiver,
    IERC1155Receiver,
    IERC777Recipient,
    IERC677Receiver
{
    /**
     * @notice Handles ERC721 Token callback.
     *  return Standardized onERC721Received return value.
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /**
     * @notice Handles ERC1155 Token callback.
     * return Standardized onERC1155Received return value.
     */
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    /**
     * @notice Handles ERC1155 Token batch callback.
     * return Standardized onERC1155BatchReceived return value.
     */
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    /**
     * @notice Handles ERC777 Token callback.
     * Does not return value, empty implementation.
     */
    function tokensReceived(
        address,
        address,
        address,
        uint256,
        bytes calldata,
        bytes calldata
    ) external pure override {}

    /**
     * @notice Handles ERC677 Token callback.
     * return true.
     */
    function onTokenTransfer(
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bool) {
        return true;
    }
}
