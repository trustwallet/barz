// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {Execution} from "./Types.sol";

contract Executor {
    event TryExecFailure(uint256 index, bytes result);

    error TargetIsSelf();

    function _decodeBatch(
        bytes calldata _calldata
    ) internal pure returns (Execution[] calldata executionBatch) {
        /*
         * Batch Call Calldata Layout
         * Offset (in bytes)    | Length (in bytes) | Contents
         * 0x0                  | 0x4               | bytes4 function selector
        *  0x4                  | -                 |
        abi.encode(IERC7579Execution.Execution[])
         */
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            let dataPointer := add(
                _calldata.offset,
                calldataload(_calldata.offset)
            )

            // Extract the ERC7579 Executions
            executionBatch.offset := add(dataPointer, 32)
            executionBatch.length := calldataload(dataPointer)
        }
    }

    function _decodeSingle(
        bytes calldata _calldata
    )
        internal
        pure
        returns (address target, uint256 value, bytes calldata callData)
    {
        target = address(bytes20(_calldata[0:20]));
        value = uint256(bytes32(_calldata[20:52]));
        callData = _calldata[52:];
    }

    function _execute(
        Execution[] calldata _executions
    ) internal returns (bytes[] memory results) {
        results = new bytes[](_executions.length);

        for (uint256 i = 0; i < _executions.length; ) {
            Execution calldata execution = _executions[i];
            results[i] = _execute(
                execution.target,
                execution.value,
                execution.callData
            );
        }
    }

    function _tryExecute(
        Execution[] calldata _executions
    ) internal returns (bytes[] memory results) {
        results = new bytes[](_executions.length);

        for (uint256 i; i < _executions.length; i++) {
            Execution calldata execution = _executions[i];
            bool success;
            (success, results[i]) = _tryExecute(
                execution.target,
                execution.value,
                execution.callData
            );
            if (!success) {
                emit TryExecFailure(i, results[i]);
            }
        }
    }

    function _execute(
        address _target,
        uint256 _value,
        bytes calldata _calldata
    ) internal returns (bytes memory result) {
        _checkTarget(_target);
        /// @solidity memory-safe-assembly
        assembly {
            result := mload(0x40)
            calldatacopy(result, _calldata.offset, _calldata.length)

            if iszero(
                call(
                    gas(),
                    _target,
                    _value,
                    result,
                    _calldata.length,
                    codesize(),
                    0x00
                )
            ) {
                returndatacopy(result, 0x00, returndatasize())
                revert(result, returndatasize())
            }

            mstore(result, returndatasize())
            let o := add(result, 0x20)
            returndatacopy(o, 0x00, returndatasize())
            mstore(0x40, add(o, returndatasize()))
        }
    }

    function _tryExecute(
        address _target,
        uint256 _value,
        bytes calldata _calldata
    ) internal returns (bool success, bytes memory result) {
        _checkTarget(_target);
        /// @solidity memory-safe-assembly
        assembly {
            result := mload(0x40)
            calldatacopy(result, _calldata.offset, _calldata.length)
            success := call(
                gas(),
                _target,
                _value,
                result,
                _calldata.length,
                codesize(),
                0x00
            )
            mstore(result, returndatasize())
            let o := add(result, 0x20)
            returndatacopy(o, 0x00, returndatasize())
            mstore(0x40, add(o, returndatasize()))
        }
    }

    function _checkTarget(address _target) internal view {
        if (_target == address(this)) {
            revert TargetIsSelf();
        }
    }
}
