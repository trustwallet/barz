import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, FacetRegistry, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler, LockFacet } from '../typechain-types'
import { diamondCut } from './utils/helpers'
import { addFacetSelectorsViaEntryPointOnK1, getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
const {
    getSelectors,
    FacetCutAction
} = require('./utils/diamond.js')
import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { AddressZero, createAccountOwner, fund } from './utils/testutils'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'
import { lockFacetFixture } from './fixtures/LockFacetFixture'
import { callFromEntryPointOnK1, executeCallData } from './utils/UserOp'

describe('DiamondLoupe Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let diamondCutBarz: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let accountFacet: AccountFacet
    let lockFacet: LockFacet
    let k1Facet: Secp256k1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let diamondLoupeBarz: DiamondLoupeFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let entryPoint: EntryPoint
    let facetRegistryOwner: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let nonce = 0
    before(async () => {
        [facetRegistryOwner, securityManagerOwner] = await ethers.getSigners()

        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        lockFacet = await lockFacetFixture(securityManager)
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        entryPoint = await entryPointFixture()
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, getSelectors(lockFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))

    })

    beforeEach(async () => {
        nonce = 0
        owner = await createAccountOwner()
        await fund(owner.address)

        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        diamondLoupeBarz = await getFacetBarz('DiamondLoupeFacet', barz)
        diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)

        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
    })

    describe('# supportsInterface', async () => {
        it('Should return true for valid selector', async () => {
            const ERC165 = '0x01ffc9a7'
            expect(await diamondLoupeBarz.supportsInterface(ERC165)).to.be.true

            const ERC721RECEIVER = '0x150b7a02'
            expect(await diamondLoupeBarz.supportsInterface(ERC721RECEIVER)).to.be.true

            const ERC1155RECEIVER = '0x4e2312e0'
            expect(await diamondLoupeBarz.supportsInterface(ERC1155RECEIVER)).to.be.true

            const DIAMONDLOUPE = '0x48e2b093'
            expect(await diamondLoupeBarz.supportsInterface(DIAMONDLOUPE)).to.be.true

            const DIAMONDCUT = diamondCutFacet.interface.getSighash('diamondCut')
            expect(await diamondLoupeBarz.supportsInterface(DIAMONDCUT)).to.be.true

            const ERC777RECEIVER = '0x0023de29'
            expect(await diamondLoupeBarz.supportsInterface(ERC777RECEIVER)).to.be.true

            const ERC1271 = '0x1626ba7e'
            expect(await diamondLoupeBarz.supportsInterface(ERC1271)).to.be.true

            const ERC677RECEIVER = '0xa4c0ed36'
            expect(await diamondLoupeBarz.supportsInterface(ERC677RECEIVER)).to.be.true
        })
        it('Should return false for invalid selector', async () => {
            expect(await diamondLoupeBarz.supportsInterface("0xffffffff")).to.be.false
            expect(await diamondLoupeBarz.supportsInterface("0xbaddad42")).to.be.false
        })
    })
    describe('# facets', async () => {
        it('Should return default facets', async () => {
            const facets = await diamondLoupeBarz.facets()
            const defaultFacets = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],

                [diamondCutFacet.address,
                [diamondCutFacet.interface.getSighash("diamondCut")]],
                [accountFacet.address, [accountFacet.interface.getSighash("execute"),
                accountFacet.interface.getSighash("executeBatch"),
                accountFacet.interface.getSighash("validateUserOp"),
                accountFacet.interface.getSighash("getNonce"),
                accountFacet.interface.getSighash("entryPoint")]],

                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155BatchReceived"),
                tokenReceiverFacet.interface.getSighash("tokensReceived"),
                tokenReceiverFacet.interface.getSighash("onTokenTransfer")]],

                [diamondLoupeFacet.address,
                [diamondLoupeFacet.interface.getSighash("facets"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectors"),
                diamondLoupeFacet.interface.getSighash("facetAddresses"),
                diamondLoupeFacet.interface.getSighash("facetAddress"),
                diamondLoupeFacet.interface.getSighash("supportsInterface"),
                diamondLoupeFacet.interface.getSighash("facetsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectorsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressesFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressFromStorage")]],
            ]
            expect(facets).to.deep.equal(defaultFacets)
        })
        it('Should return valid facet after diamondCut', async () => {
            const lockFacetSelectors = getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager'))
            await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, lockFacet, lockFacetSelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")
            const facets = await diamondLoupeBarz.facets()
            const defaultAfterCut = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],

                [lockFacet.address, lockFacetSelectors],

                [diamondCutFacet.address,
                [diamondCutFacet.interface.getSighash("diamondCut")]],

                [accountFacet.address,
                [accountFacet.interface.getSighash("execute"),
                accountFacet.interface.getSighash("executeBatch"),
                accountFacet.interface.getSighash("validateUserOp"),
                accountFacet.interface.getSighash("getNonce"),
                accountFacet.interface.getSighash("entryPoint")]],

                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155BatchReceived"),
                tokenReceiverFacet.interface.getSighash("tokensReceived"),
                tokenReceiverFacet.interface.getSighash("onTokenTransfer")]],

                [diamondLoupeFacet.address,
                [diamondLoupeFacet.interface.getSighash("facets"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectors"),
                diamondLoupeFacet.interface.getSighash("facetAddresses"),
                diamondLoupeFacet.interface.getSighash("facetAddress"),
                diamondLoupeFacet.interface.getSighash("supportsInterface"),
                diamondLoupeFacet.interface.getSighash("facetsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectorsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressesFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressFromStorage")]],
            ]
            expect(facets).to.deep.equal(defaultAfterCut)
        })
        it('Should return valid facet after cutting all defaultFacet', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, getSelectors(tokenReceiverFacet))
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))


            const tokenReceiverFacetSelectors = getSelectors(tokenReceiverFacet)
            await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, tokenReceiverFacet, tokenReceiverFacetSelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")

            const diamondCutFacetSelectors = getSelectors(diamondCutFacet).filter((item: string) => item !== diamondCutFacet.interface.getSighash('securityManager'))
            await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, diamondCutFacet, diamondCutFacetSelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")

            const diamondLoupeFacetSelectors = getSelectors(diamondLoupeFacet)
            await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, diamondLoupeFacet, diamondLoupeFacetSelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")

            const lockFacetSelectors = getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager'))
            await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, lockFacet, lockFacetSelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")

            const accountFacetSelectors = getSelectors(accountFacet)
            await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, accountFacet, accountFacetSelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")

            const facets = await diamondLoupeBarz.facets()
            const defaultAfterCut = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],

                [tokenReceiverFacet.address,
                    tokenReceiverFacetSelectors],
                [diamondCutFacet.address,
                    diamondCutFacetSelectors],

                [diamondLoupeFacet.address,
                    diamondLoupeFacetSelectors],
                [lockFacet.address, lockFacetSelectors],

                [accountFacet.address,
                    accountFacetSelectors],
            ]
            expect(facets).to.deep.equal(defaultAfterCut)
            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, getSelectors(tokenReceiverFacet))
            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))

        })
        it('Should return valid facets after replacement', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, [diamondCutFacet.interface.getSighash('diamondCut')])

            // Replace DiamondCut to lockFacet address: just for test
            const cut = diamondCut(lockFacet.address, FacetCutAction.Add, [diamondCutFacet.interface.getSighash('diamondCut')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)

            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")
            const facets = await diamondLoupeBarz.facets()
            const defaultAfterCut = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],

                [lockFacet.address, // Originally diamondCutFacet but replaced it to lockFacet
                [diamondCutFacet.interface.getSighash("diamondCut")]],

                [accountFacet.address,
                [accountFacet.interface.getSighash("execute"),
                accountFacet.interface.getSighash("executeBatch"),
                accountFacet.interface.getSighash("validateUserOp"),
                accountFacet.interface.getSighash("getNonce"),
                accountFacet.interface.getSighash("entryPoint")]],

                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155BatchReceived"),
                tokenReceiverFacet.interface.getSighash("tokensReceived"),
                tokenReceiverFacet.interface.getSighash("onTokenTransfer")]],

                [diamondLoupeFacet.address,
                [diamondLoupeFacet.interface.getSighash("facets"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectors"),
                diamondLoupeFacet.interface.getSighash("facetAddresses"),
                diamondLoupeFacet.interface.getSighash("facetAddress"),
                diamondLoupeFacet.interface.getSighash("supportsInterface"),
                diamondLoupeFacet.interface.getSighash("facetsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectorsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressesFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressFromStorage")]],
            ]
            expect(facets).to.deep.equal(defaultAfterCut)

            // Remove from FacetRegistry
            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(lockFacet.address, [diamondCutFacet.interface.getSighash('diamondCut')])
        })
        it('Should return valid facets after manipulation', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, [diamondCutFacet.interface.getSighash('diamondCut')])

            const lockFacetSelectors = getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager'))
            await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, lockFacet, lockFacetSelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")

            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            const addCut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
            const addDiamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [addCut, AddressZero, "0x00"])
            const addCallData = executeCallData(diamondCutBarz.address, 0, addDiamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, addCallData)).to.emit(diamondCutBarz, "DiamondCut")

            const addFacets = await diamondLoupeBarz.facets()
            const defaultAfterAddCut = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],

                [lockFacet.address,
                [...lockFacetSelectors]],

                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155BatchReceived"),
                tokenReceiverFacet.interface.getSighash("tokensReceived"),
                tokenReceiverFacet.interface.getSighash("onTokenTransfer")]],

                [diamondCutFacet.address,
                [diamondCutFacet.interface.getSighash("diamondCut")]],

                [accountFacet.address,
                [accountFacet.interface.getSighash("execute"),
                accountFacet.interface.getSighash("executeBatch"),
                accountFacet.interface.getSighash("validateUserOp"),
                accountFacet.interface.getSighash("getNonce"),
                accountFacet.interface.getSighash("entryPoint")]],

                [diamondLoupeFacet.address,
                [diamondLoupeFacet.interface.getSighash("facets"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectors"),
                diamondLoupeFacet.interface.getSighash("facetAddresses"),
                diamondLoupeFacet.interface.getSighash("facetAddress"),
                diamondLoupeFacet.interface.getSighash("supportsInterface"),
                diamondLoupeFacet.interface.getSighash("facetsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectorsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressesFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressFromStorage")]],
            ]
            expect(addFacets).to.deep.equal(defaultAfterAddCut)


            const removeCut = diamondCut(AddressZero, FacetCutAction.Remove, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
            const removeDiamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [removeCut, AddressZero, "0x00"])
            const removeCallData = executeCallData(diamondCutBarz.address, 0, removeDiamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, removeCallData)).to.emit(diamondCutBarz, "DiamondCut")

            const facetsAfterRemoval = await diamondLoupeBarz.facets()
            const defaultAfterRemovalCut = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],

                [lockFacet.address,
                [...lockFacetSelectors]],

                [diamondCutFacet.address,
                [diamondCutFacet.interface.getSighash("diamondCut")]],

                [accountFacet.address,
                [accountFacet.interface.getSighash("execute"),
                accountFacet.interface.getSighash("executeBatch"),
                accountFacet.interface.getSighash("validateUserOp"),
                accountFacet.interface.getSighash("getNonce"),
                accountFacet.interface.getSighash("entryPoint")]],

                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155BatchReceived"),
                tokenReceiverFacet.interface.getSighash("tokensReceived"),
                tokenReceiverFacet.interface.getSighash("onTokenTransfer")]],

                [diamondLoupeFacet.address,
                [diamondLoupeFacet.interface.getSighash("facets"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectors"),
                diamondLoupeFacet.interface.getSighash("facetAddresses"),
                diamondLoupeFacet.interface.getSighash("facetAddress"),
                diamondLoupeFacet.interface.getSighash("supportsInterface"),
                diamondLoupeFacet.interface.getSighash("facetsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectorsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressesFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressFromStorage")]],
            ]
            expect(facetsAfterRemoval).to.deep.equal(defaultAfterRemovalCut)


            const removeLockCut = diamondCut(AddressZero, FacetCutAction.Remove, getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager')))
            const removeLockDiamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [removeLockCut, AddressZero, "0x00"])
            const removeLockCallData = executeCallData(diamondCutBarz.address, 0, removeLockDiamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, removeLockCallData)).to.emit(diamondCutBarz, "DiamondCut")

            const facetsAfterLockRemoval = await diamondLoupeBarz.facets()
            const defaultAfteLockrRemovalCut = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],

                [diamondCutFacet.address,
                [diamondCutFacet.interface.getSighash("diamondCut")]],

                [accountFacet.address,
                [accountFacet.interface.getSighash("execute"),
                accountFacet.interface.getSighash("executeBatch"),
                accountFacet.interface.getSighash("validateUserOp"),
                accountFacet.interface.getSighash("getNonce"),
                accountFacet.interface.getSighash("entryPoint")]],

                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155BatchReceived"),
                tokenReceiverFacet.interface.getSighash("tokensReceived"),
                tokenReceiverFacet.interface.getSighash("onTokenTransfer")]],

                [diamondLoupeFacet.address,
                [diamondLoupeFacet.interface.getSighash("facets"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectors"),
                diamondLoupeFacet.interface.getSighash("facetAddresses"),
                diamondLoupeFacet.interface.getSighash("facetAddress"),
                diamondLoupeFacet.interface.getSighash("supportsInterface"),
                diamondLoupeFacet.interface.getSighash("facetsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectorsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressesFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressFromStorage")]],
            ]
            expect(facetsAfterLockRemoval).to.deep.equal(defaultAfteLockrRemovalCut)

            const cut = diamondCut(lockFacet.address, FacetCutAction.Add, [diamondCutFacet.interface.getSighash('diamondCut')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            const facets = await diamondLoupeBarz.facets()
            const defaultAfterCut = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],

                [lockFacet.address, // Replaced diamondCut with LockFacet
                [diamondCutFacet.interface.getSighash("diamondCut")]],

                [accountFacet.address,
                [accountFacet.interface.getSighash("execute"),
                accountFacet.interface.getSighash("executeBatch"),
                accountFacet.interface.getSighash("validateUserOp"),
                accountFacet.interface.getSighash("getNonce"),
                accountFacet.interface.getSighash("entryPoint")]],

                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155Received"),
                tokenReceiverFacet.interface.getSighash("onERC1155BatchReceived"),
                tokenReceiverFacet.interface.getSighash("tokensReceived"),
                tokenReceiverFacet.interface.getSighash("onTokenTransfer")]],

                [diamondLoupeFacet.address,
                [diamondLoupeFacet.interface.getSighash("facets"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectors"),
                diamondLoupeFacet.interface.getSighash("facetAddresses"),
                diamondLoupeFacet.interface.getSighash("facetAddress"),
                diamondLoupeFacet.interface.getSighash("supportsInterface"),
                diamondLoupeFacet.interface.getSighash("facetsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetFunctionSelectorsFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressesFromStorage"),
                diamondLoupeFacet.interface.getSighash("facetAddressFromStorage")]],
            ]
            expect(facets).to.deep.equal(defaultAfterCut)

            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
        })
    })
    describe('# facetAddresses', () => {
        it('Should return default facet addresses', async () => {
            const defaultFacetAddresses = [k1Facet.address, diamondCutFacet.address, accountFacet.address, tokenReceiverFacet.address, diamondLoupeFacet.address]
            expect(await diamondLoupeBarz.facetAddresses()).to.deep.equal(defaultFacetAddresses)
        })
        it('Should return added facet address when added to diamond', async () => {
            const expectedFacetAddresses = [k1Facet.address, lockFacet.address, diamondCutFacet.address, accountFacet.address, tokenReceiverFacet.address, diamondLoupeFacet.address]
            const lockFacetSelectors = getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager'))
            const cut = diamondCut(lockFacet.address, FacetCutAction.Add, lockFacetSelectors)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")
            expect(await diamondLoupeBarz.facetAddresses()).to.deep.equal(expectedFacetAddresses)
        })
        it('Should return replaced facet address', async () => {
            // Just for testing
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            const beforeFacetAddresses = [k1Facet.address, tokenReceiverFacet.address, diamondCutFacet.address, accountFacet.address, diamondLoupeFacet.address]
            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")
            expect(await diamondLoupeBarz.facetAddresses()).to.deep.equal(beforeFacetAddresses)

            const afterFacetAddresses = [k1Facet.address, lockFacet.address, diamondCutFacet.address, accountFacet.address, tokenReceiverFacet.address, diamondLoupeFacet.address]
            const replaceCut = diamondCut(lockFacet.address, FacetCutAction.Replace, receiverFacetSelector)
            const diamondReplaceCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [replaceCut, AddressZero, "0x00"])
            const replaceCallData = executeCallData(diamondCutBarz.address, 0, diamondReplaceCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, replaceCallData)).to.emit(diamondCutBarz, "DiamondCut")
            expect(await diamondLoupeBarz.facetAddresses()).to.deep.equal(afterFacetAddresses)

            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(lockFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

        })
    })
    describe('# facetFunctionSelectors', () => {
        it('Should return default facet function selectors', async () => {
            expect(await diamondLoupeBarz.facetFunctionSelectors(k1Facet.address)).to.deep.equal([k1Facet.interface.getSighash('isValidSignature'), k1Facet.interface.getSighash('validateOwnerSignature'), k1Facet.interface.getSighash('owner')])
        })
        it('Should return added facet functions selectors when added to diamond', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(lockFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            expect(await diamondLoupeBarz.facetFunctionSelectors(lockFacet.address)).to.deep.equal([tokenReceiverFacet.interface.getSighash('onERC721Received')])

            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(lockFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
        })
        it('Should return empty selectors if facet is attached', async () => {
            expect(await diamondLoupeBarz.facetFunctionSelectors(lockFacet.address)).to.deep.equal([])
        })
    })
    describe('# facetAddress', () => {
        it('Should return valid facet address of facet function selector', async () => {
            const ownerSelector = k1Facet.interface.getSighash('owner')
            expect(await diamondLoupeBarz.facetAddress(ownerSelector)).to.equal(k1Facet.address)

            const diamondCutSelector = diamondCutFacet.interface.getSighash('diamondCut')
            expect(await diamondLoupeBarz.facetAddress(diamondCutSelector)).to.equal(diamondCutFacet.address)

            const onERC721ReceivedSelector = tokenReceiverFacet.interface.getSighash('onERC721Received')
            expect(await diamondLoupeBarz.facetAddress(onERC721ReceivedSelector)).to.equal(tokenReceiverFacet.address)
        })
        it('Should return zero address if non-existent function selector', async () => {
            const lockSelector = lockFacet.interface.getSighash('lock')
            expect(await diamondLoupeBarz.facetAddress(lockSelector)).to.equal(AddressZero)
        })
        it('Should return added facet address when added to diamond', async () => {
            const lockSelector = lockFacet.interface.getSighash("lock")
            const cut = diamondCut(lockFacet.address, FacetCutAction.Add, [lockSelector])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            expect(await diamondLoupeBarz.facetAddress(lockSelector)).to.equal(lockFacet.address)
        })
    })
    describe('# facetsFromStorage', () => {
        it('Should return verification facet by default', async () => {
            const defaultFacets = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]]]
            expect(await diamondLoupeBarz.facetsFromStorage()).to.deep.equal(defaultFacets)
        })
        it('Should return added facet when facet is added', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            const defaultFacets = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],
                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received")]]
            ]
            expect(await diamondLoupeBarz.facetsFromStorage()).to.deep.equal(defaultFacets)

            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
        })
        it('Should exclude removed facet', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            const facets = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]],
                [tokenReceiverFacet.address,
                [tokenReceiverFacet.interface.getSighash("onERC721Received")]]
            ]
            expect(await diamondLoupeBarz.facetsFromStorage()).to.deep.equal(facets)

            const removeCut = diamondCut(AddressZero, FacetCutAction.Remove, receiverFacetSelector)
            const removeCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [removeCut, AddressZero, "0x00"])
            const removeCallData = executeCallData(diamondCutBarz.address, 0, removeCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, removeCallData)).to.emit(diamondCutBarz, "DiamondCut")

            const facetsAfterRemoval = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]]
            ]
            expect(await diamondLoupeBarz.facetsFromStorage()).to.deep.equal(facetsAfterRemoval)

            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
        })
    })
    describe('# facetAddressFromStorage', () => {
        it('Should return valid address of facet', async () => {
            expect(await diamondLoupeBarz.facetAddressFromStorage(k1Facet.interface.getSighash('isValidSignature'))).to.equal(k1Facet.address)
            expect(await diamondLoupeBarz.facetAddressFromStorage(k1Facet.interface.getSighash('owner'))).to.equal(k1Facet.address)
            expect(await diamondLoupeBarz.facetAddressFromStorage(k1Facet.interface.getSighash('validateOwnerSignature'))).to.equal(k1Facet.address)
            expect(await diamondLoupeBarz.facetAddressFromStorage(diamondCutFacet.interface.getSighash('diamondCut'))).to.equal(AddressZero)
        })
        it('Should return added facet when facet is added', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            expect(await diamondLoupeBarz.facetAddressFromStorage(tokenReceiverFacet.interface.getSighash('onERC721Received'))).to.equal(AddressZero)

            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            expect(await diamondLoupeBarz.facetAddressFromStorage(tokenReceiverFacet.interface.getSighash('onERC721Received'))).to.equal(tokenReceiverFacet.address)

            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
        })
    })
    describe('# facetAddressesFromStorage', () => {
        it('Should return valid list of facet addresses', async () => {
            const facetAddresses = [
                k1Facet.address
            ]
            expect(await diamondLoupeBarz.facetAddressesFromStorage()).to.deep.equal(facetAddresses)
        })
        it('Should return added facet when facet is added', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            expect(await diamondLoupeBarz.facetAddressFromStorage(tokenReceiverFacet.interface.getSighash('onERC721Received'))).to.equal(AddressZero)

            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            const facetAddresses = [
                k1Facet.address,
                tokenReceiverFacet.address
            ]
            expect(await diamondLoupeBarz.facetAddressesFromStorage()).to.deep.equal(facetAddresses)
            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
        })
        it('Should return exclude facet address when facet is removed', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            expect(await diamondLoupeBarz.facetAddressFromStorage(tokenReceiverFacet.interface.getSighash('onERC721Received'))).to.equal(AddressZero)

            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            const facetAddresses = [
                k1Facet.address,
                tokenReceiverFacet.address
            ]
            expect(await diamondLoupeBarz.facetAddressesFromStorage()).to.deep.equal(facetAddresses)

            const removeCut = diamondCut(AddressZero, FacetCutAction.Remove, receiverFacetSelector)
            const removeCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [removeCut, AddressZero, "0x00"])
            const removeCallData = executeCallData(diamondCutBarz.address, 0, removeCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, removeCallData)).to.emit(diamondCutBarz, "DiamondCut")

            const facetsAfterRemoval = [
                [k1Facet.address,
                [k1Facet.interface.getSighash("isValidSignature"),
                k1Facet.interface.getSighash("validateOwnerSignature"),
                k1Facet.interface.getSighash("owner")]]
            ]
            expect(await diamondLoupeBarz.facetsFromStorage()).to.deep.equal(facetsAfterRemoval)

            const facetAddressesAfterRemoval = [
                k1Facet.address
            ]
            expect(await diamondLoupeBarz.facetAddressesFromStorage()).to.deep.equal(facetAddressesAfterRemoval)

            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
        })
    })
    describe('# facetFunctionSelectorsFromStorage', () => {
        it('Should return valid list of facet function selectors', async () => {
            const verificationFacetSelectors = [
                k1Facet.interface.getSighash('isValidSignature'),
                k1Facet.interface.getSighash('validateOwnerSignature'),
                k1Facet.interface.getSighash('owner')
            ]
            expect(await diamondLoupeBarz.facetFunctionSelectorsFromStorage(k1Facet.address)).to.deep.equal(verificationFacetSelectors)
        })
        it('Should return added facet selector when facet is added', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            expect(await diamondLoupeBarz.facetAddressFromStorage(tokenReceiverFacet.interface.getSighash('onERC721Received'))).to.equal(AddressZero)

            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")
            const verificationFacetSelectors = [
                k1Facet.interface.getSighash('isValidSignature'),
                k1Facet.interface.getSighash('validateOwnerSignature'),
                k1Facet.interface.getSighash('owner')
            ]
            expect(await diamondLoupeBarz.facetFunctionSelectorsFromStorage(k1Facet.address)).to.deep.equal(verificationFacetSelectors)
            expect(await diamondLoupeBarz.facetFunctionSelectorsFromStorage(tokenReceiverFacet.address)).to.deep.equal(receiverFacetSelector)

            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])
        })
        it('Should return exclude facet selector when facet is removed', async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(tokenReceiverFacet.address, [tokenReceiverFacet.interface.getSighash("onERC721Received")])

            expect(await diamondLoupeBarz.facetAddressFromStorage(tokenReceiverFacet.interface.getSighash('onERC721Received'))).to.equal(AddressZero)

            const receiverFacetSelector = [tokenReceiverFacet.interface.getSighash("onERC721Received")]
            const cut = diamondCut(tokenReceiverFacet.address, FacetCutAction.Add, receiverFacetSelector)
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")
            const verificationFacetSelectors = [
                k1Facet.interface.getSighash('isValidSignature'),
                k1Facet.interface.getSighash('validateOwnerSignature'),
                k1Facet.interface.getSighash('owner')
            ]
            expect(await diamondLoupeBarz.facetFunctionSelectorsFromStorage(k1Facet.address)).to.deep.equal(verificationFacetSelectors)
            expect(await diamondLoupeBarz.facetFunctionSelectorsFromStorage(tokenReceiverFacet.address)).to.deep.equal(receiverFacetSelector)

            const removeCut = diamondCut(AddressZero, FacetCutAction.Remove, receiverFacetSelector)
            const removeCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [removeCut, AddressZero, "0x00"])
            const removeCallData = executeCallData(diamondCutBarz.address, 0, removeCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, removeCallData)).to.emit(diamondCutBarz, "DiamondCut")

            expect(await diamondLoupeBarz.facetFunctionSelectorsFromStorage(tokenReceiverFacet.address)).to.deep.equal([])
            expect(await diamondLoupeBarz.facetFunctionSelectorsFromStorage(k1Facet.address)).to.deep.equal(verificationFacetSelectors)
        })
    })
})
