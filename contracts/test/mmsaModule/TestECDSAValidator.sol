// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IHook} from "../../facets/mmsa/interfaces/IHook.sol";
import {IValidator} from "../../facets/mmsa/interfaces/IValidator.sol";
import {UserOperation} from "../../aa-4337/interfaces/UserOperation.sol";
import {VALIDATOR_MODULE_TYPE, HOOK_MODULE_TYPE} from "../../facets/mmsa/utils/Constants.sol";

struct ECDSAValidatorStorage {
    address owner;
}

contract TestECDSAValidator is IValidator, IHook {
    bytes4 constant ERC1271_MAGICVALUE = 0x1626ba7e;
    bytes4 constant ERC1271_INVALID = 0xffffffff;

    event OwnerRegistered(address indexed kernel, address indexed owner);

    error NotInitialized(address account);

    mapping(address => ECDSAValidatorStorage) public ecdsaValidatorStorage;

    function onInstall(bytes calldata _data) external override {
        address owner = address(bytes20(_data[0:20]));
        ecdsaValidatorStorage[msg.sender].owner = owner;
        emit OwnerRegistered(msg.sender, owner);
    }

    function onUninstall(bytes calldata) external override {
        if (!_isInitialized(msg.sender)) revert NotInitialized(msg.sender);
        delete ecdsaValidatorStorage[msg.sender];
    }

    function isModuleType(
        uint256 typeID
    ) external pure override returns (bool) {
        return typeID == VALIDATOR_MODULE_TYPE || typeID == HOOK_MODULE_TYPE;
    }

    function isInitialized(address smartAccount) external view returns (bool) {
        return _isInitialized(smartAccount);
    }

    function _isInitialized(address smartAccount) internal view returns (bool) {
        return ecdsaValidatorStorage[smartAccount].owner != address(0);
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) external override returns (uint256) {
        address owner = ecdsaValidatorStorage[msg.sender].owner;
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

    function isValidSignatureWithSender(
        address,
        bytes32 hash,
        bytes calldata sig
    ) external view override returns (bytes4) {
        address owner = ecdsaValidatorStorage[msg.sender].owner;
        if (owner == ECDSA.recover(hash, sig)) {
            return ERC1271_MAGICVALUE;
        }
        bytes32 ethHash = ECDSA.toEthSignedMessageHash(hash);
        address recovered = ECDSA.recover(ethHash, sig);
        if (owner != recovered) {
            return ERC1271_INVALID;
        }
        return ERC1271_MAGICVALUE;
    }

    function preCheck(
        address msgSender,
        uint256,
        bytes calldata
    ) external override returns (bytes memory) {
        require(
            msgSender == ecdsaValidatorStorage[msg.sender].owner,
            "ECDSAValidator: sender is not owner"
        );
        return hex"";
    }

    function postCheck(bytes calldata hookData) external override {}
}
