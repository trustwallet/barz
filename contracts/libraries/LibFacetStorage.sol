// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title Facet Storage
 * @dev Storage contract to store each facets variables with diamond storage
 * @author David Yongjun Kim (@Powerstream3604)
 * @author Ruslan Serebriakov (@rsrbk)
 */

struct Secp256k1VerificationStorage {
    address signer;
}

struct Secp256r1VerificationStorage {
    uint256[2] q;
}

struct GuardianStorage {
    mapping(bytes32 => uint256) pending;
    mapping(uint8 => StorageConfig) configs;
}

struct Info {
    bool exists;
    uint128 index;
}

struct StorageConfig {
    address[] addresses;
    mapping(address => Info) info;
}

struct RecoveryConfig {
    bytes recoveryPublicKey;
    uint64 executeAfter;
}

struct ApprovalConfig {
    bool isApproved;
    uint64 validUntil;
}

struct RecoveryApprovalConfig {
    mapping(bytes32 => mapping(address => ApprovalConfig)) isNewOwnerApproved;
}

struct RecoveryStorage {
    mapping(uint8 => RecoveryConfig) recoveryConfigs;
    mapping(uint8 => RecoveryApprovalConfig) recoveryApprovalConfigs;
    uint128 nonce;
}

struct RestrictionsStorage {
    address[] restrictions;
    mapping(address => bool) exists;
}

struct SignatureMigrationConfig {
    bytes migrationPublicKey;
    address migrationVerificationFacet;
    bytes4[] migrationSelectors;
    uint64 migrateAfter;
}

struct SignatureMigrationApprovalConfig {
    mapping(bytes32 => mapping(address => ApprovalConfig)) isMigrationApproved;
}

struct SignatureMigrationStorage {
    mapping(uint8 => SignatureMigrationConfig) migrationConfigs;
    mapping(uint8 => SignatureMigrationApprovalConfig) migrationApprovalConfigs;
    uint128 nonce;
}

struct DiamondCutApprovalConfig {
    mapping(bytes32 => mapping(address => ApprovalConfig)) isDiamondCutApproved;
}

struct DiamondCutStorage {
    mapping(uint8 => DiamondCutApprovalConfig) diamondCutApprovalConfigs;
    uint128 nonce;
}

struct LockStorage {
    uint128 nonce;
}

library LibFacetStorage {
    bytes32 constant K1_STORAGE_POSITION =
        keccak256(
            "v0.trustwallet.diamond.storage.Secp256k1VerificationStorage"
        );
    bytes32 constant R1_STORAGE_POSITION =
        keccak256(
            "v0.trustwallet.diamond.storage.Secp256r1VerificationStorage"
        );
    bytes32 constant GUARDIAN_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.GuardianStorage");
    bytes32 constant RECOVERY_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.RecoveryStorage");
    bytes32 constant RESTRICTION_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.RestrictionsStorage");
    bytes32 constant MIGRATION_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.SignatureMigrationStorage");
    bytes32 constant DIAMONDCUT_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.DiamondCutStorage");
    bytes32 constant LOCK_STORAGE_POSITION =
        keccak256("v0.trustwallet.diamond.storage.LockStorage");

    function k1Storage()
        internal
        pure
        returns (Secp256k1VerificationStorage storage ds)
    {
        bytes32 storagePosition = K1_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }

    function r1Storage()
        internal
        pure
        returns (Secp256r1VerificationStorage storage ds)
    {
        bytes32 storagePosition = R1_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }

    function guardianStorage()
        internal
        pure
        returns (GuardianStorage storage ds)
    {
        bytes32 storagePosition = GUARDIAN_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }

    function recoveryStorage()
        internal
        pure
        returns (RecoveryStorage storage ds)
    {
        bytes32 storagePosition = RECOVERY_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }

    function restrictionsStorage()
        internal
        pure
        returns (RestrictionsStorage storage ds)
    {
        bytes32 storagePosition = RESTRICTION_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }

    function migrationStorage()
        internal
        pure
        returns (SignatureMigrationStorage storage ds)
    {
        bytes32 storagePosition = MIGRATION_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }

    function diamondCutStorage()
        internal
        pure
        returns (DiamondCutStorage storage ds)
    {
        bytes32 storagePosition = DIAMONDCUT_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }

    function lockStorage() internal pure returns (LockStorage storage ds) {
        bytes32 storagePosition = LOCK_STORAGE_POSITION;
        assembly {
            ds.slot := storagePosition
        }
    }
}
