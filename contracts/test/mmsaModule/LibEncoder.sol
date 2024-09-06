// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {Execution, ExecMode, CallType, ExecType, ExecModeSelector, ExecModePayload} from "../../facets/mmsa/utils/Types.sol";

// Default CallType
CallType constant CALLTYPE_SINGLE = CallType.wrap(0x00);
// Batched CallType
CallType constant CALLTYPE_BATCH = CallType.wrap(0x01);

CallType constant CALLTYPE_STATIC = CallType.wrap(0xFE);

// @dev Implementing delegatecall is OPTIONAL!
// implement delegatecall with extreme care.
CallType constant CALLTYPE_DELEGATECALL = CallType.wrap(0xFF);

// @dev default behavior is to revert on failure
// To allow very simple accounts to use mode encoding, the default behavior is to revert on failure
// Since this is value 0x00, no additional encoding is required for simple accounts
ExecType constant EXECTYPE_DEFAULT = ExecType.wrap(0x00);
// @dev account may elect to change execution behavior. For example "try exec" / "allow fail"
ExecType constant EXECTYPE_TRY = ExecType.wrap(0x01);

ExecModeSelector constant MODE_DEFAULT = ExecModeSelector.wrap(
    bytes4(0x00000000)
);
// Example declaration of a custom mode selector
ExecModeSelector constant MODE_OFFSET = ExecModeSelector.wrap(
    bytes4(keccak256("default.mode.offset"))
);

library LibEncoder {
    function decode(
        ExecMode mode
    )
        internal
        pure
        returns (
            CallType _calltype,
            ExecType _execType,
            ExecModeSelector _execModeSelector,
            ExecModePayload _execModePayload
        )
    {
        assembly {
            _calltype := mode
            _execType := shl(8, mode)
            _execModeSelector := shl(48, mode)
            _execModePayload := shl(80, mode)
        }
    }

    function decodeBasic(
        ExecMode mode
    ) internal pure returns (CallType _calltype, ExecType _execType) {
        assembly {
            _calltype := mode
            _execType := shl(8, mode)
        }
    }

    function encode(
        CallType callType,
        ExecType execType,
        ExecModeSelector mode,
        ExecModePayload payload
    ) internal pure returns (ExecMode) {
        return
            ExecMode.wrap(
                bytes32(
                    abi.encodePacked(
                        callType,
                        execType,
                        bytes4(0),
                        ExecModeSelector.unwrap(mode),
                        payload
                    )
                )
            );
    }

    function encodeSimpleBatch() internal pure returns (ExecMode mode) {
        mode = encode(
            CALLTYPE_BATCH,
            EXECTYPE_DEFAULT,
            MODE_DEFAULT,
            ExecModePayload.wrap(0x00)
        );
    }

    function encodeSimpleSingle() internal pure returns (ExecMode mode) {
        mode = encode(
            CALLTYPE_SINGLE,
            EXECTYPE_DEFAULT,
            MODE_DEFAULT,
            ExecModePayload.wrap(0x00)
        );
    }

    function encodeTrySingle() internal pure returns (ExecMode mode) {
        mode = encode(
            CALLTYPE_SINGLE,
            EXECTYPE_TRY,
            MODE_DEFAULT,
            ExecModePayload.wrap(0x00)
        );
    }

    function encodeTryBatch() internal pure returns (ExecMode mode) {
        mode = encode(
            CALLTYPE_BATCH,
            EXECTYPE_TRY,
            MODE_DEFAULT,
            ExecModePayload.wrap(0x00)
        );
    }

    function encodeCustom(
        CallType callType,
        ExecType execType
    ) internal pure returns (ExecMode mode) {
        mode = encode(
            callType,
            execType,
            MODE_DEFAULT,
            ExecModePayload.wrap(0x00)
        );
    }

    function getCallType(
        ExecMode mode
    ) internal pure returns (CallType calltype) {
        assembly {
            calltype := mode
        }
    }

    function encodeExecute(
        address target,
        uint256 value,
        bytes memory data
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(target, value, data);
    }

    function encodeBatch(
        Execution[] memory executions
    ) internal pure returns (bytes memory) {
        return abi.encode(executions);
    }
}
