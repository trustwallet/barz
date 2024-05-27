import { ethers } from 'hardhat'

import { expect } from "chai"
import { AccountFacet, FacetRegistry, Secp256k1VerificationFacet } from '../../typechain-types'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const {
    getSelectors
} = require('../utils/diamond.js')

import { accountFacetFixture } from '../fixtures/AccountFacetFixture'
import { facetRegistryFixture } from '../fixtures/FacetRegistryFixture'
import { secp256k1VerificationFacetFixture } from '../fixtures/Secp256k1VerificationFacetFixture'
import { AddressZero } from '../utils/testutils'

describe('Facet Registry', () => {
    let facetRegistry: FacetRegistry
    let accountFacet: AccountFacet
    let k1Facet: Secp256k1VerificationFacet
    let user: SignerWithAddress
    let k1FacetSelectors: any
    let accountFacetSelectors: any
    let initializeSelector: any
    let facetRegistryOwner: SignerWithAddress

    before(async () => {
        [user, facetRegistryOwner] = await ethers.getSigners()

        k1Facet = await secp256k1VerificationFacetFixture()
        k1FacetSelectors = getSelectors(k1Facet)
        accountFacet = await accountFacetFixture()
        accountFacetSelectors = getSelectors(accountFacet)
        initializeSelector = accountFacet.interface.getSighash("initialize")
    })
    beforeEach(async () => {
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, k1FacetSelectors)
    })
    describe("# registerFacetFunctionSelectors", () => {
        it("Should revert if not owner", async () => {
            await expect(facetRegistry.connect(user).registerFacetFunctionSelectors(accountFacet.address, accountFacetSelectors)).to.be.revertedWith("Ownable: caller is not the owner")
        })
        it("Should set facet information", async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, accountFacetSelectors)
            expect(await facetRegistry.getFacetFunctionSelectors(accountFacet.address)).to.deep.equal(accountFacetSelectors)

            expect(await facetRegistry.getFacetFunctionSelectors(k1Facet.address)).to.deep.equal(k1FacetSelectors)
        })
        it("Should emit registered event", async () => {
            await expect(facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, accountFacetSelectors)).to.emit(facetRegistry, "FacetFunctionSelectorsRegistered").withArgs(accountFacet.address, accountFacetSelectors)
        })
    })
    describe("# removeFacetFunctionSelectors", () => {
        it("Should revert if not owner", async () => {
            await expect(facetRegistry.connect(user).removeFacetFunctionSelectors(k1Facet.address, k1FacetSelectors)).to.be.revertedWith("Ownable: caller is not the owner")
        })
        it("Should remove facet information", async () => {
            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(k1Facet.address, k1FacetSelectors)
            expect(await facetRegistry.getFacetFunctionSelectors(k1Facet.address)).to.deep.equal([])
        })
        it("Should emit removed event", async () => {
            await expect(facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(k1Facet.address, k1FacetSelectors)).to.emit(facetRegistry, "FacetFunctionSelectorsRemoved").withArgs(k1Facet.address, k1FacetSelectors)
        })
    })
    describe("# areFacetFunctionSelectorsRegistered", () => {
        it("Should return false if facet & selectors are not registered", async () => {
            expect(await facetRegistry.areFacetFunctionSelectorsRegistered(accountFacet.address, accountFacetSelectors)).to.be.false
        })
        it("Should return true if facet & selectors are registered", async () => {
            expect(await facetRegistry.areFacetFunctionSelectorsRegistered(k1Facet.address, k1FacetSelectors)).to.be.true
        })
        it("Should return false if facet is zero address", async () => {
            expect(await facetRegistry.areFacetFunctionSelectorsRegistered(AddressZero, k1FacetSelectors)).to.be.false
        })
        it("Should return false if facet selector length is zero", async () => {
            expect(await facetRegistry.areFacetFunctionSelectorsRegistered(AddressZero, [])).to.be.false
        })
    })
    describe("# isFacetFunctionSelectorRegistered", () => {
        it("Should return false if facet & selector is not registered", async () => {
            expect(await facetRegistry.isFacetFunctionSelectorRegistered(accountFacet.address, initializeSelector)).to.be.false
        })
        it("Should return true if facet & selector are registered", async () => {
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, [initializeSelector])
            expect(await facetRegistry.isFacetFunctionSelectorRegistered(accountFacet.address, initializeSelector)).to.be.true
        })
    })
    describe("# getFacetFunctionSelectors", () => {
        it("Should return emtpy list if facet is not registered", async () => {
            expect(await facetRegistry.getFacetFunctionSelectors(accountFacet.address)).to.deep.equal([])
        })
        it("Should return list of selectors registered to facet", async () => {
            expect(await facetRegistry.getFacetFunctionSelectors(k1Facet.address)).to.deep.equal(k1FacetSelectors)
        })
    })
})