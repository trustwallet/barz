import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, GuardianFacet, FacetRegistry, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler } from '../../typechain-types'
import { guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityWindow, minGuardianSecurityWindow, maxGuardianSecurityWindow, recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod, lockPeriod, minLockPeriod, maxLockPeriod, approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod } from '../utils/helpers'
import { securityManagerFixture } from '../fixtures/SecurityManagerFixture'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { AddressZero, createAccountOwner, fund } from '../utils/testutils'

const {
    getSelectors
} = require('../utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from '../fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from '../fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from '../fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from '../fixtures/BarzFixture'
import { getFacetBarz, setupSecurityManager } from '../utils/setup'
import { guardianFacetFixture } from '../fixtures/GuardianFacetFixture'
import { facetRegistryFixture } from '../fixtures/FacetRegistryFixture'
import { EntryPoint } from '../typechain-types/core'
import { callFromEntryPointOnK1, executeCallData } from '../utils/UserOp'
import { entryPointFixture } from '../fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from '../fixtures/DiamondLoupeFacetFixture'
import { tokenReceiverFacetFixture } from '../fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from '../fixtures/DefaultFallbackHandlerFixture'

describe('Security Manager', () => {
    let securityManager: SecurityManager
    let diamondCutFacet: DiamondCutFacet
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let accountFacet: AccountFacet
    let accountBarz: AccountFacet
    let k1Facet: Secp256k1VerificationFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let entryPoint: EntryPoint
    let diamondLoupeFacet: DiamondLoupeFacet
    let user1: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let guardianFacet: GuardianFacet

    before(async () => {
        [user1, securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        owner = createAccountOwner()
        await fund(owner.address)

        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
    })
    beforeEach(async () => {
        securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
            minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
            minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
            minLockPeriod, maxLockPeriod, lockPeriod,
            minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)

        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        entryPoint = await entryPointFixture()
        guardianFacet = await guardianFacetFixture(securityManager)
        tokenReceiverFacet = await tokenReceiverFacetFixture()

        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))

        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        accountBarz = await getFacetBarz('AccountFacet', barz)

        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
    })
    describe("# initialize", () => {
        let securityManager: SecurityManager

        before(async () => {
            securityManager = await securityManagerFixture(securityManagerOwner.address)
            expect(await securityManager.owner()).to.equal(securityManagerOwner.address)
        })

        it("# initializeSecurityWindow", async () => {
            await securityManager.connect(securityManagerOwner).initializeSecurityWindow(guardianSecurityWindow, minGuardianSecurityWindow, maxGuardianSecurityWindow)
            expect(securityManager.connect(securityManagerOwner).initializeSecurityWindow(guardianSecurityWindow, minGuardianSecurityWindow, maxGuardianSecurityWindow)).to.be.revertedWithCustomError(securityManager, "SecurityManager__AlreadyIntialized")
            expect(await securityManager.minSecurityWindow()).to.equal(minGuardianSecurityWindow)
            expect(await securityManager.maxSecurityWindow()).to.equal(maxGuardianSecurityWindow)
            expect(await securityManager.connect(AddressZero).securityWindowOf(AddressZero)).to.equal(guardianSecurityWindow)
        })

        it("# initializeAdditionSecurityPeriod", async () => {
            await securityManager.connect(securityManagerOwner).initializeAdditionSecurityPeriod(guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod)
            expect(securityManager.connect(securityManagerOwner).initializeAdditionSecurityPeriod(guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__AlreadyIntialized")
            expect(await securityManager.minAdditionSecurityPeriod()).to.equal(minGuardianSecurityPeriod)
            expect(await securityManager.maxAdditionSecurityPeriod()).to.equal(maxGuardianSecurityPeriod)
            expect(await securityManager.connect(AddressZero).additionSecurityPeriodOf(AddressZero)).to.equal(guardianSecurityPeriod)
        })

        it("# initializeRemovalSecurityPeriod", async () => {
            await securityManager.connect(securityManagerOwner).initializeRemovalSecurityPeriod(guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod)
            expect(securityManager.connect(securityManagerOwner).initializeRemovalSecurityPeriod(guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__AlreadyIntialized")
            expect(await securityManager.minRemovalSecurityPeriod()).to.equal(minGuardianSecurityPeriod)
            expect(await securityManager.maxRemovalSecurityPeriod()).to.equal(maxGuardianSecurityPeriod)
            expect(await securityManager.connect(AddressZero).removalSecurityPeriodOf(AddressZero)).to.equal(guardianSecurityPeriod)
        })

        it("# initializeRecoveryPeriod", async () => {
            await securityManager.connect(securityManagerOwner).initializeRecoveryPeriod(recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod)
            expect(securityManager.connect(securityManagerOwner).initializeRecoveryPeriod(recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__AlreadyIntialized")
            expect(await securityManager.minRecoveryPeriod()).to.equal(minRecoveryPeriod)
            expect(await securityManager.maxRecoveryPeriod()).to.equal(maxRecoveryPeriod)
            expect(await securityManager.connect(AddressZero).recoveryPeriodOf(AddressZero)).to.equal(recoveryPeriod)
        })

        it("# initializeLockPeriod", async () => {
            await securityManager.connect(securityManagerOwner).initializeLockPeriod(lockPeriod, minLockPeriod, maxLockPeriod)
            expect(securityManager.connect(securityManagerOwner).initializeLockPeriod(lockPeriod, minLockPeriod, maxLockPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__AlreadyIntialized")
            expect(await securityManager.minLockPeriod()).to.equal(minLockPeriod)
            expect(await securityManager.maxLockPeriod()).to.equal(maxLockPeriod)
            expect(await securityManager.connect(AddressZero).lockPeriodOf(AddressZero)).to.equal(lockPeriod)
        })

        it("# initializeMigrationPeriod", async () => {
            await securityManager.connect(securityManagerOwner).initializeMigrationPeriod(migrationPeriod, minMigrationPeriod, maxMigrationPeriod)
            expect(securityManager.connect(securityManagerOwner).initializeMigrationPeriod(migrationPeriod, minMigrationPeriod, maxMigrationPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__AlreadyIntialized")
            expect(await securityManager.minMigrationPeriod()).to.equal(minMigrationPeriod)
            expect(await securityManager.maxMigrationPeriod()).to.equal(maxMigrationPeriod)
            expect(await securityManager.connect(AddressZero).migrationPeriodOf(AddressZero)).to.equal(migrationPeriod)
        })

        it("# initializeApprovalValidationPeriod", async () => {
            await securityManager.connect(securityManagerOwner).initializeApprovalValidationPeriod(approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod)
            expect(securityManager.connect(securityManagerOwner).initializeApprovalValidationPeriod(approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__AlreadyIntialized")
            expect(await securityManager.minApprovalValidationPeriod()).to.equal(minApprovalValidationPeriod)
            expect(await securityManager.maxApprovalValidationPeriod()).to.equal(maxApprovalValidationPeriod)
            expect(await securityManager.connect(AddressZero).approvalValidationPeriodOf(AddressZero)).to.equal(approvalValidationPeriod)
        })
    })
    describe('# setAdditionSecurityPeriod', async () => {
        it("Should revert if not wallet(msg.sender)", async () => {
            await expect(securityManager.connect(user1).setAdditionSecurityPeriod(owner.address, guardianSecurityPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__CallerNotWallet")
        })
        it("Should revert if new security period is equal/higher than max security period", async () => {
            await expect(securityManager.connect(owner).setAdditionSecurityPeriod(owner.address, maxGuardianSecurityPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should revert if new security period is equal/lower than min security period", async () => {
            await expect(securityManager.connect(owner).setAdditionSecurityPeriod(owner.address, minGuardianSecurityPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should set security period", async () => {
            const customSecurityPeriod = guardianSecurityPeriod + 100
            const setSecurityPeriodCall = securityManager.interface.encodeFunctionData("setAdditionSecurityPeriod", [accountBarz.address, customSecurityPeriod])
            const setSecurityPeriodCallData = executeCallData(securityManager.address, 0, setSecurityPeriodCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, setSecurityPeriodCallData)
            expect(await securityManager.connect(accountBarz.address).additionSecurityPeriodOf(accountBarz.address)).to.equal(customSecurityPeriod)
        })
    })
    describe('# setRemovalSecurityPeriod', async () => {
        it("Should revert if not wallet(msg.sender)", async () => {
            await expect(securityManager.connect(user1).setRemovalSecurityPeriod(owner.address, guardianSecurityPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__CallerNotWallet")
        })
        it("Should revert if new security period is equal/higher than max security period", async () => {
            await expect(securityManager.connect(owner).setRemovalSecurityPeriod(owner.address, maxGuardianSecurityPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should revert if new security period is equal/lower than min security period", async () => {
            await expect(securityManager.connect(owner).setRemovalSecurityPeriod(owner.address, minGuardianSecurityPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should set security period", async () => {
            const customSecurityPeriod = guardianSecurityPeriod + 100
            const setSecurityPeriodCall = securityManager.interface.encodeFunctionData("setRemovalSecurityPeriod", [accountBarz.address, customSecurityPeriod])
            const setSecurityPeriodCallData = executeCallData(securityManager.address, 0, setSecurityPeriodCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, setSecurityPeriodCallData)
            expect(await securityManager.connect(accountBarz.address).removalSecurityPeriodOf(accountBarz.address)).to.equal(customSecurityPeriod)
        })
    })
    describe('# setSecurityWindow', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should revert if not wallet(msg.sender)", async () => {
            await expect(securityManager.connect(user1).setSecurityWindow(owner.address, guardianSecurityWindow)).to.be.revertedWithCustomError(securityManager, "SecurityManager__CallerNotWallet")
        })
        it("Should revert if new security window is equal/higher than max security window", async () => {
            await expect(securityManager.connect(owner).setSecurityWindow(owner.address, maxGuardianSecurityWindow, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should revert if new security window is equal/lower than min security window", async () => {
            await expect(securityManager.connect(owner).setSecurityWindow(owner.address, minGuardianSecurityWindow, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should set security window", async () => {
            const customSecurityWindow = guardianSecurityWindow + 100
            const setSecurityWindowCall = securityManager.interface.encodeFunctionData("setSecurityWindow", [accountBarz.address, customSecurityWindow])
            const setSecurityWindowCallData = executeCallData(securityManager.address, 0, setSecurityWindowCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, setSecurityWindowCallData)
            expect(await securityManager.connect(accountBarz.address).securityWindowOf(accountBarz.address)).to.equal(customSecurityWindow)
        })
    })
    describe('# setRecoveryPeriod', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should revert if not wallet(msg.sender)", async () => {
            await expect(securityManager.connect(user1).setRecoveryPeriod(owner.address, recoveryPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__CallerNotWallet")
        })
        it("Should revert if new security window is equal/higher than max security window", async () => {
            await expect(securityManager.connect(owner).setRecoveryPeriod(owner.address, maxRecoveryPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should revert if new security window is equal/lower than min security window", async () => {
            await expect(securityManager.connect(owner).setRecoveryPeriod(owner.address, minRecoveryPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should set recovery period", async () => {
            const customRecoveryPeriod = recoveryPeriod + 100
            const setRecoveryPeriodCall = securityManager.interface.encodeFunctionData("setRecoveryPeriod", [accountBarz.address, customRecoveryPeriod])
            const setRecoveryPeriodCallData = executeCallData(securityManager.address, 0, setRecoveryPeriodCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, setRecoveryPeriodCallData)
            expect(await securityManager.connect(accountBarz.address).recoveryPeriodOf(accountBarz.address)).to.equal(customRecoveryPeriod)
        })
    })
    describe('# setLockPeriod', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should revert if not wallet(msg.sender)", async () => {
            await expect(securityManager.connect(user1).setLockPeriod(owner.address, lockPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__CallerNotWallet")
        })
        it("Should revert if new lock period is higher than max lock period", async () => {
            await expect(securityManager.connect(owner).setLockPeriod(owner.address, maxLockPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should revert if new lock period is lower than min lock period", async () => {
            await expect(securityManager.connect(owner).setLockPeriod(owner.address, minLockPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should set lock period", async () => {
            const customLockPeriod = lockPeriod + 100
            const setLockPeriodCall = securityManager.interface.encodeFunctionData("setLockPeriod", [accountBarz.address, customLockPeriod])
            const setLockPeriodCallData = executeCallData(securityManager.address, 0, setLockPeriodCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, setLockPeriodCallData)
            expect(await securityManager.connect(accountBarz.address).lockPeriodOf(accountBarz.address)).to.equal(customLockPeriod)
        })
    })
    describe('# setApprovalValidationPeriod', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should revert if not wallet(msg.sender)", async () => {
            await expect(securityManager.connect(user1).setApprovalValidationPeriod(owner.address, approvalValidationPeriod)).to.be.revertedWithCustomError(securityManager, "SecurityManager__CallerNotWallet")
        })
        it("Should revert if new approval validation period is equal/higher than max approval calidation period", async () => {
            await expect(securityManager.connect(owner).setApprovalValidationPeriod(owner.address, maxApprovalValidationPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should revert if new approval validation period is equal/lower than min approval validation period", async () => {
            await expect(securityManager.connect(owner).setApprovalValidationPeriod(owner.address, minApprovalValidationPeriod, { gasPrice: 21000 })).to.be.revertedWithCustomError(securityManager, "SecurityManager__OutOfBoundary")
        })
        it("Should set approval validation period", async () => {
            const customApprovalValidationPeriod = approvalValidationPeriod + 100
            const setApprovalValidationPeriodCall = securityManager.interface.encodeFunctionData("setApprovalValidationPeriod", [accountBarz.address, customApprovalValidationPeriod])
            const setApprovalValidationPeriodCallData = executeCallData(securityManager.address, 0, setApprovalValidationPeriodCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, setApprovalValidationPeriodCallData)
            expect(await securityManager.connect(accountBarz.address).approvalValidationPeriodOf(accountBarz.address)).to.equal(customApprovalValidationPeriod)
        })
    })
    describe('# additionSecurityPeriodOf', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should return default security period if unset", async () => {
            expect(await securityManager.connect(AddressZero).additionSecurityPeriodOf(AddressZero)).to.equal(guardianSecurityPeriod)
        })
        it("Should return custom security period if set", async () => {
            const customSecurityPeriod = guardianSecurityPeriod + 100
            await securityManager.connect(owner).setAdditionSecurityPeriod(owner.address, customSecurityPeriod, { gasPrice: 21000 })
            expect(await securityManager.connect(owner.address).additionSecurityPeriodOf(owner.address)).to.equal(customSecurityPeriod)
        })
    })
    describe('# removalSecurityPeriodOf', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should return default security period if unset", async () => {
            expect(await securityManager.connect(AddressZero).removalSecurityPeriodOf(AddressZero)).to.equal(guardianSecurityPeriod)
        })
        it("Should return custom security period if set", async () => {
            const customSecurityPeriod = guardianSecurityPeriod + 100
            await securityManager.connect(owner).setRemovalSecurityPeriod(owner.address, customSecurityPeriod, { gasPrice: 21000 })
            expect(await securityManager.connect(owner.address).removalSecurityPeriodOf(owner.address)).to.equal(customSecurityPeriod)
        })
    })
    describe('# securityWindowOf', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should return default security window if unset", async () => {
            expect(await securityManager.connect(AddressZero).securityWindowOf(AddressZero)).to.equal(guardianSecurityWindow)
        })
        it("Should return custom security window if set", async () => {
            const customSecurityWindow = guardianSecurityWindow + 100
            await securityManager.connect(owner).setSecurityWindow(owner.address, customSecurityWindow, { gasPrice: 21000 })
            expect(await securityManager.connect(owner.address).securityWindowOf(owner.address)).to.equal(customSecurityWindow)
        })
    })
    describe('# recoveryPeriodOf', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should return default recovery period if unset", async () => {
            expect(await securityManager.connect(AddressZero).recoveryPeriodOf(AddressZero)).to.equal(recoveryPeriod)
        })
        it("Should return custom recovery period if set", async () => {
            const customRecoveryPeriod = recoveryPeriod + 100
            await securityManager.connect(owner).setRecoveryPeriod(owner.address, customRecoveryPeriod, { gasPrice: 21000 })
            expect(await securityManager.connect(owner.address).recoveryPeriodOf(owner.address)).to.equal(customRecoveryPeriod)
        })
    })
    describe('# lockPeriodOf', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should return default lock period if unset", async () => {
            expect(await securityManager.connect(AddressZero).lockPeriodOf(AddressZero)).to.equal(lockPeriod)
        })
        it("Should return custom lock period if set", async () => {
            const customLockPeriod = lockPeriod + 100
            await securityManager.connect(owner).setLockPeriod(owner.address, customLockPeriod, { gasPrice: 21000 })
            expect(await securityManager.connect(owner.address).lockPeriodOf(owner.address)).to.equal(customLockPeriod)
        })
    })
    describe('# approvalValidationPeriodOf', async () => {
        before(async () => {
            securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
                minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
                minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
                minLockPeriod, maxLockPeriod, lockPeriod,
                minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        })

        it("Should return default approval validation period if unset", async () => {
            expect(await securityManager.connect(AddressZero).approvalValidationPeriodOf(AddressZero)).to.equal(approvalValidationPeriod)
        })
        it("Should return custom approval validation period if set", async () => {
            const customApprovalValidationPeriod = approvalValidationPeriod + 10

            await securityManager.connect(owner).setApprovalValidationPeriod(owner.address, customApprovalValidationPeriod, { gasPrice: 21000 })
            expect(await securityManager.connect(owner.address).approvalValidationPeriodOf(owner.address)).to.equal(customApprovalValidationPeriod)
        })
    })
})