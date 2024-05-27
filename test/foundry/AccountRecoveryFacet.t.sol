// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import "forge-std/Test.sol";
// base contracts
import {BarzFactory} from "../../contracts/BarzFactory.sol";
import {Barz} from "../../contracts/Barz.sol";
// facets
import {AccountFacet} from "../../contracts/facets/AccountFacet.sol";
import {Secp256k1VerificationFacet} from "../../contracts/facets/verification/secp256k1/Secp256k1VerificationFacet.sol";
import {GuardianFacet} from "../../contracts/facets/GuardianFacet.sol";
import {AccountRecoveryFacet} from "../../contracts/facets/AccountRecoveryFacet.sol";
import {LockFacet} from "../../contracts/facets/LockFacet.sol";
import {RecoveryConfig} from "../../contracts/libraries/LibFacetStorage.sol";
import {LibVerification} from "../../contracts/libraries/LibVerification.sol";
// interfaces
import {IDiamondCut} from "../../contracts/facets/base/interfaces/IDiamondCut.sol";
import {UserOperation} from "../../contracts/aa-4337/interfaces/UserOperation.sol";
// constants & utils
import {Setup} from "./utils/Setup.sol";
import {Constants} from "./utils/Constants.sol";
import {AccountRecoveryFacetTestBase} from "./base/AccountRecoveryFacetTestBase.sol";

