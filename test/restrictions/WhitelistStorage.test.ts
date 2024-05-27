import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, Barz, DefaultFallbackHandler, DiamondCutFacet, DiamondLoupeFacet, FacetRegistry, GuardianFacet, Secp256k1VerificationFacet, SecurityManager, TokenReceiverFacet } from '../../typechain-types'
import { guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityWindow, minGuardianSecurityWindow, maxGuardianSecurityWindow, recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod, lockPeriod, minLockPeriod, maxLockPeriod, approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod, increaseBlockTime } from '../utils/helpers'
import { createAccountOwner, fund } from '../utils/testutils'
import { expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { whitelistStorageFixture } from '../fixtures/WhitelistStorageFixture'

const {
    getSelectors
} = require('../utils/diamond.js')

import { diamondCutFacetFixture } from '../fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from '../fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from '../fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from '../fixtures/BarzFixture'
import { addFacetSelectors, addFacetSelectorsViaEntryPointOnK1, getFacetBarz, setupSecurityManager } from '../utils/setup'
import { facetRegistryFixture } from '../fixtures/FacetRegistryFixture'
import { diamondLoupeFacetFixture } from '../fixtures/DiamondLoupeFacetFixture'
import { guardianFacetFixture } from '../fixtures/GuardianFacetFixture'
import { EntryPoint } from "../../typechain-types/core"
import { callFromEntryPointOnK1, executeCallData } from "../utils/UserOp"
import { entryPointFixture } from "../fixtures/EntryPointFixture"
import { tokenReceiverFacetFixture } from '../fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from '../fixtures/DefaultFallbackHandlerFixture'

describe('Whitelist Storage', () => {
    let whitelistStorage: any

    let spenderAddress: string

    let defaultFallbackHandler: DefaultFallbackHandler
    let diamondCutFacet: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let accountFacet: AccountFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let k1Facet: Secp256k1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let guardianFacet: GuardianFacet
    let guardianBarz: GuardianFacet
    let entryPoint: EntryPoint
    let mockEntryPoint: SignerWithAddress
    let mockAccountBarz: AccountFacet
    let mockGuardianBarz: GuardianFacet
    let guardian1: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let mockBarz: Barz
    let nonce = 0

    beforeEach(async () => {
        [guardian1, securityManagerOwner, facetRegistryOwner, mockEntryPoint] = await ethers.getSigners()
        nonce = 0

        whitelistStorage = await whitelistStorageFixture()
        spenderAddress = ethers.Wallet.createRandom().address

        owner = createAccountOwner()
        await fund(owner.address)

        securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
            minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
            minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
            minLockPeriod, maxLockPeriod, lockPeriod,
            minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        guardianFacet = await guardianFacetFixture(securityManager)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        entryPoint = await entryPointFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))

        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        guardianBarz = await getFacetBarz('GuardianFacet', barz)

        mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        mockAccountBarz = await getFacetBarz('AccountFacet', mockBarz)
        mockGuardianBarz = await getFacetBarz('GuardianFacet', mockBarz)
        await addFacetSelectors(mockBarz, guardianFacet, guardianFacet, mockEntryPoint)

        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })

        const guardianCutTx = await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacet, entryPoint, nonce++)
        const guardianCutReceipt = await guardianCutTx.wait()
        expect(guardianCutReceipt.status).to.equal(1)
    })
    const addGuardian = async (newGuardian: SignerWithAddress, nonce: number): Promise<number> => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [newGuardian.address])
        const callData = executeCallData(barz.address, 0, addGuardianCall)
        await callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(guardianBarz.confirmGuardianAddition(newGuardian.address)).to.emit(guardianBarz, "GuardianAdded")
        expect(await guardianBarz.isGuardian(newGuardian.address)).to.be.true
        return nonce
    }
    const addGuardianMock = async (_newGuardian: any, _guardianBarz: any, _accountBarz: any) => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [_newGuardian.address])
        await _accountBarz.connect(mockEntryPoint).execute(_accountBarz.address, 0, addGuardianCall)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(_guardianBarz.confirmGuardianAddition(_newGuardian.address)).to.emit(_guardianBarz, "GuardianAdded")
    }

    describe("# whitelistAddress", () => {
        it("Should whitelist with owner if no guardian", async () => {
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, spenderAddress])
            const callData = executeCallData(whitelistStorage.address, 0, whitelistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)).to.emit(whitelistStorage, "Added").withArgs(spenderAddress)

            expect(await whitelistStorage.isWhitelisted(barz.address, spenderAddress)).to.be.true
        })
        it('Should revert if owner whitelists address when guardian exists', async () => {
            await addGuardianMock(guardian1, mockGuardianBarz, mockAccountBarz)
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [mockBarz.address, spenderAddress])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(whitelistStorage.address, 0, whitelistCall)).to.be.revertedWithCustomError(whitelistStorage, "RemoteStorage__CallerNotGuardian")
        })
        it('Should revert if caller is not guardian or owner', async () => {
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, spenderAddress])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(whitelistStorage.address, 0, whitelistCall)).to.be.revertedWithCustomError(whitelistStorage, "RemoteStorage__CallerNotGuardianOrOwner")
        })
        it('Should whitelist address with guardian for owner wallet', async () => {
            nonce = await addGuardian(guardian1, nonce)
            await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacet, entryPoint, nonce)
            await expect(whitelistStorage.connect(guardian1).whitelistAddress(barz.address, spenderAddress)).to.emit(whitelistStorage, "Added").withArgs(spenderAddress)
        })
    })

    describe("# blacklistAddress", () => {
        it('Should revert if address was not whitelisted', async () => {
            const blacklistCall = whitelistStorage.interface.encodeFunctionData('blacklistAddress', [barz.address, spenderAddress])
            const callData = executeCallData(whitelistStorage.address, 0, blacklistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)).to.not.emit(whitelistStorage, "Removed")

            const mockBlacklistCall = whitelistStorage.interface.encodeFunctionData('blacklistAddress', [mockBarz.address, spenderAddress])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(whitelistStorage.address, 0, mockBlacklistCall)).to.be.revertedWithCustomError(whitelistStorage, "RemoteStorage__NotFound")
        })
        it('Should blacklist address with guardian for owner wallet', async () => {
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, spenderAddress])
            const callData = executeCallData(whitelistStorage.address, 0, whitelistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)).to.emit(whitelistStorage, "Added").withArgs(spenderAddress)

            expect(await whitelistStorage.isWhitelisted(barz.address, spenderAddress)).to.be.true

            await addGuardian(guardian1, nonce)

            await expect(whitelistStorage.connect(guardian1).blacklistAddress(barz.address, spenderAddress)).to.emit(whitelistStorage, "Removed").withArgs(spenderAddress)
            
            expect(await whitelistStorage.isWhitelisted(barz.address, spenderAddress)).to.be.false
        })
        it('Should blacklist address', async () => {
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, spenderAddress])
            let callData = executeCallData(whitelistStorage.address, 0, whitelistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)).to.emit(whitelistStorage, "Added").withArgs(spenderAddress)

            expect(await whitelistStorage.isWhitelisted(barz.address, spenderAddress)).to.be.true

            const blacklistCall = whitelistStorage.interface.encodeFunctionData('blacklistAddress', [barz.address, spenderAddress])
            callData = executeCallData(whitelistStorage.address, 0, blacklistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)).to.emit(whitelistStorage, "Removed").withArgs(spenderAddress)

            expect(await whitelistStorage.isWhitelisted(barz.address, spenderAddress)).to.be.false
        })
    })

    describe("# isWhitelisted", () => {
        it("Should return valid whitelist address", async () => {
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, spenderAddress])
            const callData = executeCallData(whitelistStorage.address, 0, whitelistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)).to.emit(whitelistStorage, "Added").withArgs(spenderAddress)

            expect(await whitelistStorage.isWhitelisted(barz.address, spenderAddress)).to.be.true
        })
    })

    describe('# getWhitelistedAddresses', () => {
        it("Should return valid list of whitelist addresses", async () => {
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, spenderAddress])
            let callData = executeCallData(whitelistStorage.address, 0, whitelistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)).to.emit(whitelistStorage, "Added").withArgs(spenderAddress)

            const guardianWhitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, guardian1.address])
            callData = executeCallData(whitelistStorage.address, 0, guardianWhitelistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData, nonce++)).to.emit(whitelistStorage, "Added").withArgs(guardian1.address)

            expect(await whitelistStorage.getWhitelistedAddresses(barz.address)).to.deep.equal([spenderAddress, guardian1.address])
        })
    })
})