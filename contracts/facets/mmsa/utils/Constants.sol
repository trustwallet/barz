// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {CallType, ExecType, ValidationType, PassFlag} from "./Types.sol";

// Module type identifier for validators
uint256 constant VALIDATOR_MODULE_TYPE = 1;

// Module type identifier for executors
uint256 constant EXECUTOR_MODULE_TYPE = 2;

// Module type identifier for fallback handlers
uint256 constant FALLBACK_MODULE_TYPE = 3;

// Module type identifier for hooks
uint256 constant HOOK_MODULE_TYPE = 4;

// Module type for policies
uint256 constant POLICY_MODULE_TYPE = 5;

// Module type for signers
uint256 constant SIGNER_MODULE_TYPE = 6;

// --- ERC7579 calltypes ---
CallType constant CALLTYPE_SINGLE = CallType.wrap(0x00);

CallType constant CALLTYPE_BATCH = CallType.wrap(0x01);

CallType constant CALLTYPE_STATIC = CallType.wrap(0xFE);

CallType constant CALLTYPE_DELEGATECALL = CallType.wrap(0xff);

// --- ERC7579 exectypes ---
ExecType constant EXECTYPE_DEFAULT = ExecType.wrap(0x00);

ExecType constant EXECTYPE_TRY = ExecType.wrap(0x01);

// --- permission skip flags ---
PassFlag constant SKIP_USEROP = PassFlag.wrap(0x0001);
PassFlag constant SKIP_SIGNATURE = PassFlag.wrap(0x0002);

// --- ERC7579 exectypes ---
ValidationType constant VALIDATOR_VALIDATION_TYPE = ValidationType.wrap(0x01);
ValidationType constant PERMISSION_VALIDATION_TYPE = ValidationType.wrap(0x02);

uint256 constant VALIDATION_FAILURE = 1;