contract AccountRecoveryFacetTest is Test, Setup, AccountRecoveryFacetTestBase {

    address[] public wallets;
    address public operator;
    address public user1;
    address public guardian1;
    address public guardian2;
    uint256 public guardian1PrivateKey = 1;
    uint256 public guardian2PrivateKey = 2;
    bytes constant recoveryPublicKey = user2PublicKey;

    BarzFactory public barzFactory;
    Barz public barz;

    function setUp() public {
        skip(1706504435); // 1706504435 = Date and time (GMT): Monday, 29 January 2024 05:00:35
        uint256[] memory signers = new uint256[](2);
        signers[0] = user1PrivateKey;
        signers[1] = user2PrivateKey;
        wallets = _setUpSigners(2, signers, 50 ether);
        deployer = wallets[0];
        operator = wallets[1];
        guardian1 = vm.addr(guardian1PrivateKey);
        guardian2 = vm.addr(guardian2PrivateKey);

        barzFactory = _setUpBarzFactory();

        // k1Facet & r1Facet are deployed during the setup of BarzFactory
        barz = barzFactory.createAccount(address(k1Facet), user1PublicKey, walletCreationSalt);
        vm.deal(address(barz), 10 ether);
        _addGuardianFacet();
        _addAccountRecoveryFacet();
        _addLockFacet();
    }

    function _addGuardianFacet() internal {
        cutFacet(address(guardianFacet), IDiamondCut.FacetCutAction.Add, Constants.guardianFacetSelectors(), address(barz), user1PrivateKey);
    }

    function _addAccountRecoveryFacet() internal {
        cutFacet(address(accountRecoveryFacet), IDiamondCut.FacetCutAction.Add, Constants.accountRecoveryFacetSelectors(), address(barz), user1PrivateKey);
    }

    function _addLockFacet() internal {
        cutFacet(address(lockFacet), IDiamondCut.FacetCutAction.Add, Constants.lockFacetSelectors(), address(barz), user1PrivateKey);
    }

    function _initiateRecovery() internal {
        uint64 expectedExecutionTime = uint64(block.timestamp + Constants.defaultRecoveryPeriod);

        vm.prank(guardian1);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);

        vm.expectEmit(true, true, false, true);
        emit RecoveryExecuted(recoveryPublicKey, expectedExecutionTime);

        vm.prank(guardian2);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);
    }

    function _addGuardian(address _guardian) internal {
        UserOperation[] memory userOp = new UserOperation[](1);
        uint256[] memory signingKey = new uint256[](1);

        bytes memory addGuardianData = abi.encodeWithSignature("addGuardian(address)", _guardian);
        bytes memory callData = encodeExecuteCall(address(barz), 0, addGuardianData);
        userOp[0] = this.prepareUserOp(address(barz), nonce[address(barz)]++, callData);
        signingKey[0] = user1PrivateKey;

        userOp = signUserOperation(userOp, signingKey);
        entryPoint.handleOps(userOp, payable(barz));

        skip(GuardianFacet(address(barz)).getAdditionSecurityPeriod() + 1);
        GuardianFacet(address(barz)).confirmGuardianAddition(_guardian);

        address[] memory expectedGuardian = new address[](1);
        expectedGuardian[0] = _guardian;
    }

    function test_approveAccountRecovery() public {
        _addGuardian(guardian1);
        uint64 expectedExpiry = uint64(block.timestamp + Constants.defaultApprovalValidationPeriod);

        vm.expectEmit(true, true, false, true, address(barz));
        emit RecoveryApproved(recoveryPublicKey, guardian1, expectedExpiry);

        vm.prank(guardian1);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);
    }

    function test_revokeAccountRecoveryApproval() public {
        _addGuardian(guardian1);
        _addGuardian(guardian2);

        uint64 expectedExpiry = uint64(block.timestamp + Constants.defaultApprovalValidationPeriod);

        vm.expectEmit(true, true, false, true, address(barz));
        emit RecoveryApproved(recoveryPublicKey, guardian1, expectedExpiry);

        vm.prank(guardian1);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);

        vm.expectEmit(true, true, false, true, address(barz));
        emit RecoveryApprovalRevoked(recoveryPublicKey, guardian1);

        vm.prank(guardian1);
        AccountRecoveryFacet(address(barz)).revokeAccountRecoveryApproval(recoveryPublicKey);
    }

    function test_executeRecovery() public {
        _addGuardian(guardian1);
        _addGuardian(guardian2);

        address[] memory guardians = new address[](2);
        guardians[0] = guardian1;
        guardians[1] = guardian2;
        bytes[] memory recoveryApprovalSignatures = new bytes[](2);

        bytes32 recoveryPublicKeyHash = AccountRecoveryFacet(address(barz)).getApprovalRecoveryKeyHash(recoveryPublicKey, "ExecuteRecovery");
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardian1PrivateKey, recoveryPublicKeyHash);
        recoveryApprovalSignatures[0] = abi.encodePacked(r, s, v);
        (v, r, s) = vm.sign(guardian2PrivateKey, recoveryPublicKeyHash);
        recoveryApprovalSignatures[1] = abi.encodePacked(r, s, v);

        vm.expectEmit(true, true, false, true);
        emit RecoveryExecuted(recoveryPublicKey, uint64(block.timestamp + Constants.defaultRecoveryPeriod));

        AccountRecoveryFacet(address(barz)).executeRecovery(recoveryPublicKey, guardians, recoveryApprovalSignatures);

        // Barz should be locked if recovery is executed
        assertEq(LockFacet(address(barz)).isLocked(), true);
    }

    function test_finalizeRecovery() public {
        _addGuardian(guardian1);
        _addGuardian(guardian2);

        // checking the state of owner before recovery
        assertEq(bytesToAddress(Secp256k1VerificationFacet(address(barz)).owner()), publicKeyToAddress(user1PublicKey));

        // approve on-chain & off-chain
        vm.prank(guardian1);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);

        address[] memory guardians = new address[](1);
        guardians[0] = guardian2;
        bytes[] memory recoveryApprovalSignatures = new bytes[](1);

        bytes32 recoveryPublicKeyHash = AccountRecoveryFacet(address(barz)).getApprovalRecoveryKeyHash(recoveryPublicKey, "ExecuteRecovery");
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardian2PrivateKey, recoveryPublicKeyHash);
        recoveryApprovalSignatures[0] = abi.encodePacked(r, s, v);

        vm.expectEmit(true, true, false, true);
        emit RecoveryExecuted(recoveryPublicKey, uint64(block.timestamp + Constants.defaultRecoveryPeriod));

        AccountRecoveryFacet(address(barz)).executeRecovery(recoveryPublicKey, guardians, recoveryApprovalSignatures);

        skip(Constants.defaultRecoveryPeriod + 1);

        vm.expectEmit(true, false, false, true);
        emit RecoveryFinalized(recoveryPublicKey);

        AccountRecoveryFacet(address(barz)).finalizeRecovery();

        // checking if the owner of Barz has been updated
        assertEq(bytesToAddress(Secp256k1VerificationFacet(address(barz)).owner()), publicKeyToAddress(recoveryPublicKey));
    }

    function test_approveCancelRecovery() public {
        _addGuardian(guardian1);
        _addGuardian(guardian2);

        _initiateRecovery();
        uint64 expectedExecutionTime = uint64(block.timestamp + Constants.defaultRecoveryPeriod);

        RecoveryConfig memory recoveryConfig = AccountRecoveryFacet(address(barz)).getPendingRecovery();
        assertEq(recoveryConfig.recoveryPublicKey, recoveryPublicKey);
        assertEq(recoveryConfig.executeAfter, expectedExecutionTime);

        vm.expectEmit(true, true, false, true);
        emit RecoveryCancellationApproved(recoveryPublicKey, guardian1);

        vm.prank(guardian1);
        AccountRecoveryFacet(address(barz)).approveCancelRecovery(recoveryPublicKey);

        vm.expectEmit(true, false, false, true);
        emit RecoveryCanceled(recoveryPublicKey);

        vm.prank(guardian2);
        AccountRecoveryFacet(address(barz)).approveCancelRecovery(recoveryPublicKey);

        // check if the final state has been initialized back to 0
        RecoveryConfig memory updatedRecoveryConfig = AccountRecoveryFacet(address(barz)).getPendingRecovery();
        assertEq(updatedRecoveryConfig.recoveryPublicKey, new bytes(0));
        assertEq(updatedRecoveryConfig.executeAfter, uint64(0));
    }

    function test_hardStopRecovery() public {
        _addGuardian(guardian1);
        _addGuardian(guardian2);

        _initiateRecovery();

        bytes32 hardstopPublicKeyHash = AccountRecoveryFacet(address(barz)).getApprovalRecoveryKeyHash(
            "0",
            "HardstopRecovery"
        );

        bytes32 domainSeparator = keccak256(abi.encode(LibVerification.DOMAIN_SEPARATOR_TYPEHASH, block.chainid, address(barz)));
        bytes32 encodedMessageHash = keccak256(abi.encode(LibVerification.BARZ_MSG_TYPEHASH, keccak256(abi.encode(hardstopPublicKeyHash))));
        bytes32 msgHash = keccak256(abi.encodePacked("\x19\x01", domainSeparator, encodedMessageHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(user1PrivateKey, msgHash);

        vm.expectEmit(true, false, false, true);
        emit RecoveryHardstopped();

        AccountRecoveryFacet(address(barz)).hardstopRecovery(abi.encodePacked(r, s, v));

        assertEq(LockFacet(address(barz)).isLocked(), false);
    }

    function test_cancelRecovery() public {
        _addGuardian(guardian1);
        _addGuardian(guardian2);

        _initiateRecovery();

        address[] memory guardians = new address[](2);
        guardians[0] = guardian1;
        guardians[1] = guardian2;
        bytes[] memory recoveryApprovalSignatures = new bytes[](2);

        bytes32 recoveryPublicKeyHash = AccountRecoveryFacet(address(barz)).getApprovalRecoveryKeyHash(recoveryPublicKey, "CancelRecovery");
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardian1PrivateKey, recoveryPublicKeyHash);
        recoveryApprovalSignatures[0] = abi.encodePacked(r, s, v);
        (v, r, s) = vm.sign(guardian2PrivateKey, recoveryPublicKeyHash);
        recoveryApprovalSignatures[1] = abi.encodePacked(r, s, v);

        vm.expectEmit(true, true, false, true);
        emit RecoveryCanceled(recoveryPublicKey);

        AccountRecoveryFacet(address(barz)).cancelRecovery(recoveryPublicKey, guardians, recoveryApprovalSignatures);

        // Barz should be unlocked if recovery is canceled
        assertEq(LockFacet(address(barz)).isLocked(), false);
    }

    function test_validateNewOwner() public {
        // to be successful with valid public key
        AccountRecoveryFacet(address(barz)).validateNewOwner(recoveryPublicKey);

        AccountRecoveryFacet(address(barz)).validateNewOwner(abi.encodePacked(publicKeyToAddress(recoveryPublicKey)));

        // to revert - invalid format for Secp256k1VerificationFacet
        vm.expectRevert(AccountRecoveryFacet__InvalidRecoveryPublicKey.selector);
        AccountRecoveryFacet(address(barz)).validateNewOwner(abi.encodePacked("0x1234567890"));
    }

    function test_getApprovalRecoveryKeyHash() public {
        // sample testing with execute recovery hash
        bytes32 actualKeyHash = AccountRecoveryFacet(address(barz)).getApprovalRecoveryKeyHash(recoveryPublicKey, "ExecuteRecovery");
        uint256 recoveryFacetNonce = 0;
        bytes32 expectedKeyHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encode(
                        recoveryPublicKey,
                        "ExecuteRecovery",
                        address(barz),
                        getChainId(),
                        recoveryFacetNonce
                    )
                )
            )
        );

        assertEq(actualKeyHash, expectedKeyHash);
    }

    function test_getRecoveryApprovalCountWithTimeValidity() public {
        _addGuardian(guardian1);
        _addGuardian(guardian2);

        bytes32 recoveryKeyHash = AccountRecoveryFacet(address(barz)).getApprovalRecoveryKeyHash(recoveryPublicKey, "ExecuteRecovery");

        assertEq(AccountRecoveryFacet(address(barz)).getRecoveryApprovalCountWithTimeValidity(recoveryKeyHash), 0);

        vm.prank(guardian1);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);

        assertEq(AccountRecoveryFacet(address(barz)).getRecoveryApprovalCountWithTimeValidity(recoveryKeyHash), 1);

        vm.prank(guardian2);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);

        assertEq(AccountRecoveryFacet(address(barz)).getRecoveryApprovalCountWithTimeValidity(recoveryKeyHash), 2);

        skip(block.timestamp + Constants.defaultApprovalValidationPeriod);

        assertEq(AccountRecoveryFacet(address(barz)).getRecoveryApprovalCountWithTimeValidity(recoveryKeyHash), 0);
    }

    function test_isRecoveryApproved() public {
        _addGuardian(guardian1);
        _addGuardian(guardian2);

        bytes32 recoveryKeyHash = AccountRecoveryFacet(address(barz)).getApprovalRecoveryKeyHash(recoveryPublicKey, "ExecuteRecovery");

        assertEq(AccountRecoveryFacet(address(barz)).isRecoveryApproved(recoveryKeyHash, guardian1), false);
        assertEq(AccountRecoveryFacet(address(barz)).isRecoveryApproved(recoveryKeyHash, guardian2), false);

        vm.prank(guardian1);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);
        assertEq(AccountRecoveryFacet(address(barz)).isRecoveryApproved(recoveryKeyHash, guardian1), true);

        vm.prank(guardian2);
        AccountRecoveryFacet(address(barz)).approveAccountRecovery(recoveryPublicKey);
        assertEq(AccountRecoveryFacet(address(barz)).isRecoveryApproved(recoveryKeyHash, guardian2), true);

        skip(block.timestamp + Constants.defaultApprovalValidationPeriod);

        assertEq(AccountRecoveryFacet(address(barz)).isRecoveryApproved(recoveryKeyHash, guardian1), false);
        assertEq(AccountRecoveryFacet(address(barz)).isRecoveryApproved(recoveryKeyHash, guardian2), false);
    }

}