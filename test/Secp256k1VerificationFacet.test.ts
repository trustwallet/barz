import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, FacetRegistry, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler } from '../typechain-types'
import { fillUserOpDefaults, getUserOpHash, signUserOpK1Curve } from './utils/UserOp'
import { ecsign, toRpcSig, keccak256 as keccak256_buffer } from 'ethereumjs-util'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { getChainId } from './utils/helpers'
import { barzFixture } from './fixtures/BarzFixture'
import { AddressZero, createAccountOwner, fund, callGasLimit, verificationGasLimit, maxFeePerGas, getMessageHash} from './utils/testutils'
const {
    getSelectors
} = require('./utils/diamond.js')
import { expect } from "chai"
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { getFacetBarz, addFacetSelectorsViaEntryPointOnK1, setupDefaultSecuritManager } from './utils/setup'
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'

describe('Secp256k1 Verification Facet', () => {
    let invalidSigner: Wallet
    let signer: Wallet
    let chainId: number
    let entryPoint: EntryPoint
    let defaultFallbackHandler: DefaultFallbackHandler
    let facetRegistry: FacetRegistry
    let secp256k1VerificationFacet: Secp256k1VerificationFacet
    let k1Barz: Secp256k1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let barz: Barz
    let securityManager: SecurityManager
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let accountFacet: AccountFacet
    let diamondCutFacet: DiamondCutFacet

    const enc = ethers.utils.defaultAbiCoder.encode(['string'], ["LOGIN to Trust Wallet Timestamp:1683119999"])
    const msgHash = ethers.utils.keccak256(enc)
    const ethSignMsg = Buffer.concat([
        Buffer.from('\x19Ethereum Signed Message:\n32', 'ascii'),
        Buffer.from(ethers.utils.arrayify(msgHash))
    ])
    const ethSignMsgHash = keccak256_buffer(ethSignMsg)

    before(async () => {
        [securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        signer = createAccountOwner()
        invalidSigner = createAccountOwner(1000) // just a random number
        await fund(signer.address)
        chainId = await getChainId()
        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        accountFacet = await accountFacetFixture()
        entryPoint = await entryPointFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        secp256k1VerificationFacet = await secp256k1VerificationFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(secp256k1VerificationFacet.address, getSelectors(secp256k1VerificationFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))

        barz = await barzFixture(accountFacet, secp256k1VerificationFacet, entryPoint, facetRegistry, defaultFallbackHandler, signer.publicKey)
        await fund(barz.address)
        
        const diamondBarz = await getFacetBarz("DiamondCutFacet", barz)
        const addedSelectors = [secp256k1VerificationFacet.interface.getSighash("validateSignature"), 
        secp256k1VerificationFacet.interface.getSighash("isValidKeyType"), 
        secp256k1VerificationFacet.interface.getSighash('validateOwnerSignatureSelector'), 
        secp256k1VerificationFacet.interface.getSighash('initializeSigner'),
        secp256k1VerificationFacet.interface.getSighash('uninitializeSigner')]
        await expect(addFacetSelectorsViaEntryPointOnK1(barz, signer, secp256k1VerificationFacet, addedSelectors, entryPoint)).to.emit(diamondBarz, "DiamondCut")

        k1Barz = await getFacetBarz("Secp256k1VerificationFacet", barz)

    })
    describe("# initializeSigner", () => {
        it("Should revert if already initialized", async () => {
            await expect(k1Barz.initializeSigner(invalidSigner.publicKey)).to.be.revertedWithCustomError(k1Barz, "LibAppStorage__SignerMustBeUninitialized")
        })
    })
    describe("#uninitializeSigner", () => {
        it("Should revert uninitialization if not middle of signature migration", async () => {
            await expect(k1Barz.uninitializeSigner()).to.be.revertedWithCustomError(k1Barz, "LibAppStorage__AccountMustBeUninitialized")
        })
    })
    describe("# validateOwnerSignature", () => {
        it("Should verify valid ECDSA signature", async () => {
            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                sender: signer.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas
            }), signer, entryPoint.address, chainId)
            const opHash = getUserOpHash(userOp, entryPoint.address, chainId)
            const isSignatureValid = await k1Barz.validateOwnerSignature(userOp, opHash)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            expect(isSignatureValid).to.equal(0)
        })
        it("Should fail to verifiy invalid ECDSA signature", async () => {
            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                sender: signer.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas
            }), signer, AddressZero, chainId)
            const opHash = getUserOpHash(userOp, entryPoint.address, chainId)
            // userOp signed is using AddressZero for entrypoint address but userOpHash is generated with mockEntryPoint
            const isSignatureValid = await k1Barz.validateOwnerSignature(userOp, opHash)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            expect(isSignatureValid).to.equal(1)
        })
    })
    describe("# validateSignature", () => {
        it("Should return 0 for a valid signature", async () => {
            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                sender: signer.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas
            }), signer, entryPoint.address, chainId)
            const opHash = getUserOpHash(userOp, entryPoint.address, chainId)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            // signer signed the UserOp and validating it with signer -> verification success
            expect(await k1Barz.validateSignature(userOp, opHash, signer.address.toLowerCase())).to.equal(0)
        })
        it("Should return 1 for an invalid signature", async () => {
            const randomSigner = ethers.Wallet.createRandom()
            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                sender: signer.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas
            }), randomSigner, entryPoint.address, chainId)
            const opHash = getUserOpHash(userOp, entryPoint.address, chainId)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            // signer signed the UserOp but validating it with owner -> verification fail
            expect(await k1Barz.validateSignature(userOp, opHash, signer.address)).to.equal(1)
        })
    })
    describe("# isValidKeyType", () => {
        it("Should return true for a valid key length", async () => {
            expect(await k1Barz.isValidKeyType(signer.publicKey)).to.equal(true)
            expect(await k1Barz.isValidKeyType(signer.address)).to.equal(true)
        })
        it("Should return false for an invalid key length", async () => {
            expect(await k1Barz.isValidKeyType(signer.address + "000000")).to.equal(false)
        })
        it("Should return false for an invalid key type", async () => {
            const publicKey = "0x02" + signer.publicKey.substring(4)
            expect(await k1Barz.isValidKeyType(publicKey)).to.equal(false)
        })
    })
    describe("# owner", () => {
        it("Should return valid owner public key", async () => {
            expect(await k1Barz.owner()).to.equal(signer.address.toLowerCase())
        })
    })
    describe("# validateOwnerSignatureSelector", () => {
        it("Should return valid selector", async () => {
            expect(await k1Barz.validateOwnerSignatureSelector()).to.equal(k1Barz.interface.getSighash('validateOwnerSignature'))
        })
    })
    describe("EIP-1271 # isValidSignature", async () => {
        it("Should return EIP-1271 magic value if signature is valid", async () => {
            const finalHash = await getMessageHash(ethSignMsgHash, await getChainId(), k1Barz.address)

            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(signer.privateKey)))
            const signedMessage = toRpcSig(sig.v, sig.r, sig.s)
            expect(await k1Barz.isValidSignature(ethSignMsgHash, signedMessage)).to.equal("0x1626ba7e")
        })
        it("Should return dummy value when signature is invalid", async () => {
            const finalHash = await getMessageHash(ethSignMsgHash, await getChainId(), k1Barz.address)

            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(invalidSigner.privateKey)))
            const signedMessage = toRpcSig(sig.v, sig.r, sig.s)
            expect(await k1Barz.isValidSignature(ethSignMsgHash, signedMessage)).to.equal("0xffffffff")
        })
    })
})