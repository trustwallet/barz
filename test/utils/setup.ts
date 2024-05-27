import { ethers } from 'hardhat'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, Secp256r1VerificationFacet, SecurityManager, FacetRegistry } from '../../typechain-types'
import { diamondCut, guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityWindow, minGuardianSecurityWindow, maxGuardianSecurityWindow, recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod, lockPeriod, minLockPeriod, maxLockPeriod, approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod } from '../utils/helpers'
import { securityManagerFixture } from '../fixtures/SecurityManagerFixture'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { AddressZero } from '../utils/testutils'

const {
    FacetCutAction,
    getSelectors
} = require('../utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from '../fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from '../fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from '../fixtures/Secp256k1VerificationFacetFixture'
import { secp256r1VerificationFacetFixture } from '../fixtures/Secp256r1VerificationFacetFixture'
import { barzFixture } from '../fixtures/BarzFixture'
import { EntryPoint } from '../../typechain-types'
import { facetRegistryFixture } from '../fixtures/FacetRegistryFixture'
import { callFromEntryPointOnK1, callFromEntryPointOnR1, executeCallData } from './UserOp'
import { uint256 } from './solidityTypes'
import { diamondLoupeFacetFixture } from '../fixtures/DiamondLoupeFacetFixture'
import { tokenReceiverFacetFixture } from '../fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from '../fixtures/DefaultFallbackHandlerFixture'
import { secp256r1VerificationFacetV2Fixture } from '../fixtures/Secp256r1VerificationFacetV2Fixture'

type SetupContractsReturnType = {
    securityManager: SecurityManager;
    diamondCutFacet: DiamondCutFacet;
    accountFacet: AccountFacet;
    k1Facet: Secp256k1VerificationFacet;
    r1Facet: Secp256r1VerificationFacet;
    facetRegistry: FacetRegistry;
    barz: Barz;
};

export const setupContracts = async (facetRegistryOwner: SignerWithAddress, securityManagerOwner: SignerWithAddress, entryPoint: EntryPoint | SignerWithAddress, ownerBytes: string, guardianSecurityPeriod: number, guardianSecurityWindow: number, recoveryPeriod: number, lockPeriod: number, approvalValidationPeriod: number, migrationPeriod: number, isR1 = false, isV2 = false): Promise<SetupContractsReturnType> => {
    const minGuardianSecurityPeriod = guardianSecurityPeriod / 2
    const maxGuardianSecurityPeriod = guardianSecurityPeriod * 2
    const minGuardianSecurityWindow = guardianSecurityWindow / 2
    const maxGuardianSecurityWindow = guardianSecurityWindow * 2
    const minRecoveryPeriod = recoveryPeriod / 2
    const maxRecoveryPeriod = recoveryPeriod * 2
    const minLockPeriod = lockPeriod / 2
    const maxLockPeriod = lockPeriod * 2
    const minApprovalValidationPeriod = approvalValidationPeriod / 2
    const maxApprovalValidationPeriod = approvalValidationPeriod * 2
    const minMigrationPeriod = migrationPeriod / 2
    const maxMigrationPeriod = migrationPeriod * 2
    const securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod, 
        minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow, 
        minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod, 
        minLockPeriod, maxLockPeriod, lockPeriod, 
        minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
    const diamondCutFacet = await diamondCutFacetFixture(securityManager)
    const accountFacet = await accountFacetFixture()
    const facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)

    const k1Facet = await secp256k1VerificationFacetFixture()
    const r1Facet = await secp256r1VerificationFacetFixture()
    const r1FacetV2 = await secp256r1VerificationFacetV2Fixture()
    const diamondLoupeFacet = await diamondLoupeFacetFixture()
    const tokenReceiverFacet = await tokenReceiverFacetFixture()
    const defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

    await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
    await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
    await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))
    await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
    await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
    let verificationFacet = isR1 == false ? k1Facet : r1Facet
    verificationFacet = (isR1 && isV2) ? r1FacetV2 : verificationFacet
    const barz = await barzFixture(accountFacet, verificationFacet, entryPoint, facetRegistry, defaultFallbackHandler, ownerBytes)
    return {
        securityManager: securityManager, diamondCutFacet: diamondCutFacet, accountFacet: accountFacet, k1Facet: k1Facet, r1Facet: r1Facet, facetRegistry: facetRegistry, barz: barz
    }
}

export const addAccountFacet = async (barz: Barz, accountFacet: AccountFacet, entryPoint: SignerWithAddress) => {
    const accountCut = diamondCut(accountFacet.address, FacetCutAction.Add, accountFacet)
    const diamondCutBarz = await getFacetBarz("DiamondCutFacet", barz)
    const tx = await diamondCutBarz.connect(entryPoint).diamondCut(accountCut, AddressZero, "0x00")
    const receipt = await tx.wait()
    expect(receipt.status).to.equal(1)
    const accountBarz = await getAccountBarz(barz)
    return accountBarz
}

