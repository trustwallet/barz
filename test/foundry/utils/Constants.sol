// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IDiamondCut} from "../../../contracts/facets/base/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../../../contracts/facets/base/interfaces/IDiamondLoupe.sol";
import {IStorageLoupe} from "../../../contracts/facets/base/interfaces/IStorageLoupe.sol";
import {IAccountFacet} from "../../../contracts/facets/interfaces/IAccountFacet.sol";
import {BaseAccount} from "../../../contracts/aa-4337/core/BaseAccount.sol";
import {IAccount} from "../../../contracts/aa-4337/interfaces/IAccount.sol";
import {ILockFacet} from "../../../contracts/facets/interfaces/ILockFacet.sol";
import {IGuardianFacet} from "../../../contracts/facets/interfaces/IGuardianFacet.sol";
import {IVerificationFacet} from "../../../contracts/facets/interfaces/IVerificationFacet.sol";
import {ILockFacet} from "../../../contracts/facets/interfaces/ILockFacet.sol";
import {IRestrictionsFacet} from "../../../contracts/facets/interfaces/IRestrictionsFacet.sol";
import {ISignatureMigrationFacet} from "../../../contracts/facets/interfaces/ISignatureMigrationFacet.sol";
import {IAccountRecoveryFacet} from "../../../contracts/facets/interfaces/IAccountRecoveryFacet.sol";
import {IERC165} from "../../../contracts/interfaces/ERC/IERC165.sol";
import {IERC1271} from "../../../contracts/interfaces/ERC/IERC1271.sol";

