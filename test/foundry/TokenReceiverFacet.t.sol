// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import "forge-std/Test.sol";
// base contracts
import {BarzFactory} from "../../contracts/BarzFactory.sol";
import {Barz} from "../../contracts/Barz.sol";
// interfaces
import {IERC1155Receiver} from "../../contracts/interfaces/ERC/IERC1155Receiver.sol";
import {IERC677Receiver} from "../../contracts/interfaces/ERC/IERC677Receiver.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
// test token
import {TestNFT} from "../../contracts/test/TestNFT.sol";
import {TestERC1155} from "../../contracts/test/TestERC1155.sol";
// utils
import {Setup} from "./utils/Setup.sol";
import {TokenReceiverFacetTestBase} from "./base/TokenReceiverFacetTestBase.sol";

contract TokenReceiverFacetTest is Test, Setup, TokenReceiverFacetTestBase {
    address[] public wallets;
    // address public deployer;
    address public operator;
    address public user1;

    BarzFactory public barzFactory;
    Barz public barz;

    TestNFT internal testNFT;
    TestERC1155 internal testERC1155;

    uint256 mockTokenId = 1;
    uint256 mockAmount = 100;
    
    function setUp() public {
        uint256[] memory signers = new uint256[](2);
        signers[0] = user1PrivateKey;
        signers[1] = user2PrivateKey;
        wallets = _setUpSigners(10, signers, 50 ether);
        deployer = wallets[0];
        operator = wallets[1];
        user1 = wallets[2];

        vm.prank(deployer);

        // setup test token contracts
        testNFT = new TestNFT();
        testERC1155 = new TestERC1155();

        barzFactory = _setUpBarzFactory();
        k1Facet = _setUpK1Facet();

        barz = barzFactory.createAccount(address(k1Facet), user1PublicKey, walletCreationSalt);
        vm.deal(address(barz), 10 ether);
        vm.stopPrank();
    }

    function test_onERC721Received() public {
        // 0x150b7a02 == IERC721Receiver.onERC721Received.selector
        assertEq(IERC721Receiver(address(barz)).onERC721Received(deployer, address(operator), mockTokenId, "0x00"), bytes4(0x150b7a02));
    }

    function test_receiveSafeERC721TokenTransfer() public {
        testNFT.mint(deployer);
        vm.expectEmit(true, true, false, true, address(testNFT));
        emit Transfer(deployer, address(barz), mockTokenId);

        assertEq(testNFT.ownerOf(mockTokenId), deployer);

        vm.prank(deployer);
        testNFT.safeTransferFrom(deployer, address(barz), mockTokenId);

        assertEq(testNFT.ownerOf(mockTokenId), address(barz));
        vm.stopPrank();
    }

    function test_onERC1155Received() public {
        // 0xf23a6e61 == IERC1155Receiver.onERC1155Received.selector
        assertEq(IERC1155Receiver(address(barz)).onERC1155Received(deployer, address(operator), mockTokenId, mockAmount, "0x00"), bytes4(0xf23a6e61));
    }

    function test_receiveSafeERC1155TokenTransfer() public {
        testERC1155.mint(deployer, mockAmount);
        assertEq(testERC1155.balanceOf(deployer, mockTokenId), mockAmount);

        vm.prank(deployer);
        testERC1155.safeTransferFrom(deployer, address(barz), mockTokenId, mockAmount, "0x00");

        assertEq(testERC1155.balanceOf(address(barz), mockTokenId), mockAmount);
        vm.stopPrank();
    }

    function test_onERC1155BatchReceived() public {
        uint256[] memory tokenIds = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);

        // 0xbc197c81 == IERC1155Receiver.onERC1155BatchReceived.selector
        assertEq(IERC1155Receiver(address(barz)).onERC1155BatchReceived(deployer, operator, tokenIds, amounts, "0x00"), bytes4(0xbc197c81));
    }

    function test_receiveSafeERC1155BatchTokenTransfer() public {
        address[] memory owners = populateAddressList(deployer, 3);
        address[] memory barzOwners = populateAddressList(address(barz), 3);
        uint256[] memory tokenIds = new uint256[](3);
        tokenIds[0] = 1;
        tokenIds[1] = 2;
        tokenIds[2] = 3;
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 10000;
        amounts[1] = 20000;
        amounts[2] = 30000;
        testERC1155.mintBatch(deployer, tokenIds, amounts, "0x00");

        assertEq(testERC1155.balanceOfBatch(owners, tokenIds), amounts);
        vm.prank(deployer);
        testERC1155.safeBatchTransferFrom(deployer, address(barz), tokenIds, amounts, "0x00");

        assertEq(testERC1155.balanceOfBatch(barzOwners, tokenIds), amounts);
        vm.stopPrank();
    }

    function test_tokensReceived() public {
        IERC777Recipient(address(barz)).tokensReceived(deployer, deployer, deployer, mockAmount, "0x00", "0x00");
    }

    function test_onTokenTransfer() public {
        assertEq(IERC677Receiver(address(barz)).onTokenTransfer(deployer, mockAmount, "0x00"), true);
    }

}