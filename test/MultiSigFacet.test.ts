import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, FacetRegistry, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler, MultiSigFacet, Secp256r1VerificationFacet } from '../typechain-types'
import { getChainId, guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityWindow, minGuardianSecurityWindow, maxGuardianSecurityWindow, recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod, lockPeriod, minLockPeriod, maxLockPeriod, approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod, diamondCut, generateKeyPair } from './utils/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { AddressOne, AddressZero, addPrefix, createAccountOwner, fund, getMessageHash, removePrefix, sortSignatures } from './utils/testutils'

const {
    FacetCutAction,
    getSelectors
} = require('./utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { getFacetBarz, setupSecurityManager } from './utils/setup'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { EntryPoint } from '../typechain-types/core'
import { executeCallData, fillUserOpDefaults, getUserOpHash, signMsgOnR1Curve, signUserOpK1Curve } from './utils/UserOp'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'
import { multiSigFacetFixture } from './fixtures/MultiSigFacetFixture'
import { secp256r1VerificationFacetFixture } from './fixtures/Secp256r1VerificationFacetFixture'
import { testTokenFixture } from './fixtures/TestTokenFixture'
import { ecsign, keccak256, toRpcSig } from 'ethereumjs-util'
import { arrayify } from 'ethers/lib/utils'

describe('Multi-Sig Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let accountFacet: AccountFacet
    let k1Facet: Secp256k1VerificationFacet
    let r1Facet: Secp256r1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let multiSigFacet: MultiSigFacet
    let entryPoint: EntryPoint
    let owner1: SignerWithAddress
    let owner2: SignerWithAddress
    let mockEntryPoint: SignerWithAddress
    let user1: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let owner: Wallet
    let subOwner: Wallet
    let ownerSeed = 0
    before(async () => {
        [owner1, owner2, securityManagerOwner, mockEntryPoint, facetRegistryOwner, user1] = await ethers.getSigners()
        owner = createAccountOwner(ownerSeed++)
        subOwner = createAccountOwner(ownerSeed++)
        await fund(owner.address)

        securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
            minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
            minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
            minLockPeriod, maxLockPeriod, lockPeriod,
            minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        r1Facet = await secp256r1VerificationFacetFixture()
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        entryPoint = await entryPointFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        multiSigFacet = await multiSigFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(multiSigFacet.address, getSelectors(multiSigFacet))

        expect(await facetRegistry.owner()).to.equal(facetRegistryOwner.address)
    })
    describe("# initializeSigner", () => {
        let threshold: any
        let salt: any
        let Factory: any
        let factory: any
        let initData: any
        beforeEach(async () => {
            threshold = "00000001"
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
        })
        it("Should revert if signer is already initialized", async () => {
            initData = addPrefix(threshold + removePrefix(owner.address))
            await factory.createAccount(multiSigFacet.address, initData, salt)
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)
            const multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            const accountBarz = await getFacetBarz("AccountFacet", barz)

            await fund(barzAddr, "1")
            await entryPoint.depositTo(barz.address, {
                value: ethers.utils.parseEther('0.5'),
            })
            const cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("initializeSigner")])
            const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            const funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)

            await expect(multiSigBarz.initializeSigner(initData)).to.be.revertedWithCustomError(multiSigBarz, "LibAppStorage__SignerMustBeUninitialized")
        })
        it("Should revert if owners address length is less than 1 address(20bytes) + 1 threshold(4 bytes)", async () => {
            threshold = "01" // Invalid Threshold -> should be 4 bytes not 1 byte
            initData = addPrefix(threshold + removePrefix(owner1.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.be.reverted
        })
        it("Should revert if owners address is not valid address length", async () => {
            threshold = "00000001"
            initData = addPrefix(threshold + owner1.address.replace("0x", "1111"))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.be.reverted

            threshold = "00000001"
            initData = addPrefix(threshold + removePrefix(owner1.address).substring(0, owner.address.length - 4))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.be.reverted
        })
        it("Should revert if number of owner address is less than wallet threshold", async () => {
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner1.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.be.reverted
        })
        it("Should revert if owner address includes zero address", async () => {
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner1.address) + removePrefix(AddressZero))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.be.reverted
        })
        it("Should revert if owner address includes SENTINEL_OWNERS", async () => {
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner1.address) + removePrefix(AddressOne))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.be.reverted
        })
        it("Should revert if duplicate owner address", async () => {
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner1.address) + removePrefix(owner1.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.be.reverted
        })
        it("Should revert if duplicate invalid threshold", async () => {
            threshold = "00000000"
            initData = addPrefix(threshold + removePrefix(owner1.address) + removePrefix(owner2.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.be.reverted
        })
        it("Should successfully set owner addresses with threshold", async () => {
            const expectedThreshold = 2
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner1.address) + removePrefix(owner2.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)
            const multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            const accountBarz = await getFacetBarz("AccountFacet", barz)

            const cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners")])
            const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            const funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
            expect(await multiSigBarz.getOwners()).to.deep.equal([owner1.address, owner2.address])
            expect(await multiSigBarz.getThreshold()).to.equal(expectedThreshold)
        })
    })
    describe("# splitSignature", () => {
        let chainId: number
        const verificationGasLimit = 1000000
        const callGasLimit = 2000000
        const nonce = 1
        const sampleUserOp = fillUserOpDefaults({
            sender: AddressOne, // Just for a sample
            nonce,
            verificationGasLimit,
            callGasLimit
        })
        beforeEach(async () => {
            chainId = await getChainId()
        })
        it("Should revert if signature length is less than minimum length(address + sig_len)", async () => {
            const signatures = "0x0000000000000000000123123123"

            await expect(multiSigFacet.splitSignatures(signatures, 0)).to.be.revertedWithCustomError(multiSigFacet, "MultiSigFacet__InsufficientSignerLength")
        })
        it("Should revert if invalid signature type", async () => {
            const invalidSignatureType1 = "05"
            const signatureLength = "00000041"
            let signatures = owner1.address + invalidSignatureType1 + signatureLength + removePrefix(signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString())

            await expect(multiSigFacet.splitSignatures(signatures, 0)).to.be.revertedWithCustomError(multiSigFacet, "MultiSigFacet__InvalidSignatureType")

            let invalidSignatureType2 = "00"
            const signature1 = signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString()
            const signature2 = signUserOpK1Curve(sampleUserOp, subOwner, entryPoint.address, chainId).signature.toString()

            signatures = owner.address + invalidSignatureType2 + signatureLength + removePrefix(signature1) + removePrefix(subOwner.address) + invalidSignatureType2 + signatureLength + removePrefix(signature2)
            await expect(multiSigFacet.splitSignatures(signatures, 0)).to.be.revertedWithCustomError(multiSigFacet, "MultiSigFacet__InvalidSignatureType")
            
            invalidSignatureType2 = "04"
            signatures = owner.address + invalidSignatureType2 + signatureLength + removePrefix(signature1) + removePrefix(subOwner.address) + invalidSignatureType2 + signatureLength + removePrefix(signature2)
            await expect(multiSigFacet.splitSignatures(signatures, 0)).to.be.revertedWithCustomError(multiSigFacet, "MultiSigFacet__InvalidSignatureType")

            invalidSignatureType2 = "12"
            signatures = owner.address + invalidSignatureType2 + signatureLength + removePrefix(signature1) + removePrefix(subOwner.address) + invalidSignatureType2 + signatureLength + removePrefix(signature2)
            await expect(multiSigFacet.splitSignatures(signatures, 0)).to.be.revertedWithCustomError(multiSigFacet, "MultiSigFacet__InvalidSignatureType")
        })
        it("Should revert if signature length is not enough for sign_len", async () => {
            const signatureType = "01"
            const signatureLength = "00000100"
            const signatures = owner1.address + signatureType + signatureLength + removePrefix(signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString())

            await expect(multiSigFacet.splitSignatures(signatures, 0)).to.be.revertedWithCustomError(multiSigFacet, "MultiSigFacet__InvalidSignatureLength")
        })
        it("Should return valid owner from signature", async () => {
            const signatureType = "01"
            const signatureLength = "00000041"
            const signatures = owner1.address + signatureType + signatureLength + removePrefix(signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString())

            const splitSignature = await multiSigFacet.splitSignatures(signatures, 0)
            expect(splitSignature.owner_).to.equal(owner1.address)
        })
        it("Should return valid signature from signature", async () => {
            const signatureType = "01"
            const signatureLength = "00000041"
            const signature = signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString()
            const signatures = owner1.address + signatureType + signatureLength + removePrefix(signature)

            const splitSignature = await multiSigFacet.splitSignatures(signatures, 0)
            expect(splitSignature.signature).to.equal(signature)
        })
        it("Should return valid signature type from signature", async () => {
            const signatureType = "02"
            const expectedSignatureType = 2
            const signatureLength = "00000041"
            const signature = signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString()
            const signatures = owner1.address + signatureType + signatureLength + removePrefix(signature)

            const splitSignature = await multiSigFacet.splitSignatures(signatures, 0)
            expect(splitSignature.signatureType).to.equal(expectedSignatureType)
        })
        it("Should return valid next offset", async () => {
            const signatureType = "02"
            const expectedNextOffset = 20 + 1 + 4 + 65
            const signatureLength = "00000041"
            const signature1 = signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString()
            const signature2 = signUserOpK1Curve(sampleUserOp, subOwner, entryPoint.address, chainId).signature.toString()

            const signatures = owner.address + signatureType + signatureLength + removePrefix(signature1) + removePrefix(subOwner.address) + signatureType + signatureLength + removePrefix(signature2)

            let splitSignature = await multiSigFacet.splitSignatures(signatures, 0)
            expect(splitSignature.nextOffset).to.equal(expectedNextOffset)

            splitSignature = await multiSigFacet.splitSignatures(signatures, expectedNextOffset)
            expect(splitSignature.nextOffset).to.equal(0)
        })
    })
    describe("# checkSignatures", () => {
        const VALID_SIG = 0
        const INVALID_SIG = 1
        const verificationGasLimit = 1000000
        const callGasLimit = 2000000
        const nonce = 1
        const sampleUserOp = fillUserOpDefaults({
            sender: AddressOne, // Just for a sample
            nonce,
            verificationGasLimit,
            callGasLimit
        })
        let sampleUserOphash: any
        let chainId: any
        let salt: any
        let Factory: any
        let factory: any
        beforeEach(async () => {
            chainId = await getChainId()
            sampleUserOphash = await getUserOpHash(sampleUserOp, entryPoint.address, chainId)
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
        })
        it("Should revert if invalid signature format", async () => {
            const signatures = "0x0000000000000000000123123123"

            await expect(multiSigFacet.checkSignatures(sampleUserOphash, signatures, 1)).to.be.revertedWithCustomError(multiSigFacet, "MultiSigFacet__InsufficientSignerLength")
        })
        it("Should revert if invalid signature type", async () => {
            const signatureType = "05"
            const signatureLength = "00000041"
            const signatures = owner1.address + signatureType + signatureLength + removePrefix(signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString())

            await expect(multiSigFacet.checkSignatures(sampleUserOphash, signatures, 1)).to.be.revertedWithCustomError(multiSigFacet, "MultiSigFacet__InvalidSignatureType")
        })
        it("Should return invalid_sig if signature validation fail with signature type 1", async () => {
            const signatureType = "01"
            const signatureLength = "00000041"
            const signatures = owner1.address + signatureType + signatureLength + removePrefix(signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString())

            expect(await multiSigFacet.checkSignatures(sampleUserOphash, signatures, 1)).to.equal(INVALID_SIG)
        })
        it("Should return invalid_sig if hash is not approved sign signature type 2", async () => {
            const signatureType = "02"
            const signatureLength = "00000000"
            const signatures = owner1.address + signatureType + signatureLength

            expect(await multiSigFacet.checkSignatures(sampleUserOphash, signatures, 1)).to.equal(INVALID_SIG)
        })
        it("Should return invalid_sig if signature validation fail with signature type 3", async () => {
            const signatureType = "03"
            const signatureLength = "00000000"
            const signatures = owner1.address + signatureType + signatureLength + removePrefix(signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId).signature.toString())

            expect(await multiSigFacet.checkSignatures(sampleUserOphash, signatures, 1)).to.equal(INVALID_SIG)
        })
        it("Should return invalid_sig if duplicate owner address", async () => {
            const threshold = "00000003"
            const initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address) + removePrefix(owner1.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)
            const multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            const accountBarz = await getFacetBarz("AccountFacet", barz)

            const cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("approveHash")])
            const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            const funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)

            const callData = executeCallData(barz.address, 0, funcCallData)

            const signatureType = "03"
            const sampleUserOp = fillUserOpDefaults({
                sender: barzAddr, // Just for a sample
                callData,
                nonce,
                verificationGasLimit,
                callGasLimit
            })
            const userOpHash = await getUserOpHash(sampleUserOp, mockEntryPoint.address, chainId)
            await multiSigBarz.connect(owner1).approveHash(userOpHash)
            const ownerSig = removePrefix(owner.address) + signatureType + "00000041" + removePrefix(signUserOpK1Curve(sampleUserOp, owner, mockEntryPoint.address, chainId).signature.toString())
            const subOwnerSig = removePrefix(subOwner.address) + signatureType + "00000041" + removePrefix(signUserOpK1Curve(sampleUserOp, subOwner, mockEntryPoint.address, chainId).signature.toString())
            const owner1Sig = removePrefix(owner1.address) + "02" + "00000000"
            const ownerAddr = removePrefix(owner.address)
            const subOwnerAddr = removePrefix(subOwner.address)
            const owner1Addr = removePrefix(owner1.address)
            const mapping: Record<string, string> = {
                [ownerAddr]: ownerSig,
                [subOwnerAddr]: subOwnerSig,
                [owner1Addr]: owner1Sig
            };
            // here we put the owner signature twice intentionally to check if the check fails
            let signatures = addPrefix(ownerSig)
            signatures += removePrefix(sortSignatures(mapping))

            expect(await multiSigBarz.checkSignatures(userOpHash, signatures, 3)).to.equal(INVALID_SIG)
        })
        it("Should return valid_sig if validation is successful", async () => {
            const threshold = "00000003"
            const initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address) + removePrefix(owner1.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)
            const multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            const accountBarz = await getFacetBarz("AccountFacet", barz)

            const cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash")])
            const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            const funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)

            const callData = executeCallData(barz.address, 0, funcCallData)

            const signatureType = "03"
            const sampleUserOp = fillUserOpDefaults({
                sender: barzAddr, // Just for a sample
                callData,
                nonce,
                verificationGasLimit,
                callGasLimit
            })
            const userOpHash = await getUserOpHash(sampleUserOp, mockEntryPoint.address, chainId)
            await multiSigBarz.connect(owner1).approveHash(userOpHash)
            const ownerSig = removePrefix(owner.address) + signatureType + "00000041" + removePrefix(signUserOpK1Curve(sampleUserOp, owner, mockEntryPoint.address, chainId).signature.toString())
            const subOwnerSig = removePrefix(subOwner.address) + "03" + "00000041" + removePrefix(signUserOpK1Curve(sampleUserOp, subOwner, mockEntryPoint.address, chainId).signature.toString())
            const owner1Sig = removePrefix(owner1.address) + "02" + "00000000"
            const ownerAddr = removePrefix(owner.address)
            const subOwnerAddr = removePrefix(subOwner.address)
            const owner1Addr = removePrefix(owner1.address)
            const mapping: Record<string, string> = {
                [ownerAddr]: ownerSig,
                [subOwnerAddr]: subOwnerSig,
                [owner1Addr]: owner1Sig
            };
            // Sort the keys in ascending order
            let signatures = sortSignatures(mapping)

            expect(await multiSigBarz.checkSignatures(userOpHash, signatures, 3)).to.equal(VALID_SIG)
        })
    })
    describe("# approveHash", () => {
        let sampleUserOphash: any
        let chainId: any
        let salt: any
        let Factory: any
        let factory: any
        let barzAddr: any
        let barz: any
        let multiSigBarz: MultiSigFacet
        let accountBarz: AccountFacet
        let cut: any
        let diamondCutBarz: DiamondCutFacet
        let funcCallData: any
        const verificationGasLimit = 1000000
        const callGasLimit = 2000000
        const nonce = 1
        const sampleUserOp = fillUserOpDefaults({
            sender: AddressOne, // Just for a sample
            nonce,
            verificationGasLimit,
            callGasLimit
        })
        beforeEach(async () => {
            chainId = await getChainId()
            sampleUserOphash = await getUserOpHash(sampleUserOp, entryPoint.address, chainId)
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)

            const threshold = "00000003"
            const initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address) + removePrefix(owner1.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            barz = await ethers.getContractAt("Barz", barzAddr)
            multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)

            cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash")])
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
        })
        it("Should revert if not owner", async () => {
            await expect(multiSigBarz.connect(user1).approveHash(sampleUserOphash)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__OnlyOwner")
        })
        it("Should approve hash", async () => {
            await expect(multiSigBarz.connect(owner1).approveHash(sampleUserOphash))
            expect(await multiSigBarz.isApprovedHash(owner1.address, sampleUserOphash)).to.be.true
        })
        it("Should emit event", async () => {
            await expect(multiSigBarz.connect(owner1).approveHash(sampleUserOphash)).to.emit(multiSigBarz, "HashApproved").withArgs(sampleUserOphash, owner1.address)
            expect(await multiSigBarz.isApprovedHash(owner1.address, sampleUserOphash)).to.be.true
        })
    })
    describe("# validateOwnerSignature", () => {
        let chainId: any
        let salt: any
        let Factory: any
        let factory: any
        const VALID_SIG = 0
        const verificationGasLimit = 1000000
        const callGasLimit = 2000000
        const nonce = 1
        beforeEach(async () => {
            chainId = await getChainId()
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
        })
        it("Should validate owner signature", async () => {
            const threshold = "00000003"
            const initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address) + removePrefix(owner1.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)
            const multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            const accountBarz = await getFacetBarz("AccountFacet", barz)

            const cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash")])
            const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            const funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)

            const callData = executeCallData(barz.address, 0, funcCallData)

            const signatureType = "03"
            const sampleUserOp = fillUserOpDefaults({
                sender: barzAddr, // Just for a sample
                callData,
                nonce,
                verificationGasLimit,
                callGasLimit
            })
            const userOpHash = await getUserOpHash(sampleUserOp, mockEntryPoint.address, chainId)

            await multiSigBarz.connect(owner1).approveHash(userOpHash)
            const ownerSig = removePrefix(owner.address) + signatureType + "00000041" + removePrefix(signUserOpK1Curve(sampleUserOp, owner, mockEntryPoint.address, chainId).signature.toString())
            const subOwnerSig = removePrefix(subOwner.address) + "03" + "00000041" + removePrefix(signUserOpK1Curve(sampleUserOp, subOwner, mockEntryPoint.address, chainId).signature.toString())
            const owner1Sig = removePrefix(owner1.address) + "02" + "00000000"
            const ownerAddr = removePrefix(owner.address)
            const subOwnerAddr = removePrefix(subOwner.address)
            const owner1Addr = removePrefix(owner1.address)
            const mapping: Record<string, string> = {
                [ownerAddr]: ownerSig,
                [subOwnerAddr]: subOwnerSig,
                [owner1Addr]: owner1Sig
            };
            // Sort the keys in ascending order
            let signatures = sortSignatures(mapping)
            sampleUserOp.signature = signatures

            expect(await multiSigBarz.validateOwnerSignature(sampleUserOp, userOpHash)).to.equal(VALID_SIG)
        })
    })
    describe("# validateOwnerSignatureSelector", () => {
        it("Should return valid selector", async () => {
            expect(await multiSigFacet.validateOwnerSignatureSelector()).to.equal(multiSigFacet.interface.getSighash("validateOwnerSignature"))
        })
    })
    describe("# owner", () => {
        let salt: any
        let Factory: any
        let factory: any
        beforeEach(async () => {
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
        })
        it("Should return owner address concatenated data", async () => {
            const threshold = "00000003"
            const initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address) + removePrefix(owner1.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)
            const multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            const accountBarz = await getFacetBarz("AccountFacet", barz)

            const cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash")])
            const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            const funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)

            expect((await multiSigBarz.owner()).toLowerCase()).to.equal((owner.address + removePrefix(subOwner.address) + removePrefix(owner1.address)).toLowerCase())
        })
        it("Should return owner address concatenated data when single owner", async () => {
            const threshold = "00000001"
            const initData = addPrefix(threshold + removePrefix(owner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)
            const multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            const accountBarz = await getFacetBarz("AccountFacet", barz)

            const cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash")])
            const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            const funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)

            expect((await multiSigBarz.owner()).toLowerCase()).to.equal((owner.address).toLowerCase())
        })
        it("Should return owner address concatenated data when multiple owner", async () => {
            const threshold = "00000001"
            const initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)
            const multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            const accountBarz = await getFacetBarz("AccountFacet", barz)

            const cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash")])
            const diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            const funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)

            expect((await multiSigBarz.owner()).toLowerCase()).to.equal((owner.address + removePrefix(subOwner.address)).toLowerCase())
        })
    })
    describe("# isValidKeyType", async () => {
        it("Should return false if public key length is shorter than address + threshold", async () => {
            const shortPublicKey = "0x1234"
            expect(await multiSigFacet.isValidKeyType(shortPublicKey)).to.be.false
        })
        it("Should return false if public key length is invalid", async () => {
            const invalidPostfix = "bada"
            const invalidPublicKey = "0x00000001" + removePrefix(owner.address) + invalidPostfix
            expect(await multiSigFacet.isValidKeyType(invalidPublicKey)).to.be.false
        })
        it("Should return true if public key length and format is valid", async () => {
            let validPublicKey = "0x00000001" + removePrefix(owner.address)
            expect(await multiSigFacet.isValidKeyType(validPublicKey)).to.be.true

            validPublicKey = "0x00000001" + removePrefix(owner.address) + removePrefix(owner1.address)
            expect(await multiSigFacet.isValidKeyType(validPublicKey)).to.be.true

            validPublicKey = "0x00000001" + removePrefix(owner.address) + removePrefix(owner1.address) + removePrefix(owner2.address)
            expect(await multiSigFacet.isValidKeyType(validPublicKey)).to.be.true
        })
    })
    describe("# isValidSignature", () => {
        let chainId: any
        let salt: any
        let Factory: any
        let factory: any
        let barzAddr: string
        let barz: Barz
        let multiSigBarz: MultiSigFacet
        let accountBarz: AccountFacet
        let cut: any
        let funcCallData: any
        let threshold: any
        let initData: any
        const verificationGasLimit = 1000000
        const callGasLimit = 2000000
        const nonce = 1
        beforeEach(async () => {
            chainId = await getChainId()
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            barz = await ethers.getContractAt("Barz", barzAddr)
            multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)

            cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures")])
            funcCallData = diamondCutFacet.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
        })
        it("Should return non-magic value when signature is invalid", async () => {
            const callData = executeCallData(barz.address, 0, funcCallData)
            const signatureType = "03"
            const signatureLength = "00000041"
            const sampleUserOp = fillUserOpDefaults({
                sender: barzAddr, // Just for a sample
                callData,
                nonce,
                verificationGasLimit,
                callGasLimit
            })
            const invalidChainId = 6666666
            const userOpHash = await getUserOpHash(sampleUserOp, entryPoint.address, invalidChainId) // Signs with an invalid ChainID so wrong signature
            const ownerSig = signUserOpK1Curve(sampleUserOp, owner, entryPoint.address, chainId)
            const subOwnerSig = signUserOpK1Curve(sampleUserOp, subOwner, entryPoint.address, chainId)
            const ownerSignature = removePrefix(owner.address) + signatureType + signatureLength + removePrefix(ownerSig.signature.toString())
            const subOwnerSignature = removePrefix(subOwner.address) + signatureType + signatureLength + removePrefix(subOwnerSig.signature.toString())
            const ownerAddr = owner.address
            const subOwnerAddr = subOwner.address
            const mapping: Record<string, string> = {
                [ownerAddr]: ownerSignature,
                [subOwnerAddr]: subOwnerSignature
            };
            // Sort the keys in ascending order
            let signatures = sortSignatures(mapping)

            expect(await multiSigBarz.isValidSignature(userOpHash, signatures)).to.equal("0xffffffff")
        })
        it("Should return valid value when signature is valid", async () => {
            const callData = executeCallData(barz.address, 0, funcCallData)
            const signatureType = "01"
            const signatureLength = "00000041"
            const sampleUserOp = fillUserOpDefaults({
                sender: barzAddr, // Just for a sample
                callData,
                nonce,
                verificationGasLimit,
                callGasLimit
            })
            const userOpHash = await getUserOpHash(sampleUserOp, entryPoint.address, chainId)

            const finalHash = await getMessageHash(userOpHash, await getChainId(), multiSigBarz.address)

            const oSig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))
            const ownerSig = toRpcSig(oSig.v, oSig.r, oSig.s)
    
            const sSig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(subOwner.privateKey)))
            const subOwnerSig = toRpcSig(sSig.v, sSig.r, sSig.s)

            const ownerSignature = removePrefix(owner.address) + signatureType + signatureLength + removePrefix(ownerSig.toString())
            const subOwnerSignature = removePrefix(subOwner.address) + signatureType + signatureLength + removePrefix(subOwnerSig.toString())
            const ownerAddr = owner.address
            const subOwnerAddr = subOwner.address
            const mapping: Record<string, string> = {
                [ownerAddr]: ownerSignature,
                [subOwnerAddr]: subOwnerSignature
            };

            // Sort the keys in ascending order
            let signatures = sortSignatures(mapping)

            expect(await multiSigBarz.isValidSignature(userOpHash, signatures)).to.equal("0x1626ba7e")
        })
    })
    describe("# addOwner", () => {
        let salt: any
        let Factory: any
        let factory: any
        let barzAddr: string
        let barz: Barz
        let multiSigBarz: MultiSigFacet
        let accountBarz: AccountFacet
        let cut: any
        let diamondCutBarz: DiamondCutFacet
        let funcCallData: any
        let threshold: any
        let initData: any
        beforeEach(async () => {
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            barz = await ethers.getContractAt("Barz", barzAddr)
            multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)

            cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash"), multiSigBarz.interface.getSighash("addOwner")])
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
        })
        it("Should revert if new owner is already owner", async () => {
            const addOwnerCallData = multiSigFacet.interface.encodeFunctionData("addOwner", [owner.address, 3])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, addOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__DuplicateOwner")
        })
        it("Should revert if new owner is zero address", async () => {
            const addOwnerCallData = multiSigFacet.interface.encodeFunctionData("addOwner", [AddressZero, 3])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, addOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if new owner is SENTINEL_OWNERS", async () => {
            const addOwnerCallData = multiSigFacet.interface.encodeFunctionData("addOwner", [AddressOne, 3])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, addOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if new owner is address of Barz", async () => {
            const addOwnerCallData = multiSigFacet.interface.encodeFunctionData("addOwner", [multiSigBarz.address, 3])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, addOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should add owner and emit event", async () => {
            const addOwnerCallData = multiSigFacet.interface.encodeFunctionData("addOwner", [owner2.address, 3])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, addOwnerCallData)).to.emit(multiSigBarz, "OwnerAdded").withArgs(owner2.address)
        })
    })
    describe("# removeOwner", () => {
        let salt: any
        let Factory: any
        let factory: any
        let barzAddr: string
        let barz: Barz
        let multiSigBarz: MultiSigFacet
        let accountBarz: AccountFacet
        let cut: any
        let diamondCutBarz: DiamondCutFacet
        let funcCallData: any
        let threshold: any
        let initData: any
        beforeEach(async () => {
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)

            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            barz = await ethers.getContractAt("Barz", barzAddr)
            multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)

            cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("checkSignatures"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash"), multiSigBarz.interface.getSighash("removeOwner")])
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
        })
        it("Should revert if owner count is less than new threshold", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("removeOwner", [owner.address, subOwner.address, 2])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidThreshold")
        })
        it("Should revert if removed owner is zero address", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("removeOwner", [owner.address, AddressZero, 1])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if removed owner is SENTINEL_OWNERS", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("removeOwner", [owner.address, AddressOne, 1])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if linkedlist if incorrect", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("removeOwner", [owner.address, owner2.address, 1])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerPair")
        })
        it("Should remove owner and emit event", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("removeOwner", [owner.address, subOwner.address, 1])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.emit(multiSigBarz, "OwnerRemoved").withArgs(subOwner.address)

            expect(await multiSigBarz.getThreshold()).to.equal(1)
        })
    })
    describe("# swapOwner", () => {
        let salt: any
        let Factory: any
        let factory: any
        let threshold: string
        let initData: string
        let barzAddr: string
        let barz: Barz
        let multiSigBarz: MultiSigFacet
        let accountBarz: AccountFacet
        let cut: any
        let diamondCutBarz: DiamondCutFacet
        let funcCallData: any
        beforeEach(async () => {
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            barz = await ethers.getContractAt("Barz", barzAddr)
            multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)
            cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("swapOwner"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash"), multiSigBarz.interface.getSighash("removeOwner")])
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
        })
        it("Should revert if new owner is zero address", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("swapOwner", [owner.address, subOwner.address, AddressZero])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if new owner is SENTINEL_OWNERS", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("swapOwner", [owner.address, subOwner.address, AddressOne])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if new owner is address of Barz", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("swapOwner", [owner.address, subOwner.address, multiSigBarz.address])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if removed owner is zero address", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("swapOwner", [owner.address, AddressZero, multiSigBarz.address])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if removed owner is SENTINEL_OWNERS", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("swapOwner", [owner.address, AddressOne, multiSigBarz.address])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerAddress")
        })
        it("Should revert if linkedlist if incorrect", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("swapOwner", [AddressZero, subOwner.address, owner2.address])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidOwnerPair")
        })
        it("Should swap owner and emit event", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("swapOwner", [owner.address, subOwner.address, owner2.address])

            const tx = await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)
            await expect(tx).to.emit(multiSigBarz, "OwnerRemoved").withArgs(subOwner.address)
            await expect(tx).to.emit(multiSigBarz, "OwnerAdded").withArgs(owner2.address)
        })
        it("Should swap owner and emit event even when owner is first element in the list", async () => {
            const removeOwnerCallData = multiSigFacet.interface.encodeFunctionData("swapOwner", [AddressOne, owner.address, owner2.address])

            const tx = await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, removeOwnerCallData)
            await expect(tx).to.emit(multiSigBarz, "OwnerRemoved").withArgs(owner.address)
            await expect(tx).to.emit(multiSigBarz, "OwnerAdded").withArgs(owner2.address)
        })
    })
    describe("# changeThreshold", () => {
        let salt: any
        let Factory: any
        let factory: any
        let barzAddr: any
        let barz: any
        let multiSigBarz: any
        let accountBarz: any
        let diamondCutBarz: any
        let cut: any
        let funcCallData: any
        beforeEach(async () => {
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)

            const threshold = "00000002"
            const initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            barz = await ethers.getContractAt("Barz", barzAddr)
            multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)

            cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("changeThreshold"), multiSigBarz.interface.getSighash("getThreshold"), multiSigBarz.interface.getSighash("getOwners"), multiSigBarz.interface.getSighash("approveHash"), multiSigBarz.interface.getSighash("isApprovedHash"), multiSigBarz.interface.getSighash("removeOwner")])
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
        })
        it("Should revert if new threshold is zero", async () => {
            const changeThresholdCallData = multiSigFacet.interface.encodeFunctionData("changeThreshold", [0])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, changeThresholdCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidThreshold")
        })
        it("Should revert if new threshold is bigger than number of owners", async () => {
            const changeThresholdCallData = multiSigFacet.interface.encodeFunctionData("changeThreshold", [5])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, changeThresholdCallData)).to.be.revertedWithCustomError(multiSigBarz, "MultiSigFacet__InvalidThreshold")
        })
        it("Should change threshold", async () => {
            const newThreshold = 1
            const changeThresholdCallData = multiSigFacet.interface.encodeFunctionData("changeThreshold", [newThreshold])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, changeThresholdCallData)

            expect(await multiSigBarz.getThreshold()).to.equal(newThreshold)
        })
        it("Should emit event", async () => {
            const newThreshold = 1
            const changeThresholdCallData = multiSigFacet.interface.encodeFunctionData("changeThreshold", [newThreshold])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, changeThresholdCallData)).to.emit(multiSigBarz, "ThresholdChanged").withArgs(newThreshold)
        })
    })
    describe("# isOwner", () => {
        let salt: any
        let Factory: any
        let factory: any
        let threshold: any
        let initData: any
        let barzAddr: any
        let barz: Barz
        let multiSigBarz: MultiSigFacet
        let accountBarz: AccountFacet
        let cut: any
        let diamondCutBarz: DiamondCutFacet
        let funcCallData: any
        beforeEach(async () => {
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            barz = await ethers.getContractAt("Barz", barzAddr)
            multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)

            cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("isOwner")])
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
        })
        it("Should return true if owner", async () => {
            expect(await multiSigBarz.isOwner(owner.address)).to.be.true
            expect(await multiSigBarz.isOwner(subOwner.address)).to.be.true

        })
        it("Should return false if not owner", async () => {
            expect(await multiSigBarz.isOwner(owner1.address)).to.be.false
            expect(await multiSigBarz.isOwner(owner2.address)).to.be.false
        })
    })
    describe("# getPrevOwner", () => {
        let salt: any
        let Factory: any
        let factory: any
        let threshold: any
        let initData: any
        let barzAddr: any
        let barz: Barz
        let multiSigBarz: MultiSigFacet
        let accountBarz: AccountFacet
        let cut: any
        let diamondCutBarz: DiamondCutFacet
        let funcCallData: any
        beforeEach(async () => {
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, mockEntryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
            threshold = "00000002"
            initData = addPrefix(threshold + removePrefix(owner.address) + removePrefix(subOwner.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            barz = await ethers.getContractAt("Barz", barzAddr)
            multiSigBarz = await getFacetBarz("MultiSigFacet", barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)

            cut = diamondCut(multiSigFacet.address, FacetCutAction.Add, [multiSigBarz.interface.getSighash("getPrevOwner")])
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            funcCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])

            await accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, funcCallData)
        })
        it("Should return valid prev owner", async () => {
            expect(await multiSigBarz.getPrevOwner(subOwner.address)).to.equal(owner.address)
        })
        it("Should return SENTINEL_OWNER when first owner", async () => {
            expect(await multiSigBarz.getPrevOwner(owner.address)).to.equal(AddressOne)
        })
        it("Should return zero address when non-existent owner", async () => {
            expect(await multiSigBarz.getPrevOwner(facetRegistryOwner.address)).to.equal(AddressZero)
        })
    })
    describe("Functionality Test", () => {
        let chainId: any
        let salt: any
        let Factory: any
        let factory: any
        const verificationGasLimit = 1000000
        const callGasLimit = 2000000
        const nonce = 0
        beforeEach(async () => {
            chainId = await getChainId()
            salt = "0"
            Factory = await ethers.getContractFactory("BarzFactory")
            factory = await Factory.deploy(accountFacet.address, entryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
        })
        it("Should send ERC20 Token from Multi-sig account", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()

            const multiSigOwner1 = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            const multiSigOwner2 = await barzFixture(accountFacet, r1Facet, entryPoint, facetRegistry, defaultFallbackHandler, publicKeyBytes)
            const multiSigOwner3 = subOwner
            // 0. Deploy Barz - 1 Passkeys, approvehash, ECDSA
            const threshold = "00000003"
            const initData = addPrefix(threshold + removePrefix(multiSigOwner1.address) + removePrefix(multiSigOwner2.address) + removePrefix(multiSigOwner3.address))
            await expect(factory.createAccount(multiSigFacet.address, initData, salt)).to.not.be.reverted
            const barzAddr = await factory.getAddress(multiSigFacet.address, initData, salt)
            const barz = await ethers.getContractAt("Barz", barzAddr)

            // 1. Deploy & mint token
            const mintAmount = 100000
            const transferAmount = 1000
            const testToken = await testTokenFixture()
            await testToken.mint(barz.address, mintAmount)

            // 2. SendERC20 token owner 2 address
            const funcCallData = testToken.interface.encodeFunctionData("transfer", [user1.address, transferAmount])
            const callData = executeCallData(testToken.address, 0, funcCallData)

            const userOp = fillUserOpDefaults({
                sender: barz.address,
                callData,
                nonce,
                verificationGasLimit,
                callGasLimit
            })
            const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)
            const finalHash = await getMessageHash(userOpHash, await getChainId(), multiSigOwner1.address) // NOTE: This is not address of Multi-sig Barz, but address of owner1 barz

            const oSig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))
            const ownerSig = toRpcSig(oSig.v, oSig.r, oSig.s)

            const owner2Sig = signMsgOnR1Curve(userOpHash, keyPair)
            const owner2UserOperationSignatureLength = (owner2Sig.toString().length - 2) / 2
            const paddedHexLength = owner2UserOperationSignatureLength.toString(16).padStart(8, '0')

            const signedMessage1 = await subOwner.signMessage(arrayify(userOpHash))

            const owner1Signature = removePrefix(multiSigOwner1.address) + "01" + "00000041" + removePrefix(ownerSig.toString())
            const owner2Signature = removePrefix(multiSigOwner2.address) + "01" + paddedHexLength + removePrefix(owner2Sig.toString())
            const owner3Signature = removePrefix(multiSigOwner3.address) + "03" + "00000041" + removePrefix(signedMessage1.toString())

            const multiSigOwner1Addr = removePrefix(multiSigOwner1.address)
            const multiSigOwner2Addr = removePrefix(multiSigOwner2.address)
            const multiSigOwner3Addr = removePrefix(multiSigOwner3.address)

            const mapping: Record<string, string> = {
                [multiSigOwner1Addr]: owner1Signature,
                [multiSigOwner2Addr]: owner2Signature,
                [multiSigOwner3Addr]: owner3Signature
            };

            let signatures = sortSignatures(mapping)

            userOp.signature = signatures
            expect(await testToken.balanceOf(barz.address)).to.equal(mintAmount)
            expect(await testToken.balanceOf(user1.address)).to.equal(0)

            await entryPoint.handleOps([userOp], user1.address)
            expect(await testToken.balanceOf(user1.address)).to.equal(transferAmount)
        })
    })
})