library Constants {

    uint128 public constant defaultAdditionSecurityPeriod = 60 * 60 * 24 * 3;
    uint128 public constant minAdditionSecurityPeriod = defaultAdditionSecurityPeriod / 2;
    uint128 public constant maxAdditionSecurityPeriod = defaultAdditionSecurityPeriod * 2;

    uint128 public constant defaultRemovalSecurityPeriod = 60 * 60 * 24;
    uint128 public constant minRemovalSecurityPeriod = defaultRemovalSecurityPeriod / 2;
    uint128 public constant maxRemovalSecurityPeriod = defaultRemovalSecurityPeriod * 2;

    uint128 public constant defaultSecurityWindow = 60 * 60 * 24;
    uint128 public constant minSecurityWindow = defaultSecurityWindow / 2;
    uint128 public constant maxSecurityWindow = defaultSecurityWindow * 2;

    uint128 public constant defaultRecoveryPeriod = 60 * 60 * 48;
    uint128 public constant minRecoveryPeriod = defaultRecoveryPeriod / 2;
    uint128 public constant maxRecoveryPeriod = defaultRecoveryPeriod * 2;

    uint128 public constant defaultLockPeriod = 60 * 60 * 24;
    uint128 public constant minLockPeriod = defaultLockPeriod / 2;
    uint128 public constant maxLockPeriod = defaultLockPeriod * 2;

    uint128 public constant defaultApprovalValidationPeriod = 60 * 60 * 12;
    uint128 public constant minApprovalValidationPeriod = defaultApprovalValidationPeriod / 2;
    uint128 public constant maxApprovalValidationPeriod = defaultApprovalValidationPeriod * 2;

    uint128 public constant defaultMigrationPeriod = 60 * 60 * 3;
    uint128 public constant minMigrationPeriod = defaultMigrationPeriod / 2;
    uint128 public constant maxMigrationPeriod = defaultMigrationPeriod * 2;

    function diamondCutFacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](10);
        facetSelectors[0] = IDiamondCut.approveDiamondCut.selector;                             // approveDiamondCut((address,uint8,bytes4[])[])
        facetSelectors[1] = IDiamondCut.diamondCut.selector;                                    // diamondCut((address,uint8,bytes4[])[],address,bytes)
        facetSelectors[2] = IDiamondCut.diamondCutWithGuardian.selector;                        // diamondCutWithGuardian((address,uint8,bytes4[])[],address[],bytes[])
        facetSelectors[3] = IDiamondCut.getDiamondCutApprovalCountWithTimeValidity.selector;    // getDiamondCutApprovalCountWithTimeValidity(bytes32)
        facetSelectors[4] = IDiamondCut.getDiamondCutHash.selector;                             // getDiamondCutHash((address,uint8,bytes4[])[])
        facetSelectors[5] = IDiamondCut.getDiamondCutNonce.selector;                            // getDiamondCutNonce()
        facetSelectors[6] = IDiamondCut.getOwnerCutApprovalWithTimeValidity.selector;           // getOwnerCutApprovalWithTimeValidity(bytes32)
        facetSelectors[7] = IDiamondCut.isCutApproved.selector;                                 // isCutApproved(bytes32,address)
        facetSelectors[8] = IDiamondCut.revokeDiamondCutApproval.selector;                      // revokeDiamondCutApproval((address,uint8,bytes4[])[])
        facetSelectors[9] = IDiamondCut.updateSupportsInterface.selector;                       // updateSupportsInterface(bytes4,bool)
        return facetSelectors;
    }
    
    function diamondLoupeFacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](9);
        facetSelectors[0] = IDiamondLoupe.facetAddress.selector;                                // facetAddress(bytes4)
        facetSelectors[1] = IStorageLoupe.facetAddressFromStorage.selector;                     // facetAddressFromStorage(bytes4)
        facetSelectors[2] = IDiamondLoupe.facetAddresses.selector;                              // facetAddresses()
        facetSelectors[3] = IStorageLoupe.facetAddressesFromStorage.selector;                   // facetAddressesFromStorage()
        facetSelectors[4] = IDiamondLoupe.facetFunctionSelectors.selector;                      // facetFunctionSelectors(address)
        facetSelectors[5] = IStorageLoupe.facetFunctionSelectorsFromStorage.selector;           // facetFunctionSelectorsFromStorage(address)
        facetSelectors[6] = IDiamondLoupe.facets.selector;                                      // facets()
        facetSelectors[7] = IStorageLoupe.facetsFromStorage.selector;                           // facetsFromStorage()
        facetSelectors[8] = IERC165.supportsInterface.selector;                                 // supportsInterface(bytes4)
        return facetSelectors;
    }

    function accountFacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](6);
        facetSelectors[0] = BaseAccount.entryPoint.selector;                                    // entryPoint()
        facetSelectors[1] = BaseAccount.getNonce.selector;                                      // getNonce()
        facetSelectors[2] = IAccountFacet.execute.selector;                                     // execute(address,uint256,bytes)
        facetSelectors[3] = IAccountFacet.executeBatch.selector;                                // executeBatch(address[],uint256[],bytes[])
        facetSelectors[4] = IAccountFacet.initialize.selector;                                  // initialize(address,address,address,address,bytes)
        facetSelectors[5] = IAccount.validateUserOp.selector;                                   // validateUserOp((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes),bytes32,uint256)
        return facetSelectors;
    }

    function lockFacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](7);
        facetSelectors[0] = ILockFacet.getLockPeriod.selector;                                  // getLockPeriod()
        facetSelectors[1] = ILockFacet.getPendingLock.selector;                                 // getPendingLock()
        facetSelectors[2] = ILockFacet.getUnlockHash.selector;                                  // getUnlockHash()
        facetSelectors[3] = ILockFacet.isLocked.selector;                                       // isLocked()
        facetSelectors[4] = ILockFacet.lock.selector;                                           // lock()
        facetSelectors[5] = ILockFacet.lockNonce.selector;                                      // lockNonce()
        facetSelectors[6] = ILockFacet.unlock.selector;                                         // unlock(address,bytes)
        return facetSelectors;
    }

    function guardianFacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](20);
        facetSelectors[0] = IGuardianFacet.addGuardian.selector;                                // addGuardian(address)
        facetSelectors[1] = IGuardianFacet.addGuardians.selector;                               // addGuardians(address[])
        facetSelectors[2] = IGuardianFacet.cancelGuardianAddition.selector;                     // cancelGuardianAddition(address)
        facetSelectors[3] = IGuardianFacet.cancelGuardianRemoval.selector;                      // cancelGuardianRemoval(address)
        facetSelectors[4] = IGuardianFacet.confirmGuardianAddition.selector;                    // confirmGuardianAddition(address)
        facetSelectors[5] = IGuardianFacet.confirmGuardianAdditions.selector;                   // confirmGuardianAdditions(address[])
        facetSelectors[6] = IGuardianFacet.confirmGuardianRemoval.selector;                     // confirmGuardianRemoval(address)
        facetSelectors[7] = IGuardianFacet.confirmGuardianRemovals.selector;                    // confirmGuardianRemovals(address[])
        facetSelectors[8] = IGuardianFacet.getAdditionSecurityPeriod.selector;                  // getAdditionSecurityPeriod()
        facetSelectors[9] = IGuardianFacet.getGuardians.selector;                               // getGuardians()
        facetSelectors[10] = IGuardianFacet.getRemovalSecurityPeriod.selector;                  // getRemovalSecurityPeriod()
        facetSelectors[11] = IGuardianFacet.getSecurityWindow.selector;                         // getSecurityWindow()
        facetSelectors[12] = IGuardianFacet.guardianCount.selector;                             // guardianCount()
        facetSelectors[13] = IGuardianFacet.isAdditionPending.selector;                         // isAdditionPending(address)
        facetSelectors[14] = IGuardianFacet.isGuardian.selector;                                // isGuardian(address)
        facetSelectors[15] = IGuardianFacet.isGuardianFacetRemovable.selector;                  // isGuardianFacetRemovable()
        facetSelectors[16] = IGuardianFacet.isRemovalPending.selector;                          // isRemovalPending(address)
        facetSelectors[17] = IGuardianFacet.majorityOfGuardians.selector;                       // majorityOfGuardians()
        facetSelectors[18] = IGuardianFacet.removeGuardian.selector;                            // removeGuardian(address)
        facetSelectors[19] = IGuardianFacet.removeGuardians.selector;                           // removeGuardians(address[])
        return facetSelectors;
    }

    function k1FacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](8);
        facetSelectors[0] = IERC1271.isValidSignature.selector;                                 // isValidSignature(bytes32,bytes)
        facetSelectors[1] = IVerificationFacet.initializeSigner.selector;                       // initializeSigner(bytes)
        facetSelectors[2] = IVerificationFacet.isValidKeyType.selector;                         // isValidKeyType(bytes)
        facetSelectors[3] = IVerificationFacet.owner.selector;                                  // owner()
        facetSelectors[4] = IVerificationFacet.uninitializeSigner.selector;                     // uninitializeSigner()
        facetSelectors[5] = IVerificationFacet.validateOwnerSignature.selector;                 // validateOwnerSignature((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes),bytes32)
        facetSelectors[6] = IVerificationFacet.validateOwnerSignatureSelector.selector;         // validateOwnerSignatureSelector()
        facetSelectors[7] = 0xf45007c3;                                                         // validateSignature((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes),bytes32,address)
        return facetSelectors;
    }

    function r1FacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](8);
        facetSelectors[0] = IERC1271.isValidSignature.selector;                                 // isValidSignature(bytes32,bytes)
        facetSelectors[1] = IVerificationFacet.initializeSigner.selector;                       // initializeSigner(bytes)
        facetSelectors[2] = IVerificationFacet.isValidKeyType.selector;                         // isValidKeyType(bytes)
        facetSelectors[3] = IVerificationFacet.owner.selector;                                  // owner()
        facetSelectors[4] = IVerificationFacet.uninitializeSigner.selector;                     // uninitializeSigner()
        facetSelectors[5] = IVerificationFacet.validateOwnerSignature.selector;                 // validateOwnerSignature((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes),bytes32)
        facetSelectors[6] = IVerificationFacet.validateOwnerSignatureSelector.selector;         // validateOwnerSignatureSelector()
        facetSelectors[7] = 0x11cfe388;                                                         // validateSignature((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes),bytes32,uint256[2])
        return facetSelectors;
    }


    function restrictionsFacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](6);
        facetSelectors[0] = IRestrictionsFacet.addRestriction.selector;                         // addRestriction(address)
        facetSelectors[1] = IRestrictionsFacet.getRestrictions.selector;                        // getRestrictions()
        facetSelectors[2] = IRestrictionsFacet.initializeRestrictions.selector;                 // initializeRestrictions(address[])
        facetSelectors[3] = IRestrictionsFacet.removeRestriction.selector;                      // removeRestriction(address)
        facetSelectors[4] = IRestrictionsFacet.uninitializeRestrictions.selector;               // uninitializeRestrictions()
        facetSelectors[5] = IRestrictionsFacet.verifyRestrictions.selector;                     // verifyRestrictions(address,address,uint256,bytes)
        return facetSelectors;
    }

    function signatureMigrationFacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](14);
        facetSelectors[0] = ISignatureMigrationFacet.approveCancelSignatureMigration.selector;              // approveCancelSignatureMigration(address,bytes,bytes4[])
        facetSelectors[1] = ISignatureMigrationFacet.approveSignatureSchemeMigration.selector;              // approveSignatureSchemeMigration(address,bytes,bytes4[])
        facetSelectors[2] = ISignatureMigrationFacet.cancelSignatureMigration.selector;                     // cancelSignatureMigration(address,bytes,bytes4[],address[],bytes[])
        facetSelectors[3] = ISignatureMigrationFacet.finalizeSignatureMigration.selector;                   // finalizeSignatureMigration()
        facetSelectors[4] = ISignatureMigrationFacet.getApprovalMigrationKeyHash.selector;                  // getApprovalMigrationKeyHash(bytes,address,bytes4[],string)
        facetSelectors[5] = ISignatureMigrationFacet.getMigrationApprovalCountWithTimeValidity.selector;    // getMigrationApprovalCountWithTimeValidity(bytes32)
        facetSelectors[6] = ISignatureMigrationFacet.getMigrationNonce.selector;                            // getMigrationNonce()
        facetSelectors[7] = ISignatureMigrationFacet.getMigrationOwnerApprovalWithTimeValidity.selector;    // getMigrationOwnerApprovalWithTimeValidity(bytes32)
        facetSelectors[8] = ISignatureMigrationFacet.getPendingMigration.selector;                          // getPendingMigration()
        facetSelectors[9] = ISignatureMigrationFacet.isMigrationApproved.selector;                          // isMigrationApproved(bytes32,address)
        facetSelectors[10] = ISignatureMigrationFacet.isMigrationPending.selector;                          // isMigrationPending()
        facetSelectors[11] = ISignatureMigrationFacet.migrateSignatureScheme.selector;                      // migrateSignatureScheme(address,bytes,bytes4[])
        facetSelectors[12] = ISignatureMigrationFacet.migrateSignatureSchemeWithGuardian.selector;          // migrateSignatureSchemeWithGuardian(address,bytes,bytes4[],address[],bytes[])
        facetSelectors[13] = ISignatureMigrationFacet.revokeSignatureMigrationApproval.selector;            // revokeSignatureMigrationApproval(address,bytes,bytes4[])
        return facetSelectors;
    }

    function accountRecoveryFacetSelectors() public pure returns (bytes4[] memory) {
        bytes4[] memory facetSelectors = new bytes4[](13);
        facetSelectors[0] = IAccountRecoveryFacet.approveAccountRecovery.selector;                      // approveAccountRecovery(bytes)
        facetSelectors[1] = IAccountRecoveryFacet.approveCancelRecovery.selector;                       // approveCancelRecovery(bytes)
        facetSelectors[2] = IAccountRecoveryFacet.cancelRecovery.selector;                              // cancelRecovery(bytes,address[],bytes[])
        facetSelectors[3] = IAccountRecoveryFacet.executeRecovery.selector;                             // executeRecovery(bytes,address[],bytes[])
        facetSelectors[4] = IAccountRecoveryFacet.finalizeRecovery.selector;                            // finalizeRecovery()
        facetSelectors[5] = IAccountRecoveryFacet.getApprovalRecoveryKeyHash.selector;                  // getApprovalRecoveryKeyHash(bytes,string)
        facetSelectors[6] = IAccountRecoveryFacet.getPendingRecovery.selector;                          // getPendingRecovery()
        facetSelectors[7] = IAccountRecoveryFacet.getRecoveryApprovalCountWithTimeValidity.selector;    // getRecoveryApprovalCountWithTimeValidity(bytes32)
        facetSelectors[8] = IAccountRecoveryFacet.getRecoveryNonce.selector;                            // getRecoveryNonce()
        facetSelectors[9] = IAccountRecoveryFacet.hardstopRecovery.selector;                            // hardstopRecovery(bytes)
        facetSelectors[10] = IAccountRecoveryFacet.isRecoveryApproved.selector;                         // isRecoveryApproved(bytes32,address)
        facetSelectors[11] = IAccountRecoveryFacet.revokeAccountRecoveryApproval.selector;              // revokeAccountRecoveryApproval(bytes)
        facetSelectors[12] = IAccountRecoveryFacet.validateNewOwner.selector;                           // validateNewOwner(bytes)
        return facetSelectors;
    }
}