export const getAccountBarz = async (barz: Barz | string) => {
    if (typeof barz == "string")
        return ethers.getContractAt("AccountFacet", barz)
    else
        return ethers.getContractAt("AccountFacet", barz.address)
}

export const getFacetBarz = async (facetName: string, barz: Barz) => {
    return ethers.getContractAt(facetName, barz.address) as any
}

export const addFacetSelectors = async (barz: Barz, facet: any, selectors: any, entryPoint: SignerWithAddress) => {
    const cut = diamondCut(facet.address, FacetCutAction.Add, selectors)
    const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
    const accountBarz = await getFacetBarz('AccountFacet', barz)
    const diamondCutCall = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])
    const tx = await accountBarz.connect(entryPoint).execute(barz.address, 0, diamondCutCall)
    const receipt = await tx.wait()
    return receipt
}

export const setupDefaultSecuritManager = async (
    securityManagerOwner: SignerWithAddress
) => {
    const securityManager = await securityManagerFixture(securityManagerOwner.address)
    await securityManager.connect(securityManagerOwner).initializeSecurityWindow(guardianSecurityWindow, minGuardianSecurityWindow, maxGuardianSecurityWindow)
    await securityManager.connect(securityManagerOwner).initializeAdditionSecurityPeriod(guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod)
    await securityManager.connect(securityManagerOwner).initializeRemovalSecurityPeriod(guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod)
    await securityManager.connect(securityManagerOwner).initializeRecoveryPeriod(recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod)
    await securityManager.connect(securityManagerOwner).initializeLockPeriod(lockPeriod, minLockPeriod, maxLockPeriod)
    await securityManager.connect(securityManagerOwner).initializeMigrationPeriod(migrationPeriod, minMigrationPeriod, maxMigrationPeriod)
    await securityManager.connect(securityManagerOwner).initializeApprovalValidationPeriod(approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod)
    
    return securityManager
}

export const setupSecurityManager = async (
    securityManagerOwner: SignerWithAddress,
    minSecurityPeriod: number,
    maxSecurityPeriod: number,
    securityPeriod: number,
    minSecurityWindow: number,
    maxSecurityWindow: number,
    securityWindow: number,
    minRecoveryPeriod: number,
    maxRecoveryPeriod: number,
    recoveryPeriod: number,
    minLockPeriod: number,
    maxLockPeriod: number,
    lockPeriod: number,
    minApprovalValidationPeriod: number,
    maxApprovalValidationPeriod: number,
    approvalValidationPeriod: number,
    minMigrationPeriod: number,
    maxMigrationPeriod: number,
    migrationPeriod: number
) => {
    const securityManager = await securityManagerFixture(securityManagerOwner.address)
    await securityManager.connect(securityManagerOwner).initializeSecurityWindow(securityWindow, minSecurityWindow, maxSecurityWindow)
    await securityManager.connect(securityManagerOwner).initializeAdditionSecurityPeriod(securityPeriod, minSecurityPeriod, maxSecurityPeriod)
    await securityManager.connect(securityManagerOwner).initializeRemovalSecurityPeriod(securityPeriod, minSecurityPeriod, maxSecurityPeriod)
    await securityManager.connect(securityManagerOwner).initializeRecoveryPeriod(recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod)
    await securityManager.connect(securityManagerOwner).initializeLockPeriod(lockPeriod, minLockPeriod, maxLockPeriod)
    await securityManager.connect(securityManagerOwner).initializeMigrationPeriod(migrationPeriod, minMigrationPeriod, maxMigrationPeriod)
    await securityManager.connect(securityManagerOwner).initializeApprovalValidationPeriod(approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod)
    
    return securityManager
}

export const addFacetSelectorsViaEntryPointOnK1 = async (barz: Barz, owner: any, facet: any, selectors: any, entryPoint: EntryPoint) => {
    const cut = diamondCut(facet.address, FacetCutAction.Add, selectors)
    const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
    const accountFacetBarz = await getFacetBarz('AccountFacet', barz)
    const callData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])
    const wrappedCallData = executeCallData(barz.address, 0, callData)
    return callFromEntryPointOnK1(entryPoint, barz.address, owner, wrappedCallData, await accountFacetBarz.getNonce())
}

export const addFacetSelectorsViaEntryPointOnR1 = async (barz: Barz, keyPair: any, facet: any, selectors: any, entryPoint: EntryPoint) => {
    const cut = diamondCut(facet.address, FacetCutAction.Add, selectors)
    const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
    const accountFacetBarz = await getFacetBarz('AccountFacet', barz)
    const callData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])
    const wrappedCallData = executeCallData(barz.address, 0, callData)
    return callFromEntryPointOnR1(entryPoint, barz.address, keyPair, wrappedCallData, await accountFacetBarz.getNonce())
}