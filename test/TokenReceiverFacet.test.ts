import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, FacetRegistry, DiamondLoupeFacet, TokenReceiverFacet, TestERC1155, TestNFT, DefaultFallbackHandler } from '../typechain-types'
import { getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const {
    getSelectors
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
import { testERC1155Fixture } from './fixtures/TestERC1155Fixture'
import { testNFTFixture } from './fixtures/TestNFTFixture'
import { createAccountOwner, fund } from './utils/testutils'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'

describe('TokenReceiver Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let securityManager: SecurityManager
    let defaultFallbackHandler: DefaultFallbackHandler
    let facetRegistry: FacetRegistry
    let accountFacet: AccountFacet
    let k1Facet: Secp256k1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let tokenReceiverBarz: TokenReceiverFacet
    let entryPoint: EntryPoint
    let facetRegistryOwner: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let testERC1155: TestERC1155
    let testNFT: TestNFT

    before(async () => {
        [facetRegistryOwner, securityManagerOwner] = await ethers.getSigners()

        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        entryPoint = await entryPointFixture()

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))

    })

    beforeEach(async () => {
        owner = await createAccountOwner()
        await fund(owner.address)

        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        tokenReceiverBarz = await getFacetBarz('TokenReceiverFacet', barz)

        testERC1155 = await testERC1155Fixture()
        testNFT = await testNFTFixture()
        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
    })

    describe('# onERC721Received', async () => {
        const tokenId = 1

        it('Should return valid selector', async () => {
            // 0x150b7a02
            expect(await tokenReceiverBarz.onERC721Received(owner.address, owner.address, 1, "0x00")).to.equal("0x150b7a02")
        })
        it('Should receive ERC721 safe transfer', async () => {
            await testNFT.mint(owner.address)
            testNFT = testNFT.connect(owner)
            await expect(testNFT['safeTransferFrom(address,address,uint256)'](owner.address, barz.address, tokenId)).to.emit(testNFT, "Transfer").withArgs(owner.address, barz.address, tokenId)
            
            expect(await testNFT.ownerOf(tokenId)).to.equal(barz.address)
        })

    })
    describe('# onERC1155Received', async () => {
        const tokenId = 1
        const mintAmount = 100
        it('Should return valid selector', async () => {
            // 0xf23a6e61
            expect(await tokenReceiverBarz.onERC1155Received(owner.address, owner.address, tokenId, mintAmount, "0x00")).to.equal("0xf23a6e61")
        })
        it('Should receive ERC1155 safe transfer', async () => {
            await testERC1155.mint(owner.address, mintAmount)
            expect(await testERC1155.balanceOf(owner.address, tokenId)).to.equal(100)

            testERC1155 = testERC1155.connect(owner)
            await expect(testERC1155.safeTransferFrom(owner.address, barz.address, tokenId, mintAmount, "0x00")).to.emit(testERC1155, "TransferSingle")
                .withArgs(owner.address, owner.address, barz.address, tokenId, mintAmount)
        })
    })
    describe('# onERC1155BatchReceived', async () => {
        const mintIds = [1, 2, 3]
        const mintAmounts = [100, 200, 300]
        const ownerBatch = [owner.address, owner.address, owner.address]
        it('Should return valid selector', async () => {
            // 0xbc197c81
            expect(await tokenReceiverBarz.onERC1155BatchReceived(owner.address, owner.address, mintIds, mintAmounts, "0x00")).to.equal("0xbc197c81")
        })
        it('Should return valid selector from Facet', async () => {
            // 0xbc197c81
            expect(await tokenReceiverFacet.onERC1155BatchReceived(owner.address, owner.address, mintIds, mintAmounts, "0x00")).to.equal("0xbc197c81")
        })
        it('Should receive ERC1155 safe batch transfer', async () => {
            await testERC1155.mintBatch(owner.address, mintIds, mintAmounts, "0x00")
            expect(await testERC1155.balanceOfBatch(ownerBatch, mintIds)).to.deep.equal(mintAmounts)

            testERC1155 = testERC1155.connect(owner)
            await expect(testERC1155.safeBatchTransferFrom(owner.address, barz.address, mintIds, mintAmounts, "0x00")).to.emit(testERC1155, "TransferBatch")
                .withArgs(owner.address, owner.address, barz.address, mintIds, mintAmounts)
        })
    })
    describe('# tokensReceived', async () => {
        it('Should not revert', async () => {
            await expect(tokenReceiverBarz.tokensReceived(owner.address, owner.address, owner.address, 0, "0x00", "0x00")).to.not.reverted
        })
    })
    describe('# onTokenTransfer', async () => {
        const dummyUint = 1
        it('Should not revert', async () => {
            await expect(tokenReceiverBarz.onTokenTransfer(owner.address, dummyUint, "0x00")).to.not.reverted
        })
        it('Should return true', async () => {
            expect(await tokenReceiverBarz.onTokenTransfer(owner.address, dummyUint, "0x00")).to.be.true
        })
    })

})