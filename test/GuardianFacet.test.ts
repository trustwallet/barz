import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, GuardianFacet, FacetRegistry, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler } from '../typechain-types'
import { increaseBlockTime, guardianSecurityPeriod, guardianSecurityWindow } from './utils/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { AddressZero, createAccountOwner, fund } from './utils/testutils'

const {
    getSelectors
} = require('./utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { addFacetSelectors, addFacetSelectorsViaEntryPointOnK1, getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { guardianFacetFixture } from './fixtures/GuardianFacetFixture'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { callFromEntryPointOnK1, executeCallData } from './utils/UserOp'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'

describe('Guardian Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let accountFacet: AccountFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let k1Facet: Secp256k1VerificationFacet
    let entryPoint: EntryPoint
    let diamondLoupeFacet: DiamondLoupeFacet
    let guardian1: SignerWithAddress
    let guardian2: SignerWithAddress
    let nonGuardian: SignerWithAddress
    let mockEntryPoint: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let mockBarz: Barz
    let mockAccountBarz: AccountFacet
    let mockGuardianBarz: GuardianFacet
    let guardianFacet: GuardianFacet
    let guardianBarz: GuardianFacet
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let nonce: number
    let guardianFacetSelectors: any

    before(async () => {
        [mockEntryPoint, guardian1, guardian2, nonGuardian, securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        owner = createAccountOwner()
        await fund(owner.address)

        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        guardianFacet = await guardianFacetFixture(securityManager)
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        entryPoint = await entryPointFixture()
        guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== guardianFacet.interface.getSighash('securityManager'))

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
    })
    beforeEach(async () => {
        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        guardianBarz = await getFacetBarz('GuardianFacet', barz)
        await fund(barz.address)

        mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        mockAccountBarz = await getFacetBarz('AccountFacet', mockBarz)
        mockGuardianBarz = await getFacetBarz('GuardianFacet', mockBarz)
        await fund(mockBarz.address)

        await addFacetSelectors(mockBarz, guardianFacet, guardianFacetSelectors, mockEntryPoint)
    })
    const setupGuardianBarz = async () => {
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)
    }
    it("Should add Guardian Facet to wallet", async () => {
        const guardianCutTx = await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)
        const guardianCutReceipt = await guardianCutTx.wait()
        expect(guardianCutReceipt.status).to.equal(1)
    })

    describe("# addGuardian", () => {
        it("Should revert if guardian is zero address", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [AddressZero])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockGuardianBarz.address, 0, addGuardianCall)).to.be.revertedWithCustomError(guardianBarz, "GuardianFacet__ZeroAddressGuardian")
        })
        it("Should revert if guardian is self", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [mockGuardianBarz.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__GuardianCannotBeSelf")
        })
        it("Should revert if guardian is signer", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
        })
        it("Should revert if guardian addition is duplicate", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__DuplicateGuardianAddition")
        })
        it("Should add guardian to wallet", async () => {
            await setupGuardianBarz()
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            const callData = executeCallData(barz.address, 0, addGuardianCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(guardianBarz, "GuardianAdditionRequested")
        })
        it("Should revert if guardian is already added", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAddition(guardian1.address)).to.emit(mockGuardianBarz, "GuardianAdded")
    
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__DuplicateGuardian")
        })
    })
    describe("# addGuardians", () => {
        it("Should revert if not owner", async () => {
            await expect(mockGuardianBarz.addGuardians([guardian1.address, guardian1.address])).to.revertedWith("LibDiamond: Caller not self")
        })
        it("Should add multiple guardians", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAddition(guardian1.address)).to.emit(mockGuardianBarz, "GuardianAdded")
        })
    })
    describe("# confirmGuardianAddition", () => {
        it("Should revert if unknown addition", async () => {
            await expect(mockGuardianBarz.confirmGuardianAddition(guardian1.address)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__UnknownPendingAddition")
        })
        it("Should revert if pending period is not over", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await expect(mockGuardianBarz.confirmGuardianAddition(guardian1.address)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__PendingAdditionNotOver")
        })
        it("Should revert if security window expired", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await increaseBlockTime(guardianSecurityPeriod + guardianSecurityWindow)
            await expect(mockGuardianBarz.confirmGuardianAddition(guardian1.address)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__PendingAdditionExpired")
        })
        it("Should confirm guardian addtion", async () => {
            await setupGuardianBarz()
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            const callData = executeCallData(barz.address, 0, addGuardianCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)
    
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(guardianBarz.confirmGuardianAddition(guardian1.address)).to.emit(guardianBarz, "GuardianAdded")
            expect(await guardianBarz.isGuardian(guardian1.address)).to.be.true
            expect(await guardianBarz.getGuardians()).to.deep.equal([guardian1.address])
        })
    })
    describe("# confirmGuardianAdditions", () => {
        it("Should confirm multile guardian addition", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAdditions([guardian1.address, guardian2.address])).to.emit(mockGuardianBarz, "GuardianAdded")

            expect(await mockGuardianBarz.isGuardian(guardian1.address)).to.be.true
            expect(await mockGuardianBarz.isGuardian(guardian2.address)).to.be.true
        })
    })

    describe("# removeGuardian", () => {
        beforeEach(async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAdditions([guardian1.address, guardian2.address])).to.emit(mockGuardianBarz, "GuardianAdded")
        })
        it("Should revert if not owner", async () => {
            await expect(mockGuardianBarz.removeGuardian(guardian1.address)).to.be.revertedWith("LibDiamond: Caller not self")
        })
        it("Should revert if address getting removed is not guardian", async () => {
            const removeGuardianCall = guardianFacet.interface.encodeFunctionData("removeGuardian", [nonGuardian.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, removeGuardianCall)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__NonExistentGuardian")
        })
        it("Should revert if guardian removal already exists", async () => {
            const removeGuardianCall = guardianFacet.interface.encodeFunctionData("removeGuardian", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, removeGuardianCall)).to.emit(mockGuardianBarz, "GuardianRemovalRequested")

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, removeGuardianCall)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__DuplicateGuardianRemoval")
        })
        it("Should remove guardian from wallet", async () => {
            await setupGuardianBarz()
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            const addGuardianCallData = executeCallData(barz.address, 0, addGuardianCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, addGuardianCallData)
    
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(guardianBarz.confirmGuardianAddition(guardian1.address)).to.emit(guardianBarz, "GuardianAdded")
            expect(await guardianBarz.isGuardian(guardian1.address)).to.be.true
    
            const removeGuardianCall = guardianFacet.interface.encodeFunctionData("removeGuardian", [guardian1.address])
            const removeGuardianCallData = executeCallData(barz.address, 0, removeGuardianCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, removeGuardianCallData)).to.emit(guardianBarz, "GuardianRemovalRequested")
    
            expect(await guardianBarz.isGuardian(guardian1.address)).to.be.true
        })
        it("Should remove guardian when multiple guardians exists", async () => {
            // Add guardian A, B => Remove guardian A
            await setupGuardianBarz()
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            const addGuardianCallData = executeCallData(barz.address, 0, addGuardianCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, addGuardianCallData)
    
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(guardianBarz.confirmGuardianAdditions([guardian1.address, guardian2.address])).to.emit(guardianBarz, "GuardianAdded")
            expect(await guardianBarz.isGuardian(guardian1.address)).to.be.true
            expect(await guardianBarz.isGuardian(guardian2.address)).to.be.true

            const removeGuardianCall = guardianFacet.interface.encodeFunctionData("removeGuardian", [guardian1.address])
            const removeGuardianCallData = executeCallData(barz.address, 0, removeGuardianCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, removeGuardianCallData)).to.emit(guardianBarz, "GuardianRemovalRequested")
        })
    })
    describe("# removeGuardians", () => {
        beforeEach(async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAdditions([guardian1.address, guardian2.address])).to.emit(mockGuardianBarz, "GuardianAdded")
        })
        it("Should revert if not owner", async () => {
            await expect(mockGuardianBarz.removeGuardians([guardian1.address, guardian2.address])).to.be.revertedWith("LibDiamond: Caller not self")
        })
        it("Should remove multiple guardians", async () => {
            const removeGuardiansCall = guardianFacet.interface.encodeFunctionData("removeGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, removeGuardiansCall)).to.emit(mockGuardianBarz, "GuardianRemovalRequested")
        })
    })
    describe("# confirmGuardianRemoval", () => {
        beforeEach(async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAdditions([guardian1.address, guardian2.address])).to.emit(mockGuardianBarz, "GuardianAdded")
        })
        it("Should revert if unknown addition", async () => {
            await expect(mockGuardianBarz.confirmGuardianRemoval(guardian1.address)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__UnknownPendingRemoval")
        })
        it("Should revert if pending period is not over", async () => {
            const removeGuardianCall = guardianFacet.interface.encodeFunctionData("removeGuardian", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, removeGuardianCall)).to.emit(mockGuardianBarz, "GuardianRemovalRequested")

            await expect(mockGuardianBarz.confirmGuardianRemoval(guardian1.address)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__PendingRemovalNotOver")
        })
        it("Should revert if security window expired", async () => {
            const removeGuardianCall = guardianFacet.interface.encodeFunctionData("removeGuardian", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, removeGuardianCall)).to.emit(mockGuardianBarz, "GuardianRemovalRequested")

            await increaseBlockTime(guardianSecurityPeriod + guardianSecurityWindow)

            await expect(mockGuardianBarz.confirmGuardianRemoval(guardian1.address)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__PendingAdditionExpired")
        })
        it("Should confirm guardian removal", async () => {
            await setupGuardianBarz()
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            const addGuardianCallData = executeCallData(barz.address, 0, addGuardianCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, addGuardianCallData)
    
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(guardianBarz.confirmGuardianAddition(guardian1.address)).to.emit(guardianBarz, "GuardianAdded")
            expect(await guardianBarz.isGuardian(guardian1.address)).to.be.true
    
            const removeGuardianCall = guardianFacet.interface.encodeFunctionData("removeGuardian", [guardian1.address])
            const removeGuardianCallData = executeCallData(barz.address, 0, removeGuardianCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, removeGuardianCallData)).to.emit(guardianBarz, "GuardianRemovalRequested")
    
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(guardianBarz.confirmGuardianRemoval(guardian1.address)).to.emit(guardianBarz, "GuardianRemoved")
    
            expect(await guardianBarz.isGuardian(guardian1.address)).to.be.false
        })
    })
    describe("# cancelGuardianAddition", () => {
        beforeEach(async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
        })
        it("Should revert if not owner", async () => {
            await expect(mockGuardianBarz.cancelGuardianAddition(guardian1.address)).to.be.revertedWith("LibDiamond: Caller not self")
        })
        it("Should revert if unknown addition", async () => {
            const cancelGuardianAdditionCall = guardianFacet.interface.encodeFunctionData("cancelGuardianAddition", [nonGuardian.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, cancelGuardianAdditionCall)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__UnknownPendingAddition")
        })
        it("Should cancel guardian addition", async () => {
            const cancelGuardianAdditionCall = guardianFacet.interface.encodeFunctionData("cancelGuardianAddition", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, cancelGuardianAdditionCall)).to.emit(mockGuardianBarz, "GuardianAdditionCancelled")
        })
    })
    describe("# cancelGuardianRemoval", () => {
        beforeEach(async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")
            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAdditions([guardian1.address, guardian2.address])).to.emit(mockGuardianBarz, "GuardianAdded")

            const removeGuardianCall = guardianFacet.interface.encodeFunctionData("removeGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, removeGuardianCall)).to.emit(mockGuardianBarz, "GuardianRemovalRequested")
        })
        it("Should revert if not owner", async () => {
            await expect(mockGuardianBarz.cancelGuardianRemoval(guardian1.address)).to.be.revertedWith("LibDiamond: Caller not self")
        })
        it("Should revert if unknown removal", async () => {
            const cancelGuardianRemovalCall = guardianFacet.interface.encodeFunctionData("cancelGuardianRemoval", [nonGuardian.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, cancelGuardianRemovalCall)).to.be.revertedWithCustomError(mockGuardianBarz, "GuardianFacet__UnknownPendingRemoval")
        })
        it("Should cancel guardian removal", async () => {
            const cancelGuardianRemovalCall = guardianFacet.interface.encodeFunctionData("cancelGuardianRemoval", [guardian1.address])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, cancelGuardianRemovalCall)).to.emit(mockGuardianBarz, "GuardianRemovalCancelled")
        })
    })
    describe("# confirmGuardianRemovals", () => {
        it("Should confirm guardian removals", async () => {
            // Add guardians
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")

            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAdditions([guardian1.address, guardian2.address])).to.emit(mockGuardianBarz, "GuardianAdded")

            // Request guardian removals
            const removeGuardiansCall = guardianFacet.interface.encodeFunctionData("removeGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, removeGuardiansCall)).to.emit(mockGuardianBarz, "GuardianRemovalRequested")

            await increaseBlockTime(guardianSecurityPeriod)

            // Confirm guardian removals
            await expect(mockGuardianBarz.confirmGuardianRemovals([guardian1.address, guardian2.address])).to.emit(mockGuardianBarz, "GuardianRemoved")
        })
    })
    describe("# getAdditionSecurityPeriod", () => { 
        it("Should return valid addition security period", async () => {
            await setupGuardianBarz()
            expect(await guardianBarz.getAdditionSecurityPeriod()).to.equal(guardianSecurityPeriod)
        })
    })
    describe("# getRemovalSecurityPeriod", () => {
        it("Should return valid removal security period", async () => {
            await setupGuardianBarz()
            expect(await guardianBarz.getRemovalSecurityPeriod()).to.equal(guardianSecurityPeriod)
        })
    })
    describe("# getSecurityWindow", () => {
        it("Should return valid removal security period", async () => {
            await setupGuardianBarz()
            expect(await guardianBarz.getSecurityWindow()).to.equal(guardianSecurityWindow)
        })
    })
    describe("# isGuardianFacetRemovable", () => {
        it("Should return false when guardians exists", async () => {
            await setupGuardianBarz()

            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [guardian1.address])
            const addGuardianCallData = executeCallData(barz.address, 0, addGuardianCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, addGuardianCallData)

            await increaseBlockTime(guardianSecurityPeriod)
            await expect(guardianBarz.confirmGuardianAddition(guardian1.address)).to.emit(guardianBarz, "GuardianAdded")
            expect(await guardianBarz.isGuardian(guardian1.address)).to.be.true

            expect(await guardianBarz.isGuardianFacetRemovable()).to.be.false
        })
        it("Should return true when no guardians exists", async () => {
            await setupGuardianBarz()

            expect(await guardianBarz.isGuardianFacetRemovable()).to.be.true
        })
    })
    describe("# majorityOfGuardians", () => {
        it("Should return 0 if guardian doesn't exists", async () => {
            expect(await mockGuardianBarz.majorityOfGuardians()).to.equal(0)
        })
        it("Should return majority of guardians", async () => {
            const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardians", [[guardian1.address, guardian2.address]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)).to.emit(mockGuardianBarz, "GuardianAdditionRequested")

            await increaseBlockTime(guardianSecurityPeriod)
            await expect(mockGuardianBarz.confirmGuardianAdditions([guardian1.address, guardian2.address])).to.emit(mockGuardianBarz, "GuardianAdded")
            expect(await mockGuardianBarz.majorityOfGuardians()).to.equal(2)
        })
    })
})