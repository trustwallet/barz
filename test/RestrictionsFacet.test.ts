import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, RestrictionsFacet, WhitelistStorage, FacetRegistry } from './typechain-types'
import { diamondCut } from './utils/helpers'
import { getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { createAccountOwner, fund, AddressZero } from './utils/testutils'

const {
    FacetCutAction, getSelectors
} = require('././utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { restrictionsFacetFixture } from './fixtures/RestrictionsFacetFixture'
import { whitelistRestrictionFixture } from './fixtures/WhitelistRestrictionFixture'
import { whitelistStorageFixture } from './fixtures/WhitelistStorageFixture'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { WhitelistRestriction } from '../typechain-types/contracts/facets/restrictions/whitelist'
import { EntryPoint } from '../../typechain-types/core'
import { callFromEntryPointOnK1, executeBatchCallData, executeCallData } from './utils/UserOp'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { DefaultFallbackHandler, DiamondLoupeFacet, TokenReceiverFacet } from '../typechain-types'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'

describe('Restrictions Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let diamondCutBarz: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let accountBarz: AccountFacet
    let accountFacet: AccountFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let k1Facet: Secp256k1VerificationFacet
    let restrictionsFacet: RestrictionsFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let whitelistStorage: WhitelistStorage
    let entryPoint: EntryPoint
    let mockBarz: Barz
    let mockEntrypoint: SignerWithAddress
    let mockRestrictionsBarz: RestrictionsFacet
    let mockAccountBarz: AccountFacet
    let mockDiamondCutBarz: DiamondCutFacet
    let owner: Wallet
    let barz: Barz
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress

    const encodeRestrictionInitialization = (restrictions: any) => {
        return restrictionsFacet.interface.encodeFunctionData('initializeRestrictions', [restrictions])
    }
    const encodeRestrictionAddition = (restriction: string) => {
        return restrictionsFacet.interface.encodeFunctionData('addRestriction', [restriction])
    }
    const encodeRestrictionRemoval = (restriction: string) => {
        return restrictionsFacet.interface.encodeFunctionData('removeRestriction', [restriction])
    }

    before(async () => {
        [mockEntrypoint, securityManagerOwner, facetRegistryOwner] = await ethers.getSigners();
        owner = createAccountOwner()
        await fund(owner.address)

        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        restrictionsFacet = await restrictionsFacetFixture()
        entryPoint = await entryPointFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(restrictionsFacet.address, getSelectors(restrictionsFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
    })

    describe('# initializeRestrictions / uninitializeRestrictions', () => {
        beforeEach(async () => {
            barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            accountBarz = await getFacetBarz('AccountFacet', barz)

            mockBarz = await barzFixture(accountFacet, k1Facet, mockEntrypoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            mockRestrictionsBarz = await getFacetBarz("RestrictionsFacet", mockBarz)
            mockAccountBarz = await getFacetBarz("AccountFacet", mockBarz)
            mockDiamondCutBarz = await getFacetBarz("DiamondCutFacet", mockBarz)
    
            await entryPoint.depositTo(barz.address, {
                value: ethers.utils.parseEther('0.5'),
            })
        })

        it('Should revert adding a Restrictions Facet with no actual restrictions', async () => {
            const initCall = encodeRestrictionInitialization([])
            const addCut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, restrictionsFacet)
            const addCutCall = diamondCutFacet.interface.encodeFunctionData("diamondCut", [addCut, AddressZero, "0x00"])

            await expect(mockAccountBarz.connect(mockEntrypoint).executeBatch([mockAccountBarz.address, mockAccountBarz.address], [0, 0], [addCutCall, initCall])).to.be.revertedWithCustomError(mockRestrictionsBarz, 'RestrictionsFacet__EmptyRestrictionsList')
        })

        it('Should revert if restrictions include zero address', async () => {
            const initCall = encodeRestrictionInitialization([AddressZero])
            const addCut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, restrictionsFacet)
            const addCutCall = diamondCutFacet.interface.encodeFunctionData("diamondCut", [addCut, AddressZero, "0x00"])

            await expect(mockAccountBarz.connect(mockEntrypoint).executeBatch([mockAccountBarz.address, mockAccountBarz.address], [0, 0], [addCutCall, initCall])).to.be.revertedWithCustomError(mockRestrictionsBarz, 'RestrictionsFacet__ZeroAddressRestrictions')
        })

        it('Should be able to add and remove Restrictions Facet to Barz', async () => {
            whitelistStorage = await whitelistStorageFixture()
            const whitelistRestriction = await whitelistRestrictionFixture(whitelistStorage)

            const initCall = encodeRestrictionInitialization([whitelistRestriction.address])
            const addCut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, restrictionsFacet)
            const addCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [addCut, AddressZero, "0x00"])
            const addTx = await mockAccountBarz.connect(mockEntrypoint).executeBatch([mockAccountBarz.address, mockAccountBarz.address], [0, 0], [addCutCall, initCall])
            const addReceipt = await addTx.wait()
            expect(addReceipt.status).to.equal(1)

            const uninitCall = restrictionsFacet.interface.encodeFunctionData('uninitializeRestrictions')
            const removeCut = diamondCut(AddressZero, FacetCutAction.Remove, restrictionsFacet)
            const removeCutCall = diamondCutFacet.interface.encodeFunctionData("diamondCut", [removeCut, AddressZero, "0x00"])
            const removeTx = await mockAccountBarz.connect(mockEntrypoint).executeBatch([mockAccountBarz.address, mockAccountBarz.address], [0, 0], [uninitCall, removeCutCall])
            const removeReceipt = await removeTx.wait()

            expect(removeReceipt.status).to.equal(1)
        })
        it('Should revert adding a Restrictions Facet with no actual restrictions', async () => {
            const initCall = encodeRestrictionInitialization([])
            const addCut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, restrictionsFacet)
            const addCutCall = diamondCutBarz.interface.encodeFunctionData("diamondCut", [addCut, AddressZero, "0x00"])
            const addTx = mockAccountBarz.connect(mockEntrypoint).executeBatch([mockAccountBarz.address, mockAccountBarz.address], [0, 0], [addCutCall, initCall])
            await expect(addTx).to.be.revertedWithCustomError(restrictionsFacet, 'RestrictionsFacet__EmptyRestrictionsList')
        })
    });

    describe('# verifyRestrictions', () => {
        before(async () => {
            // Add restrictions facet
            whitelistStorage = await whitelistStorageFixture()
            const whitelistRestriction = await whitelistRestrictionFixture(whitelistStorage)
            const initCall = encodeRestrictionInitialization([whitelistRestriction.address])
            const addCut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, restrictionsFacet)
            const addCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [addCut, AddressZero, "0x00"])
            const addCutCallData = executeBatchCallData([barz.address, barz.address], [0, 0], [addCutCall, initCall])

            await callFromEntryPointOnK1(entryPoint, barz.address, owner, addCutCallData)
            await mockAccountBarz.connect(mockEntrypoint).executeBatch([mockBarz.address, mockBarz.address], [0, 0], [addCutCall, initCall])

            await entryPoint.depositTo(barz.address, {
                value: ethers.utils.parseEther('0.5'),
            })
        })

        it('Should reject transactions to a non-whitelisted address', async () => {
            const nonWhitelist = "0xf471789937856d80e589f5996cf8b0511ddd9de4"
            const transferCalldata = executeCallData(nonWhitelist, 1, "0x00")
            await expect(mockAccountBarz.execute(nonWhitelist, 0, transferCalldata)).to.be.revertedWithCustomError(mockAccountBarz, 'AccountFacet__RestrictionsFailure')
        })

        it('Should execute transactions to a whitelisted address', async () => {
            const whitelistedAddress = "0xf471789937856d80e589f5996cf8b0511ddd9de4"

            const addAddressCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, whitelistedAddress])
            const addAddressCallData = executeCallData(whitelistStorage.address, 0, addAddressCall)
            const addTx = await callFromEntryPointOnK1(entryPoint, barz.address, owner, addAddressCallData)
            const addReceipt = await addTx.wait()
            expect(addReceipt.status).to.equal(1)

            await fund(accountBarz.address)
            const transferCallData = executeCallData(whitelistedAddress, 0, "0x00")
            const transferTx = await callFromEntryPointOnK1(entryPoint, barz.address, owner, transferCallData)
            const transferReceipt = await transferTx.wait()
            expect(transferReceipt.status).to.equal(1)

            const removeAddressCall = whitelistStorage.interface.encodeFunctionData('blacklistAddress', [barz.address, whitelistedAddress])
            const removeAddressCallData = executeCallData(whitelistStorage.address, 0, removeAddressCall)
            const removeTx = await callFromEntryPointOnK1(entryPoint, barz.address, owner, removeAddressCallData)
            const removeReceipt = await removeTx.wait()
            expect(removeReceipt.status).to.equal(1)
        })
    })

    describe('# getRestrictions', () => {
        let whitelistRestriction: WhitelistRestriction

        before(async () => {
            barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            accountBarz = await getFacetBarz('AccountFacet', barz)

            await entryPoint.depositTo(barz.address, {
                value: ethers.utils.parseEther('0.5'),
            })

            // Add restrictions facet
            whitelistStorage = await whitelistStorageFixture()
            whitelistRestriction = await whitelistRestrictionFixture(whitelistStorage)
            const initCall = encodeRestrictionInitialization([whitelistRestriction.address])
            const addCut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, restrictionsFacet)
            const addCutCall = diamondCutFacet.interface.encodeFunctionData("diamondCut", [addCut, AddressZero, "0x00"])
            const addCutCallData = executeBatchCallData([barz.address, barz.address], [0, 0], [addCutCall, initCall])
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, addCutCallData)
        })

        it('Should return the correct list of restrictions', async () => {
            const restrictionsBarz = await getFacetBarz('RestrictionsFacet', barz)
            expect((await restrictionsBarz.getRestrictions()).length).to.be.equal(1)
            expect((await restrictionsBarz.getRestrictions())[0]).to.be.equal(whitelistRestriction.address)
        })
    })

    describe('# addRestriction', () => {
        let whitelistRestriction: WhitelistRestriction

        before(async () => {
            // Set up Barz
            mockBarz = await barzFixture(accountFacet, k1Facet, mockEntrypoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            mockRestrictionsBarz = await getFacetBarz("RestrictionsFacet", mockBarz)
            mockAccountBarz = await getFacetBarz("AccountFacet", mockBarz)
            mockDiamondCutBarz = await getFacetBarz("DiamondCutFacet", mockBarz)

            // Add whitelist restriction
            const whitelistStorage = await whitelistStorageFixture()
            whitelistRestriction = await whitelistRestrictionFixture(whitelistStorage)
            const initCall = encodeRestrictionInitialization([whitelistRestriction.address])
            const addCut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, restrictionsFacet)
            const addCutCall = diamondCutFacet.interface.encodeFunctionData("diamondCut", [addCut, AddressZero, "0x00"])
            await expect(mockAccountBarz.connect(mockEntrypoint).executeBatch([mockAccountBarz.address, mockAccountBarz.address], [0, 0], [addCutCall, initCall])).to.emit(mockDiamondCutBarz, "DiamondCut")

            await entryPoint.depositTo(barz.address, {
                value: ethers.utils.parseEther('0.5'),
            })
        })

        it('Should revert adding a duplicated restriction', async () => {
            const addRestrictionCall = encodeRestrictionAddition(whitelistRestriction.address)
            await expect(mockAccountBarz.connect(mockEntrypoint).execute(mockRestrictionsBarz.address, 0, addRestrictionCall)).to.be.revertedWithCustomError(mockRestrictionsBarz, "RestrictionsFacet__RestrictionAlreadyExists")
        })

        it('Should revert adding a zero address restriction', async () => {
            const addRestrictionCall = encodeRestrictionAddition(AddressZero)
            await expect(mockAccountBarz.connect(mockEntrypoint).execute(mockRestrictionsBarz.address, 0, addRestrictionCall)).to.be.revertedWithCustomError(mockRestrictionsBarz, "RestrictionsFacet__ZeroAddressRestrictions")
        })

        it('Should revert adding a restriction when the request does not come from barz', async () => {
            const whitelistStorage2 = await whitelistStorageFixture()
            const whitelistRestriction2 = await whitelistRestrictionFixture(whitelistStorage2)

            const [randomWallet] = await ethers.getSigners()
            await expect(mockRestrictionsBarz.connect(randomWallet).addRestriction(whitelistRestriction2.address)).to.be.revertedWith("LibDiamond: Caller not self")
        })

        it('Should add a restriction when the request comes from barz', async () => {
            const whitelistStorage2 = await whitelistStorageFixture()
            const whitelistRestriction2 = await whitelistRestrictionFixture(whitelistStorage2)

            const addRestrictionCall = encodeRestrictionAddition(whitelistRestriction2.address)
            await expect(mockAccountBarz.connect(mockEntrypoint).execute(mockBarz.address, 0, addRestrictionCall)).to.emit(mockRestrictionsBarz, "RestrictionAdded")

            const restrictions = await mockRestrictionsBarz.getRestrictions()
            expect(restrictions[restrictions.length-1]).to.be.equal(whitelistRestriction2.address)

            await expect(mockAccountBarz.connect(mockEntrypoint).execute(mockRestrictionsBarz.address, 0, addRestrictionCall)).to.be.revertedWithCustomError(mockRestrictionsBarz, "RestrictionsFacet__RestrictionAlreadyExists")
        })

    })

    describe('# removeRestriction', () => {
        let whitelistRestriction1: WhitelistRestriction
        let whitelistRestriction2: WhitelistRestriction

        before(async () => {
            // Set up Barz
            mockBarz = await barzFixture(accountFacet, k1Facet, mockEntrypoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            mockRestrictionsBarz = await getFacetBarz("RestrictionsFacet", mockBarz)
            mockAccountBarz = await getFacetBarz("AccountFacet", mockBarz)
            mockDiamondCutBarz = await getFacetBarz("DiamondCutFacet", mockBarz)

            // Add whitelist restriction
            whitelistRestriction1 = await whitelistRestrictionFixture(await whitelistStorageFixture())
            whitelistRestriction2 = await whitelistRestrictionFixture(await whitelistStorageFixture())

            const initCall = encodeRestrictionInitialization([whitelistRestriction1.address, whitelistRestriction2.address])
            const addCut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, restrictionsFacet)
            const addCutCall = diamondCutFacet.interface.encodeFunctionData("diamondCut", [addCut, AddressZero, "0x00"])
            await expect(mockAccountBarz.connect(mockEntrypoint).executeBatch([mockAccountBarz.address, mockAccountBarz.address], [0, 0], [addCutCall, initCall])).to.emit(mockDiamondCutBarz, "DiamondCut")

            await entryPoint.depositTo(barz.address, {
                value: ethers.utils.parseEther('0.5'),
            })
        })

        it('Should revert removing a restriction when it was not found', async () => {
            const randomAddress = ethers.Wallet.createRandom().address;
            const removeRestrictionCall = encodeRestrictionRemoval(randomAddress)
            await expect(mockAccountBarz.connect(mockEntrypoint).execute(mockAccountBarz.address, 0, removeRestrictionCall)).to.be.revertedWithCustomError(mockRestrictionsBarz, "RestrictionsFacet__RestrictionNotFound")
        })

        it('Should revert adding a restriction when the request does not come from barz', async () => {
            const [randomWallet] = await ethers.getSigners()
            await expect(mockRestrictionsBarz.connect(randomWallet).removeRestriction(whitelistRestriction2.address)).to.be.revertedWith("LibDiamond: Caller not self")
        })

        it('Should be able to remove all restrictions except the last one', async () => {
            const restrictionsBefore = await mockRestrictionsBarz.getRestrictions();
            const removeRestrictionCall = encodeRestrictionRemoval(whitelistRestriction2.address)
            await expect(mockAccountBarz.connect(mockEntrypoint).execute(mockAccountBarz.address, 0, removeRestrictionCall)).to.emit(mockRestrictionsBarz, "RestrictionRemoved")
            const restrictionsAfter = await mockRestrictionsBarz.getRestrictions();
            expect(restrictionsBefore.length - restrictionsAfter.length).to.be.equal(1)

            const removeRestrictionCall2 = encodeRestrictionRemoval(whitelistRestriction1.address)
            await expect(mockAccountBarz.connect(mockEntrypoint).execute(mockBarz.address, 0, removeRestrictionCall2)).to.be.revertedWithCustomError(mockRestrictionsBarz, "RestrictionsFacet__RemainingRestrictionsCantBeEmpty")
        })

        it('Should be able to add a restriction that was previously removed', async () => {
            const addRestrictionCall = encodeRestrictionAddition(whitelistRestriction2.address)
            await expect(mockAccountBarz.connect(mockEntrypoint).execute(mockAccountBarz.address, 0, addRestrictionCall)).to.emit(mockRestrictionsBarz, "RestrictionAdded")
        })
    })
})