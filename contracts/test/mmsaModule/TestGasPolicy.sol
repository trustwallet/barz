pragma solidity ^0.8.0;

import "./base/PolicyBase.sol";
import {UserOperation} from "../../aa-4337/interfaces/UserOperation.sol";

enum Status {
    NA,
    Live,
    Deprecated
}

struct GasPolicyConfig {
    uint256 allowed;
    bool enforcePaymaster;
    address allowedPaymaster;
}

contract TestGasPolicy is PolicyBase {
    mapping(address => uint256) public usedIds;
    mapping(bytes32 id => mapping(address => Status)) public status;
    mapping(bytes32 id => mapping(address => GasPolicyConfig)) public gasPolicyConfig;

    function isInitialized(address wallet) external view override returns (bool) {
        return usedIds[wallet] > 0;
    }

    function checkUserOpPolicy(bytes32 id, UserOperation calldata userOp)
        external
        payable
        override
        returns (uint256)
    {
        require(status[id][msg.sender] == Status.Live);

        uint256 maxAmount = (userOp.preVerificationGas + userOp.verificationGasLimit + userOp.callGasLimit) * userOp.maxFeePerGas;
        if (gasPolicyConfig[id][msg.sender].enforcePaymaster) {
            if (
                gasPolicyConfig[id][msg.sender].allowedPaymaster != address(0)
                    && address(bytes20(userOp.paymasterAndData[0:20])) != gasPolicyConfig[id][msg.sender].allowedPaymaster
            ) {
                return 1;
            }
        }
        if (maxAmount > gasPolicyConfig[id][msg.sender].allowed) {
            return 1;
        }
        gasPolicyConfig[id][msg.sender].allowed -= maxAmount;
        return 0;
    }

    function checkSignaturePolicy(bytes32 id, address sender, bytes32 hash, bytes calldata sig)
        external
        view
        override
        returns (uint256)
    {
        require(status[id][msg.sender] == Status.Live);
        return 0;
    }

    function _policyOninstall(bytes32 id, bytes calldata _data) internal override {
        require(status[id][msg.sender] == Status.NA);
        (uint256 allowed, bool enforcePaymaster, address allowedPaymaster) = abi.decode(_data, (uint256, bool, address));

        gasPolicyConfig[id][msg.sender] = GasPolicyConfig(allowed, enforcePaymaster, allowedPaymaster);
        status[id][msg.sender] = Status.Live;
        usedIds[msg.sender]++;
    }

    function _policyOnUninstall(bytes32 id, bytes calldata _data) internal override {
        require(status[id][msg.sender] == Status.Live);
        status[id][msg.sender] = Status.Deprecated;
        usedIds[msg.sender]--;
    }
}
