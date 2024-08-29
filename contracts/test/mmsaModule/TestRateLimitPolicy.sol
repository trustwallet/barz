pragma solidity ^0.8.0;

import "./base/PolicyBase.sol";
import {ValidAfter, ValidUntil} from "../../facets/mmsa/utils/Types.sol";
import {UserOperation} from "../../aa-4337/interfaces/UserOperation.sol";

enum Status {
    NA,
    Live,
    Deprecated
}

struct RateLimitConfig {
    uint48 interval;
    uint48 count;
    ValidAfter startAt;
}

contract TestRateLimitPolicy is PolicyBase {
    mapping(address => uint256) public usedIds;
    mapping(bytes32 id => mapping(address => Status)) public status;
    mapping(bytes32 id => mapping(address kernel => RateLimitConfig)) public rateLimitConfigs;

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
        RateLimitConfig memory config = rateLimitConfigs[id][msg.sender];
        if (config.count == 0) {
            return 1;
        }
        rateLimitConfigs[id][msg.sender].count = config.count - 1;
        rateLimitConfigs[id][msg.sender].startAt = ValidAfter.wrap(ValidAfter.unwrap(config.startAt) + config.interval);
        return _packValidationData(config.startAt, ValidUntil.wrap(0));
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
        uint48 delay = uint48(bytes6(_data[0:6]));
        uint48 count = uint48(bytes6(_data[6:12]));
        uint48 startAt = uint48(bytes6(_data[12:18]));
        rateLimitConfigs[id][msg.sender] = RateLimitConfig(delay, count, ValidAfter.wrap(startAt));
        status[id][msg.sender] = Status.Live;
        usedIds[msg.sender]++;
    }

    function _policyOnUninstall(bytes32 id, bytes calldata _data) internal override {
        require(status[id][msg.sender] == Status.Live);
        status[id][msg.sender] = Status.Deprecated;
        usedIds[msg.sender]--;
    }

    function _packValidationData(ValidAfter validAfter, ValidUntil validUntil) internal returns (uint256) {
        return uint256(ValidAfter.unwrap(validAfter)) << 208 | uint256(ValidUntil.unwrap(validUntil)) << 160;
    }
}
