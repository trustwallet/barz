// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IEntryPoint} from "../aa-4337/interfaces/IEntryPoint.sol";
import {IFacetRegistry} from "../infrastructure/interfaces/IFacetRegistry.sol";

/*
 * @title App Storage
 * @dev App storage for Barz contract to prevent storage collision
 * @author David Yongjun Kim (@Powerstream3604)
 * @author Ruslan Serebriakov (@rsrbk)
 */

struct Lock {
    uint64 release;
    bytes4 locker;
}

struct InitializersStorage {
    // NOTE: initialized is a variable to make sure the initialization is only done once.
    uint8 signerInitialized;
    uint8 accountInitialized;
    uint8 restrictionsInitialized;
}

struct AppStorage {
    mapping(uint256 => InitializersStorage) initStorage;
    uint8 signerMigration;
    bytes4 validateOwnerSignatureSelector;
    IEntryPoint entryPoint;
    IFacetRegistry facetRegistry;
    mapping(uint256 => Lock) locks;
}

library LibAppStorage {
    error LibAppStorage__AccountAlreadyUninitialized();
    error LibAppStorage__AccountMustBeUninitialized();
    error LibAppStorage__SignerAlreadyUninitialized();
    error LibAppStorage__SignerMustBeUninitialized();

    function appStorage() internal pure returns (AppStorage storage ds) {
        assembly {
            ds.slot := 0
        }
    }

    function setSignerUninitialized() internal {
        AppStorage storage s = appStorage();
        if (1 != s.initStorage[0].signerInitialized) {
            revert LibAppStorage__SignerAlreadyUninitialized();
        }
        s.initStorage[0].signerInitialized = 0;
    }

    function getValidateOwnerSignatureSelector()
        internal
        view
        returns (bytes4 selector)
    {
        selector = appStorage().validateOwnerSignatureSelector;
    }

    function setValidateOwnerSignatureSelector(
        bytes4 _validateOwnerSignatureSelector
    ) internal {
        appStorage()
            .validateOwnerSignatureSelector = _validateOwnerSignatureSelector;
    }

    function enforceSignerInitialize() internal {
        AppStorage storage s = appStorage();
        if (0 != s.initStorage[0].signerInitialized) {
            revert LibAppStorage__SignerMustBeUninitialized();
        }
        s.initStorage[0].signerInitialized = 1;
    }

    function enforceAccountInitialize() internal {
        AppStorage storage s = appStorage();
        if (0 != s.initStorage[0].accountInitialized) {
            revert LibAppStorage__AccountMustBeUninitialized();
        }
        s.initStorage[0].accountInitialized = 1;
    }

    function initiateSignerMigration() internal {
        appStorage().signerMigration = 1;
    }

    function enforceSignerMigration() internal view {
        if (1 != appStorage().signerMigration) {
            revert LibAppStorage__AccountMustBeUninitialized();
        }
    }

    function finalizeSignerMigration() internal {
        appStorage().signerMigration = 0;
    }

    function setLock(uint256 _releaseAfter, bytes4 _locker) internal {
        appStorage().locks[0] = Lock(SafeCast.toUint64(_releaseAfter), _locker);
    }

    function enforceRestrictionsInitialize() internal {
        AppStorage storage s = appStorage();
        if (0 != s.initStorage[0].restrictionsInitialized)
            revert LibAppStorage__SignerMustBeUninitialized();
        s.initStorage[0].restrictionsInitialized = 1;
    }

    function setRestrictionsUninitialized() internal {
        AppStorage storage s = appStorage();
        if (1 != s.initStorage[0].restrictionsInitialized)
            revert LibAppStorage__AccountAlreadyUninitialized();
        s.initStorage[0].restrictionsInitialized = 0;
    }
}

contract BarzStorage {
    AppStorage internal s;
    modifier onlyWhenUnlocked() {
        require(
            uint64(block.timestamp) >= s.locks[0].release,
            "Account Locked"
        );
        _;
    }
    modifier onlyWhenLocked() {
        require(
            uint64(block.timestamp) < s.locks[0].release,
            "Account Unlocked"
        );
        _;
    }
}
