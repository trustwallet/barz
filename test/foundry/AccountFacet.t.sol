// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import "forge-std/Test.sol";
// base contracts
import {BarzFactory} from "../../contracts/BarzFactory.sol";
import {Barz} from "../../contracts/Barz.sol";
// facets
import {AccountFacet} from "../../contracts/facets/AccountFacet.sol";
import {Secp256k1VerificationFacet} from "../../contracts/facets/verification/secp256k1/Secp256k1VerificationFacet.sol";
// interfaces
import {IAccountFacet} from "../../contracts/facets/interfaces/IAccountFacet.sol";
import {IVerificationFacet} from "../../contracts/facets/interfaces/IVerificationFacet.sol";
import {IDiamondCut} from "../../contracts/facets/base/interfaces/IDiamondCut.sol";
import {UserOperation} from "../../contracts/aa-4337/interfaces/UserOperation.sol";
import {IEntryPoint} from "../../contracts/aa-4337/interfaces/IEntryPoint.sol";
import {IERC1271} from "../../contracts/interfaces/ERC/IERC1271.sol";
// test contracts
import {TestCounter} from "../../contracts/test/TestCounter.sol";
// constants & utils
import {Setup} from "./utils/Setup.sol";
import {AccountFacetTestBase} from "./base/AccountFacetTestBase.sol";

contract AccountFacetTest is Test, Setup, AccountFacetTestBase {

    address[] public wallets;
    // address public deployer;
    address public operator;
    address public user1;

    BarzFactory public barzFactory;
    Barz public barz;

    TestCounter public testCounter;

    bytes constant callData = abi.encodeWithSignature(
            "incrementCounter()"
        );

    function setUp() public {
        uint256[] memory signers = new uint256[](2);
        signers[0] = user1PrivateKey;
        signers[1] = user2PrivateKey;
        wallets = _setUpSigners(2, signers, 50 ether);
        deployer = wallets[0];
        operator = wallets[1];
        testCounter = new TestCounter();
        barzFactory = _setUpBarzFactory();

        // k1Facet & r1Facet are deployed during the setup of BarzFactory
        barz = barzFactory.createAccount(address(k1Facet), user1PublicKey, walletCreationSalt);
        vm.deal(address(barz), 10 ether);
    }

    function test_initialze() public {
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory verificationFunctionSelectors = new bytes4[](3);
        verificationFunctionSelectors[0] = IERC1271.isValidSignature.selector;
        verificationFunctionSelectors[1] = Secp256k1VerificationFacet.validateOwnerSignature.selector;
        verificationFunctionSelectors[2] = IVerificationFacet.owner.selector;
        cut[0] = IDiamondCut.FacetCut({
            facetAddress: address(k1Facet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: verificationFunctionSelectors
        });

        vm.expectEmit(true, true, false, true);
        emit DiamondCut(cut, address(0), bytes(""));

        vm.expectEmit(true, false, false, true);
        emit SignerInitialized(user1PublicKey);

        vm.expectEmit(true, true, false, true);
        emit AccountInitialized(IEntryPoint(address(entryPoint)), user1PublicKey);

        // createAccount automatically calls initialize from the AccountFacet
        barz = barzFactory.createAccount(address(k1Facet), user1PublicKey, walletCreationSalt + 0x1234);
        // entrypoint
        assertEq(address(AccountFacet(address(barz)).entryPoint()), address(IEntryPoint(address(entryPoint))));
        // facetRegistry
        assertEq(IVerificationFacet(address(barz)).owner(), abi.encodePacked(publicKeyToAddress(user1PublicKey)));
    }

    function test_execute() public {
        int expectedCounter = 1;

        bytes memory executeCallData = encodeExecuteCall(address(testCounter), 0, callData);

        UserOperation[] memory userOp = new UserOperation[](1);
        uint256[] memory signingKey = new uint256[](1);
        userOp[0] = this.prepareUserOp(address(barz), nonce[address(barz)], executeCallData);
        signingKey[0] = user1PrivateKey;

        userOp = signUserOperation(userOp, signingKey);

        vm.expectEmit(true, false, false, true, address(testCounter));
        emit CounterIncremented(expectedCounter);

        entryPoint.handleOps(userOp, payable(barz));

        assertEq(testCounter.getCount(), expectedCounter);
    }

    function test_executeBatch() public {
        int expectedCounter = 3;

        address[] memory _dest = new address[](3);
        uint256[] memory _value = new uint256[](3);
        bytes[] memory _callData = new bytes[](3);

        for (uint256 i; i < 3; i++) {
            _dest[i] = address(testCounter);
            _value[i] = 0;
            _callData[i] = callData;
        }

        bytes memory executeBatchCallData = encodeExecuteBatchCall(_dest, _value, _callData);

        UserOperation[] memory userOp = new UserOperation[](1);
        uint256[] memory signingKey = new uint256[](1);
        userOp[0] = this.prepareUserOp(address(barz), nonce[address(barz)], executeBatchCallData);
        signingKey[0] = user1PrivateKey;

        userOp = signUserOperation(userOp, signingKey);

        for (uint256 i; i < 3; i++) {
            vm.expectEmit(true, false, false, false, address(testCounter));
            emit CounterIncremented(int(i+1));
        }

        entryPoint.handleOps(userOp, payable(barz));

        assertEq(testCounter.getCount(), expectedCounter);
    }

}