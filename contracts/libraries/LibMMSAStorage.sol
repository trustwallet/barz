// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {LibSentinelList} from "./LibSentinelList.sol";
import {IERC7484} from "../interfaces/ERC/IERC7484.sol";
import {IHook} from "../facets/mmsa/interfaces/IHook.sol";
import {ISigner} from "../facets/mmsa/interfaces/ISigner.sol";
import {CallType, PermissionId, PassFlag, PolicyData} from "../facets/mmsa/utils/Types.sol";

struct FallbackHandler {
    address handler;
    ///< The address of the fallback function handler.
    CallType calltype;
}
///< The type of call this handler supports (e.g., static or delegatecall).

struct PermissionConfig {
    PassFlag permissionFlag;
    ISigner signer;
    PolicyData[] policyData;
}

struct MMSAStorage {
    LibSentinelList.SentinelList validators;
    LibSentinelList.SentinelList executors;
    mapping(bytes4 => FallbackHandler) fallbacks;
    mapping(PermissionId => PermissionConfig) permissionConfig;
    IHook hook;
    bool isInitialized;
    IERC7484 registry;
}

library LibMMSAStorage {
    bytes32 private constant MMSA_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.MMSAStorage");

    function mmsaStorage() internal pure returns (MMSAStorage storage ds) {
        bytes32 storagePosition = MMSA_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }
}
