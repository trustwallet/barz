import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Secp256k1VerificationFacet, SecurityManager, FacetRegistry, BarzFactory, Secp256r1VerificationFacet, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler } from '../typechain-types'
import { generateKeyPair } from './utils/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { createAccountOwner, fund } from './utils/testutils'
const {
    getSelectors
} = require('./utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { barzFactoryFixture } from './fixtures/BarzFactoryFixture'
import { secp256r1VerificationFacetFixture } from './fixtures/Secp256r1VerificationFacetFixture'
import { setupDefaultSecuritManager } from './utils/setup'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'
import BarzArtifact from "../artifacts/contracts/Barz.sol/Barz.json";


describe('Barz Factory', () => {
    let diamondCutFacet: DiamondCutFacet
    let securityManager: SecurityManager
    let defaultFallbackHandler: DefaultFallbackHandler
    let facetRegistry: FacetRegistry
    let accountFacet: AccountFacet
    let k1Facet: Secp256k1VerificationFacet
    let r1Facet: Secp256r1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let entryPoint: EntryPoint
    let owner: Wallet
    let barzFactory: BarzFactory
    let accountBarz: AccountFacet
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    const salt = 0
    before(async () => {
        [securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        owner = createAccountOwner()
        await fund(owner.address)

        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        r1Facet = await secp256r1VerificationFacetFixture()
        entryPoint = await entryPointFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))

    })
    beforeEach(async () => {
        barzFactory = await barzFactoryFixture(accountFacet, entryPoint, facetRegistry, defaultFallbackHandler)
    })

    describe("# getCreation code", () => {
        it("Should return a precomputed address", async () => {
            const bytecode = BarzArtifact.bytecode;
            const actualCreationCode = await barzFactory.getCreationCode();

            expect(actualCreationCode).to.equal(bytecode);
        });
    });
    describe("# getAddress", () => {
        it("Should return a precomputed address", async () => {
            const precomputedBarzAddr = await barzFactory.getAddress(k1Facet.address, owner.publicKey, salt)
            await expect(barzFactory.createAccount(k1Facet.address, owner.publicKey, salt)).to.emit(barzFactory, "BarzDeployed").withArgs(precomputedBarzAddr)
        })
        it("Should check predefined address", async () => {
            const precomputedBarzAddr = await barzFactory.getAddress(k1Facet.address, owner.publicKey, salt)
            const bytecode = await barzFactory.getBytecode(accountFacet.address, k1Facet.address, entryPoint.address, facetRegistry.address, defaultFallbackHandler.address, owner.publicKey)
            const calculatedAddr = await ethers.utils.getCreate2Address(barzFactory.address, "0x0000000000000000000000000000000000000000000000000000000000000000", ethers.utils.keccak256(bytecode))
            expect(precomputedBarzAddr).to.equal(calculatedAddr)
        })
    })
    describe("# createAccount", () => {
        it("Should deploy Barz with factory", async () => {
            const precomputedBarzAddr = await barzFactory.getAddress(k1Facet.address, owner.publicKey, salt)
            await expect(barzFactory.createAccount(k1Facet.address, owner.publicKey, salt)).to.emit(barzFactory, "BarzDeployed").withArgs(precomputedBarzAddr)
            accountBarz = await ethers.getContractAt('AccountFacet', precomputedBarzAddr) as AccountFacet

            expect(await accountBarz.getNonce()).to.equal(0)
            expect(await accountBarz.entryPoint()).to.equal(entryPoint.address)
        })
        it("Should not deploy Barz with factory if one already exists", async () => {
            const precomputedBarzAddr = await barzFactory.getAddress(k1Facet.address, owner.publicKey, salt);

            await barzFactory.createAccount(k1Facet.address, owner.publicKey, salt);
            const codeSizeBefore = await ethers.provider.getCode(precomputedBarzAddr);
            expect(codeSizeBefore).to.not.equal("0x");
            const accountBarz = (await ethers.getContractAt("AccountFacet", precomputedBarzAddr)) as AccountFacet;
            const nonceBefore = await accountBarz.getNonce();

            await expect(barzFactory.createAccount(k1Facet.address, owner.publicKey, salt)).to.not.emit(barzFactory, "BarzDeployed");

            const nonceAfter = await accountBarz.getNonce();
            expect(nonceAfter).to.equal(nonceBefore);
        });
        it("Should initialize Barz wallet with accurate param(owner) of k1 facet", async () => {
            const precomputedBarzAddr = await barzFactory.getAddress(k1Facet.address, owner.publicKey, salt)
            await expect(barzFactory.createAccount(k1Facet.address, owner.publicKey, salt)).to.emit(barzFactory, "BarzDeployed").withArgs(precomputedBarzAddr)

            const k1Barz = await ethers.getContractAt("Secp256k1VerificationFacet", precomputedBarzAddr)

            expect(await k1Barz.owner()).to.equal(owner.address.toLowerCase())
        })
        it("Should initialize Barz wallet with accurate param(owner) of r1 facet", async () => {
            const { publicKeyBytes, keyX, keyY } = generateKeyPair()
            const precomputedBarzAddr = await barzFactory.getAddress(r1Facet.address, publicKeyBytes, salt)
            await expect(barzFactory.createAccount(r1Facet.address, publicKeyBytes, salt)).to.emit(barzFactory, "BarzDeployed").withArgs(precomputedBarzAddr)

            const r1Barz = await ethers.getContractAt("Secp256r1VerificationFacet", precomputedBarzAddr)

            expect(await r1Barz.owner()).to.equal(("0x" + keyX.toString('hex') + keyY.toString('hex')).toLowerCase())
        })
    })
})