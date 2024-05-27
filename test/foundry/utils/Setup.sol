// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import "forge-std/Test.sol";
// base contracts
import {SecurityManager} from "../../../contracts/infrastructure/SecurityManager.sol";
import {FacetRegistry} from "../../../contracts/infrastructure/FacetRegistry.sol";
import {DefaultFallbackHandler} from "../../../contracts/infrastructure/DefaultFallbackHandler.sol";
import {EntryPoint} from "../../../contracts/aa-4337/core/EntryPoint.sol";
import {BarzFactory} from "../../../contracts/BarzFactory.sol";
import {Barz} from "../../../contracts/Barz.sol";
import {LibDiamond} from "../../../contracts/libraries/LibDiamond.sol";
import {WhitelistStorage} from "../../../contracts/infrastructure/WhitelistStorage.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
// facets
import {AccountFacet} from "../../../contracts/facets/AccountFacet.sol";
import {Secp256k1VerificationFacet} from "../../../contracts/facets/verification/secp256k1/Secp256k1VerificationFacet.sol";
import {Secp256r1VerificationFacet} from "../../../contracts/facets/verification/secp256r1/Secp256r1VerificationFacet.sol";
import {AccountRecoveryFacet} from "../../../contracts/facets/AccountRecoveryFacet.sol";
import {GuardianFacet} from "../../../contracts/facets/GuardianFacet.sol";
import {TokenReceiverFacet} from "../../../contracts/facets/TokenReceiverFacet.sol";
import {LockFacet} from "../../../contracts/facets/LockFacet.sol";
import {DiamondCutFacet} from "../../../contracts/facets/base/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../../../contracts/facets/base/DiamondLoupeFacet.sol";
import {RestrictionsFacet} from "../../../contracts/facets/RestrictionsFacet.sol";
import {SignatureMigrationFacet} from "../../../contracts/facets/SignatureMigrationFacet.sol";
// interfaces
import {IDiamondCut} from "../../../contracts/facets/base/interfaces/IDiamondCut.sol";
import {UserOperationLib, UserOperation} from "../../../contracts/aa-4337/interfaces/UserOperation.sol";
// constants
import {Constants} from "./Constants.sol";

