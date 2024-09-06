// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {ExecMode, CallType, ExecType, ExecModeSelector, ExecModePayload} from "../facets/mmsa/utils/Types.sol";

/// @dev LibMode is a helper library to encode/decode ModeCodes
library LibMode {
    function decode(
        ExecMode mode
    )
        internal
        pure
        returns (
            CallType _calltype,
            ExecType _execType,
            ExecModeSelector _modeSelector,
            ExecModePayload _modePayload
        )
    {
        assembly {
            _calltype := mode
            _execType := shl(8, mode)
            _modeSelector := shl(48, mode)
            _modePayload := shl(80, mode)
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
}
