pragma solidity ^0.8.0;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignerBase} from "./base/SignerBase.sol";
import {UserOperation} from "../../aa-4337/interfaces/UserOperation.sol";

contract TestECDSASigner is SignerBase {
    mapping(address => uint256) public usedIds;
    mapping(bytes32 id => mapping(address wallet => address)) public signer;

    function isInitialized(
        address wallet
    ) external view override returns (bool) {
        return usedIds[wallet] > 0;
    }

    function checkUserOpSignature(
        bytes32 id,
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) external payable override returns (uint256) {
        address owner = signer[id][msg.sender];
        bytes calldata sig = userOp.signature;
        if (owner == ECDSA.recover(userOpHash, sig)) {
            return 0;
        }
        bytes32 ethHash = ECDSA.toEthSignedMessageHash(userOpHash);
        address recovered = ECDSA.recover(ethHash, sig);
        if (owner != recovered) {
            return 1;
        }
        return 0;
    }

    function checkSignature(
        bytes32 id,
        address sender,
        bytes32 hash,
        bytes calldata sig
    ) external view override returns (bytes4) {
        address owner = signer[id][msg.sender];
        if (owner == ECDSA.recover(hash, sig)) {
            return 0x1626ba7e;
        }
        bytes32 ethHash = ECDSA.toEthSignedMessageHash(hash);
        address recovered = ECDSA.recover(ethHash, sig);
        if (owner != recovered) {
            return 0xffffffff;
        }
        return 0x1626ba7e;
    }

    function _signerOninstall(
        bytes32 id,
        bytes calldata _data
    ) internal override {
        require(signer[id][msg.sender] == address(0));
        usedIds[msg.sender]++;
        signer[id][msg.sender] = address(bytes20(_data[0:20]));
    }

    function _signerOnUninstall(bytes32 id, bytes calldata) internal override {
        require(signer[id][msg.sender] != address(0));
        delete signer[id][msg.sender];
        usedIds[msg.sender]--;
    }
}