contract Setup is Test {
    using ECDSA for bytes32;

    address public deployer;
    mapping(address => uint256) public nonce;

    EntryPoint public entryPoint;
    SecurityManager public securityManager;
    FacetRegistry public facetRegistry;
    DefaultFallbackHandler public defaultFallbackHandler;
    AccountFacet public accountFacet;
    Secp256k1VerificationFacet public k1Facet;
    Secp256r1VerificationFacet public r1Facet;
    AccountRecoveryFacet public accountRecoveryFacet;
    GuardianFacet public guardianFacet;
    LockFacet public lockFacet;
    DiamondCutFacet public diamondCutFacet;
    DiamondLoupeFacet public diamondLoupeFacet;
    RestrictionsFacet public restrictionsFacet;
    TokenReceiverFacet public tokenReceiverFacet;

    // DISCLAMER: Do not use the below private keys to store funds
    uint256 user1PrivateKey = 0x947dd69af402e7f48da1b845dfc1df6be593d01a0d8274bd03ec56712e7164e8;
    bytes public constant user1PublicKey =
        hex"04a464ab33c92f49bffbe52623b42c0ee045acf45c6a60e86aedd1b8b8ea92461e744d448c5081dac34c9ebc7823ee650e18541e9d21160d88c9b10ebce769d7b4";

    uint256 user2PrivateKey = 0x6ef4524143bd25de19ee1089aa389a594f580ce248107244a95cafc030dd9c5e;
    bytes public constant user2PublicKey =
        hex"049b372203900a3f5db35feafc223af7d02e80926e74c9f24db47e494dfcd19e83a7df341689358897c0be2613fad5ab5b92af51835acddede5341b15abd26c625";
    uint256 walletCreationSalt = 1;

    function _setUpBarzFactory() public returns (BarzFactory barzFactory) {
        accountFacet = _setUpAccountFacet();
        k1Facet = _setUpK1Facet();
        r1Facet = _setUpR1Facet();
        diamondLoupeFacet = _setUpDiamondLoupeFacet();
        restrictionsFacet = _setUpRestrictionsFacet();
        securityManager = _setUpSecurityManager();
        lockFacet = _setUpLockFacet(address(securityManager));
        accountRecoveryFacet = _setUpAccountRecoveryFacet(address(securityManager));
        guardianFacet = _setUpGuardianFacet(address(securityManager));
        tokenReceiverFacet = _setUpTokenReceiverFacet();
        facetRegistry = _setUpFacetRegistry(address(accountFacet), address(lockFacet), address(guardianFacet), address(k1Facet), address(r1Facet), address(restrictionsFacet), address(accountRecoveryFacet));
        diamondCutFacet = _setUpDiamondCutFacet(address(securityManager));
        defaultFallbackHandler = _setUpDefaultFallbackHandler(address(diamondCutFacet), address(accountFacet), address(tokenReceiverFacet), address(diamondLoupeFacet));
        entryPoint = new EntryPoint();

        barzFactory = new BarzFactory(
            address(accountFacet),
            address(entryPoint),
            address(facetRegistry),
            address(defaultFallbackHandler)
        );
    }

    function _setUpDefaultFallbackHandler(
        address _diamondCutFacet,
        address _accountFacet,
        address _tokenReceiverFacet,
        address _diamondLoupeFacet
    ) internal returns (DefaultFallbackHandler defaultFallbackHandler_) {
        vm.startPrank(deployer);
        defaultFallbackHandler_ = new DefaultFallbackHandler(
            _diamondCutFacet,
            _accountFacet,
            _tokenReceiverFacet,
            _diamondLoupeFacet
        );
        vm.stopPrank();
    }

    function _setUpSecurityManager()
        internal
        returns (SecurityManager securityManager_)
    {
        vm.startPrank(deployer);
        securityManager_ = new SecurityManager(deployer);
        securityManager_.initializeSecurityWindow(
            Constants.defaultSecurityWindow,
            Constants.minSecurityWindow,
            Constants.maxSecurityWindow
        );
        securityManager_.initializeAdditionSecurityPeriod(
            Constants.defaultAdditionSecurityPeriod,
            Constants.minAdditionSecurityPeriod,
            Constants.maxAdditionSecurityPeriod
        );
        securityManager_.initializeRemovalSecurityPeriod(
            Constants.defaultRemovalSecurityPeriod,
            Constants.minRemovalSecurityPeriod,
            Constants.maxRemovalSecurityPeriod
        );
        securityManager_.initializeRecoveryPeriod(
            Constants.defaultRecoveryPeriod,
            Constants.minRecoveryPeriod,
            Constants.maxRecoveryPeriod
        );
        securityManager_.initializeLockPeriod(
            Constants.defaultLockPeriod,
            Constants.minLockPeriod,
            Constants.maxLockPeriod
        );
        securityManager_.initializeMigrationPeriod(
            Constants.defaultMigrationPeriod,
            Constants.minMigrationPeriod,
            Constants.maxMigrationPeriod
        );
        securityManager_.initializeApprovalValidationPeriod(
            Constants.defaultApprovalValidationPeriod,
            Constants.minApprovalValidationPeriod,
            Constants.maxApprovalValidationPeriod
        );
        vm.stopPrank();
    }

    function _setUpAccountFacet()
        internal
        returns (AccountFacet accountFacet_)
    {
        vm.startPrank(deployer);
        accountFacet_ = new AccountFacet();
        vm.stopPrank();
    }

    function _setUpK1Facet()
        internal
        returns (Secp256k1VerificationFacet k1Facet_)
    {
        vm.startPrank(deployer);
        k1Facet_ = new Secp256k1VerificationFacet();
        vm.stopPrank();
    }

    function _setUpR1Facet()
        internal
        returns (Secp256r1VerificationFacet r1Facet_)
    {
        vm.startPrank(deployer);
        r1Facet_ = new Secp256r1VerificationFacet();
        vm.stopPrank();
    }

    function _setUpLockFacet(
        address _securityManager
    ) internal returns (LockFacet lockFacet_) {
        vm.startPrank(deployer);
        lockFacet_ = new LockFacet(_securityManager);
        vm.stopPrank();
    }

    function _setUpGuardianFacet(
        address _securityManager
    ) internal returns (GuardianFacet guardianFacet_) {
        vm.startPrank(deployer);
        guardianFacet_ = new GuardianFacet(_securityManager);
        vm.stopPrank();
    }

    function _setUpAccountRecoveryFacet(
        address _securityManager
    ) internal returns (AccountRecoveryFacet accountRecoveryFacet_) {
        vm.startPrank(deployer);
        accountRecoveryFacet_ = new AccountRecoveryFacet(_securityManager);
        vm.stopPrank();
    }

    function _setUpDiamondCutFacet(
        address _securityManager
    ) internal returns (DiamondCutFacet diamondCutFacet_) {
        vm.startPrank(deployer);
        diamondCutFacet_ = new DiamondCutFacet(_securityManager);
        vm.stopPrank();
    }

    function _setUpDiamondLoupeFacet()
        internal
        returns (DiamondLoupeFacet diamondLoupeFacet_)
    {
        vm.startPrank(deployer);
        diamondLoupeFacet_ = new DiamondLoupeFacet();
        vm.stopPrank();
    }

    function _setUpRestrictionsFacet()
        internal
        returns (RestrictionsFacet restrictionsFacet_)
    {
        vm.startPrank(deployer);
        restrictionsFacet_ = new RestrictionsFacet();
        vm.stopPrank();
    }

    function _setUpTokenReceiverFacet()
        internal
        returns (TokenReceiverFacet tokenReceiverFacet_)
    {
        vm.startPrank(deployer);
        tokenReceiverFacet_ = new TokenReceiverFacet();
        vm.stopPrank();
    }

    function _setUpFacetRegistry(
        address _accountFacet,
        address _lockFacet,
        address _guardianFacet,
        address _k1Facet,
        address _r1Facet,
        address _restrictionsFacet,
        address _accountRecoveryFacet
    ) internal returns (FacetRegistry facetRegistry_) {
        vm.startPrank(deployer);
        facetRegistry_ = new FacetRegistry(deployer);
        facetRegistry_.registerFacetFunctionSelectors(
            _accountFacet,
            Constants.accountFacetSelectors()
        );
        facetRegistry_.registerFacetFunctionSelectors(
            _lockFacet,
            Constants.lockFacetSelectors()
        );
        facetRegistry_.registerFacetFunctionSelectors(
            _guardianFacet,
            Constants.guardianFacetSelectors()
        );
        facetRegistry_.registerFacetFunctionSelectors(
            _k1Facet,
            Constants.k1FacetSelectors()
        );
        facetRegistry_.registerFacetFunctionSelectors(
            _r1Facet,
            Constants.r1FacetSelectors()
        );
        facetRegistry_.registerFacetFunctionSelectors(
            _restrictionsFacet,
            Constants.restrictionsFacetSelectors()
        );
        facetRegistry_.registerFacetFunctionSelectors(
            _accountRecoveryFacet,
            Constants.accountRecoveryFacetSelectors()
        );
        vm.stopPrank();
    }

    function _setUpSigners(
        uint256 _count,
        uint256[] memory _privateKeys,
        uint256 _nativeBalance
    ) internal returns (address[] memory signers) {
        signers = new address[](_count);
        for (uint256 i; i < _count; i++) {
            address user;
            if (i < _privateKeys.length) {
                user = vm.addr(_privateKeys[i]);
            } else {
                user = vm.addr(i);
            }
            signers[i] = user;
            nonce[user] = 0;
            vm.deal(user, _nativeBalance);
        }
    }

    function publicKeyToAddress(
        bytes memory _publicKey
    ) public pure returns (address walletAddress) {
        require(_publicKey.length == 65, "_publicKey length is not 65 bytes");
        bytes32 addrHash = keccak256(slice(_publicKey, 1, 64)); // Remove 0x04 prefix, then hash
        walletAddress = address(uint160(uint256(addrHash)));
    }

    function bytesToAddress(
        bytes memory _bytesAddress
    ) public pure returns (address walletAddress) {
        require(_bytesAddress.length == 20, "Invalid length for an address");

        uint160 addr;
        assembly {
            addr := mload(add(_bytesAddress, 20))
        }
        walletAddress = address(addr);
    }

    function slice(
        bytes memory _data,
        uint _start,
        uint _length
    ) public pure returns (bytes memory part) {
        part = new bytes(_length);
        for (uint256 i; i < _length; i++) {
            part[i] = _data[i + _start];
        }
    }

    function prepareUserOp(address _barz, uint256 _nonce, bytes calldata _calldata)
        public pure
        returns (UserOperation memory userOp)
    {
        userOp = UserOperation({
            sender: _barz,
            nonce: _nonce,
            initCode: new bytes(0x0),
            callData: _calldata,
            callGasLimit: 2000000,
            verificationGasLimit: 200000,
            preVerificationGas: 21000,
            maxFeePerGas: 1,
            maxPriorityFeePerGas: 1e9,
            paymasterAndData: new bytes(0x0),
            signature: new bytes(0x0)
        });
    }

    function signUserOperation(UserOperation[] memory _userOps, uint256[] memory _privateKeys) public view returns (UserOperation[] memory userOps) {
        require(_userOps.length == _privateKeys.length, "Setup::signUserOperation UserOp - Key length mismatch");
        for (uint256 i; i< _userOps.length; i++) {
            bytes32 hashedUserOp = this.hashUserOp(_userOps[i]);
            bytes32 data = keccak256(abi.encode(hashedUserOp, address(entryPoint), getChainId()));
            data = data.toEthSignedMessageHash();

            (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKeys[i], data);
            _userOps[i].signature = abi.encodePacked(r, s, v);
        }
        userOps = _userOps;
    }

    function getChainId() public view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    function hashUserOp(UserOperation calldata userOp) public pure returns (bytes32 hashedUserOp) {
        hashedUserOp = UserOperationLib.hash(userOp);
    }

    function populateAddressList(address _addr, uint256 _count) internal pure returns (address[] memory owners) {
        owners = new address[](_count);
        for(uint256 i; i < _count; i++) {
            owners[i] = _addr;
        }
    }

    function encodeExecuteCall(address _destination, uint256 _value, bytes memory _calldata) public pure returns (bytes memory callData) {
        callData =
            abi.encodeWithSignature("execute(address,uint256,bytes)", _destination, _value, _calldata);
    }

    function encodeExecuteBatchCall(address[] memory _destination, uint256[] memory _value, bytes[] memory _calldata) public pure returns (bytes memory callData) {
        callData =
            abi.encodeWithSignature("executeBatch(address[],uint256[],bytes[])", _destination, _value, _calldata);
    }

    function encodeDiamondCutCall(IDiamondCut.FacetCut[] memory _cut, address _init, bytes memory _initData) public pure returns (bytes memory cutData) {
        cutData = abi.encodeWithSignature(
            "diamondCut((address,uint8,bytes4[])[],address,bytes)", _cut, _init, _initData
        );
    }

    function cutFacet(address _facet, IDiamondCut.FacetCutAction _action, bytes4[] memory _selectors, address _barz, uint256 _ownerKey) public {
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](1);

        cut[0] = IDiamondCut.FacetCut({
            facetAddress: _facet,
            action: _action,
            functionSelectors: _selectors
        });

        bytes memory cutData = abi.encodeWithSignature(
            "diamondCut((address,uint8,bytes4[])[],address,bytes)", cut, address(0), new bytes(0x00)
        );

        bytes memory callData = encodeExecuteCall(_barz, 0, cutData);
        UserOperation[] memory userOp = new UserOperation[](1);
        uint256[] memory signingKey = new uint256[](1);

        userOp[0] = this.prepareUserOp(address(_barz), nonce[address(_barz)]++, callData);
        signingKey[0] = _ownerKey;

        userOp = signUserOperation(userOp, signingKey);

        entryPoint.handleOps(userOp, payable(_barz));
    }

}
