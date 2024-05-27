import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, SignatureMigrationFacet, Secp256k1VerificationFacet, Secp256r1VerificationFacet, SecurityManager, FacetRegistry, DiamondLoupeFacet, GuardianFacet, TokenReceiverFacet, DefaultFallbackHandler, MultiSigFacet } from '../typechain-types'
import { fillUserOpDefaults, signMsgOnR1Curve, getUserOpHash, signUserOpK1Curve, signUserOpR1Curve, executeCallData, callFromEntryPointOnK1, callFromEntryPointOnR1 } from './utils/UserOp'
import { getEthSignMessageHash, getBlockTimestamp, getChainId, diamondCut, guardianSecurityPeriod, approvalValidationPeriod, migrationPeriod, increaseBlockTime, generateKeyPair } from './utils/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { createAccountOwner, fund, callGasLimit, verificationGasLimit, maxFeePerGas, AddressZero, getMessageHash, removePrefix, sortSignatures } from './utils/testutils'

const {
    FacetCutAction,
    getSelectors
} = require('./utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { secp256r1VerificationFacetFixture } from './fixtures/Secp256r1VerificationFacetFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { signatureMigrationFacetFixture } from './fixtures/SignatureMigrationFacetFixture'
import { addFacetSelectors, addFacetSelectorsViaEntryPointOnK1, addFacetSelectorsViaEntryPointOnR1, getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { guardianFacetFixture } from './fixtures/GuardianFacetFixture'
import { keccak256 } from '@ethersproject/keccak256'
import { BytesLike, arrayify } from 'ethers/lib/utils'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'
import { multiSigFacetFixture } from './fixtures/MultiSigFacetFixture'
import { ecsign, toRpcSig } from 'ethereumjs-util'

describe('Signature Migration Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let diamondCutBarz: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let accountFacet: AccountFacet
    let accountBarz: AccountFacet
    let mockAccountBarz: AccountFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let k1Facet: Secp256k1VerificationFacet
    let r1Facet: Secp256r1VerificationFacet
    let multiSigFacet: MultiSigFacet
    let unregisteredR1Facet: Secp256r1VerificationFacet
    let migrationFacet: SignatureMigrationFacet
    let migrationBarz: SignatureMigrationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let guardianFacet: GuardianFacet
    let guardianBarz: GuardianFacet
    let entryPoint: EntryPoint
    let user1: SignerWithAddress
    let guardian1: Wallet
    let guardian2: SignerWithAddress
    let guardian3: SignerWithAddress
    let mockEntryPoint: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let mockBarz: Barz
    let mockMigrationBarz: SignatureMigrationFacet
    let owner: Wallet
    let subOwner: Wallet
    let barz: Barz
    let chainId: number
    const migrationNonce = 0
    let ownerSeed = 0
    let migrationFacetSelectors: any
    let guardianFacetSelectors: any
    let encodedFuncSelectors: any
    let encodedFuncSelectorsHash: any

    before(async () => {
        [user1, mockEntryPoint, guardian2, guardian3, securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        owner = createAccountOwner(ownerSeed++)
        guardian1 = createAccountOwner(ownerSeed++)
        subOwner = createAccountOwner(ownerSeed++)
        await fund(owner.address)
        await fund(guardian1.address)

        chainId = await getChainId()
        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        r1Facet = await secp256r1VerificationFacetFixture()
        multiSigFacet = await multiSigFacetFixture()
        unregisteredR1Facet = await secp256r1VerificationFacetFixture()
        guardianFacet = await guardianFacetFixture(securityManager)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        migrationFacet = await signatureMigrationFacetFixture(securityManager)
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        entryPoint = await entryPointFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        migrationFacetSelectors = getSelectors(migrationFacet).filter((item: string) => item !== migrationFacet.interface.getSighash('securityManager'))
        guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== guardianFacet.interface.getSighash('securityManager'))


        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(migrationFacet.address, getSelectors(migrationFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(multiSigFacet.address, getSelectors(multiSigFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))

        encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
        encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
    })

    beforeEach(async () => {
        mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        mockAccountBarz = await getFacetBarz('AccountFacet', mockBarz)
        mockMigrationBarz = await getFacetBarz("SignatureMigrationFacet", mockBarz)
        await addFacetSelectors(mockBarz, migrationFacet, migrationFacetSelectors, mockEntryPoint)
        await addFacetSelectors(mockBarz, guardianFacet, guardianFacet, mockEntryPoint)
    })

    const setupBarz = async (verificationFacet: any, ownerPublicKey: any) => {
        barz = await barzFixture(accountFacet, verificationFacet, entryPoint, facetRegistry, defaultFallbackHandler, ownerPublicKey)
        diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
        migrationBarz = await getFacetBarz('SignatureMigrationFacet', barz)
        accountBarz = await getFacetBarz('AccountFacet', barz)
        guardianBarz = await getFacetBarz('GuardianFacet', barz)

        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
    }

    const addFacetsK1 = async () => {
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, k1Facet, [k1Facet.interface.getSighash('isValidKeyType'), k1Facet.interface.getSighash('initializeSigner'), k1Facet.interface.getSighash('uninitializeSigner')], entryPoint)
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, migrationFacet, migrationFacetSelectors, entryPoint)
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)
    }

    const addFacetsR1 = async (keyPair: any) => {
        await addFacetSelectorsViaEntryPointOnR1(barz, keyPair, r1Facet, [r1Facet.interface.getSighash('isValidKeyType'), r1Facet.interface.getSighash('initializeSigner'), r1Facet.interface.getSighash('uninitializeSigner')], entryPoint)
        await addFacetSelectorsViaEntryPointOnR1(barz, keyPair, migrationFacet, migrationFacetSelectors, entryPoint)
        await addFacetSelectorsViaEntryPointOnR1(barz, keyPair, guardianFacet, guardianFacetSelectors, entryPoint)
    }

    const addGuardian = async (newGuardian: any) => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [newGuardian.address])
        const addGuardianCallData = executeCallData(barz.address, 0, addGuardianCall)
        await callFromEntryPointOnK1(entryPoint, barz.address, owner, addGuardianCallData)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(guardianBarz.confirmGuardianAddition(newGuardian.address)).to.emit(guardianBarz, "GuardianAdded")
        expect(await guardianBarz.isGuardian(newGuardian.address)).to.be.true
    }

    const addGuardianMock = async (_newGuardian: any, _guardianBarz: any, _accountBarz: any) => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [_newGuardian.address])
        await _accountBarz.connect(mockEntryPoint).execute(_accountBarz.address, 0, addGuardianCall)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(_guardianBarz.confirmGuardianAddition(_newGuardian.address)).to.emit(_guardianBarz, "GuardianAdded")
    }

    const getSignedMigrationHash = async (facet: any, publicKeyBytes: BytesLike, migrationBarz: SignatureMigrationFacet, migrationNonce: number) => {
        const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(facet)])
        const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
        const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, await getChainId(), migrationNonce])
        return keccak256(encodedData)
    }

    it('Should change signature scheme from k1 to r1', async () => {
        // 1. Deploy SignatureMigrationFacet 
        // 2. Add migrateSignatureScheme() to diamondCut
        // 3. Init with new public key
        // 4. Check new public key
        // 5. Sign UserOperation with new r1 scheme
        // 6. Verify if it works through validateUserOp
        const { keyPair, publicKeyBytes, facetOwnerKey } = generateKeyPair()

        await setupBarz(k1Facet, owner.publicKey)
        await addFacetsK1()

        const migrateSignatureCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])

        const timestamp = await getBlockTimestamp()
        const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
        await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, "SignatureMigrationExecuted").withArgs(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), timestamp + migrationPeriod + 1)

        await increaseBlockTime(migrationPeriod)
        const finalizeMigrateSignatureCall = migrationBarz.interface.encodeFunctionData("finalizeSignatureMigration")

        const finalizeMigrateSignatureCallData = executeCallData(migrationBarz.address, 0, finalizeMigrateSignatureCall)
        await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, finalizeMigrateSignatureCallData)).to.emit(migrationBarz, 'SignatureSchemeMigration')

        const diamondR1Facet = await getFacetBarz("Secp256r1VerificationFacet", barz)
        const newOwner = await diamondR1Facet.owner()

        expect(newOwner).to.equal(facetOwnerKey)
        const userOp = signUserOpR1Curve(fillUserOpDefaults({
            sender: barz.address,
            callGasLimit: 5000000,
            verificationGasLimit: 5000000,
            maxFeePerGas,
            nonce: await accountBarz.getNonce()
        }), keyPair, entryPoint.address, chainId)
        const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

        await expect(entryPoint.handleOps([userOp], facetRegistryOwner.address)).to.emit(accountBarz, "VerificationSuccess").withArgs(userOpHash)
    })
    it('Should change signature scheme from r1 to k1', async () => {
        // 1. Deploy SignatureMigrationFacet 
        // 2. Add migrateSignatureScheme() to diamondCut
        // 3. Init with new public key
        // 4. Check new public key
        // 5. Sign UserOperation with new r1 scheme
        // 6. Verify if it works through validateUserOp
        const { keyPair, publicKeyBytes } = generateKeyPair()

        await setupBarz(r1Facet, publicKeyBytes)
        await addFacetsR1(keyPair)

        const migrateSignatureCall = migrationFacet.interface.encodeFunctionData("migrateSignatureScheme", [k1Facet.address, owner.publicKey, getSelectors(k1Facet)])

        const timestamp = await getBlockTimestamp()

        const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
        await expect(callFromEntryPointOnR1(entryPoint, barz.address, keyPair, migrateSignatureCallData)).to.emit(migrationBarz, "SignatureMigrationExecuted").withArgs(k1Facet.address, owner.publicKey.toLowerCase(), getSelectors(k1Facet), timestamp + migrationPeriod + 1)
        await increaseBlockTime(migrationPeriod)

        const finalizeMigrateSignatureCall = migrationBarz.interface.encodeFunctionData("finalizeSignatureMigration")
        const finalizeMigrateSignatureCallData = executeCallData(migrationBarz.address, 0, finalizeMigrateSignatureCall)
        await expect(callFromEntryPointOnR1(entryPoint, barz.address, keyPair, finalizeMigrateSignatureCallData)).to.emit(migrationBarz, 'SignatureSchemeMigration')

        const diamondK1Barz = await getFacetBarz("Secp256k1VerificationFacet", barz)
        const newOwner = await diamondK1Barz.owner()
        expect(newOwner.toLowerCase()).to.equal(owner.address.toLowerCase())
        const userOp = signUserOpK1Curve(fillUserOpDefaults({
            sender: barz.address,
            nonce: await accountBarz.getNonce(),
            callGasLimit,
            verificationGasLimit,
            maxFeePerGas,
        }), owner, entryPoint.address, chainId)
        const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

        expect(await entryPoint.handleOps([userOp], barz.address)).to.emit(accountBarz, "VerificationSuccess").withArgs([userOpHash])
    })
    it("Should migrate signature scheme from k1 to multi-sig", async () => {
        await setupBarz(k1Facet, owner.publicKey)
        await addFacetsK1()

        const threshold = "00000002"
        const signatureType = "03"
        const signatureLength = "00000041"
        const initData = "0x" + threshold + removePrefix(owner.address) + removePrefix(subOwner.address)
        const migrateSignatureCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [multiSigFacet.address, initData, getSelectors(multiSigFacet)])

        const timestamp = await getBlockTimestamp()
        const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
        await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, "SignatureMigrationExecuted").withArgs(multiSigFacet.address, initData.toLowerCase(), getSelectors(multiSigFacet), timestamp + migrationPeriod + 1)

        await increaseBlockTime(migrationPeriod)
        const finalizeMigrateSignatureCall = migrationBarz.interface.encodeFunctionData("finalizeSignatureMigration")


        const finalizeMigrateSignatureCallData = executeCallData(migrationBarz.address, 0, finalizeMigrateSignatureCall)
        await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, finalizeMigrateSignatureCallData)).to.emit(migrationBarz, 'SignatureSchemeMigration')


        const userOp = fillUserOpDefaults({
            sender: barz.address,
            nonce: await accountBarz.getNonce(),
            verificationGasLimit,
            callGasLimit
        })
        const ownerUserOperation = signUserOpK1Curve(userOp, owner, entryPoint.address, chainId)
        const subOwnerUserOperation = signUserOpK1Curve(userOp, subOwner, entryPoint.address, chainId)

        const ownerSignature = removePrefix(owner.address) + signatureType + signatureLength + removePrefix(ownerUserOperation.signature.toString())
        const subOwnerSignature = removePrefix(subOwner.address) + signatureType + signatureLength + removePrefix(subOwnerUserOperation.signature.toString())
        
        const ownerAddr = owner.address
        const subOwnerAddr = subOwner.address

        interface SignatureInfo {
            address: string;
            signature: string;
        }

        const signatureInfo: SignatureInfo[] = [
            { address: ownerAddr, signature: ownerSignature },
            { address: subOwnerAddr, signature: subOwnerSignature },
        ];

        signatureInfo.sort((a, b) => a.address.localeCompare(b.address));

        let concatenatedSignatures: any
        for (let i = 0; i < signatureInfo.length; i++) {
            concatenatedSignatures += signatureInfo[i].signature
        }
        userOp.signature = "0x" + concatenatedSignatures.replace("undefined", "")
        await expect(entryPoint.handleOps([userOp], user1.address)).to.emit(accountBarz, "VerificationSuccess")
    })
    it("Should migrate signature scheme from multi-sig to k1", async () => {
        const ownerAddr = owner.address
        const subOwnerAddr = subOwner.address

        const threshold = "00000002"
        const signatureType = "03"
        const signatureLength = "00000041"
        const initData = "0x" + threshold + removePrefix(owner.address) + removePrefix(subOwner.address)

        await setupBarz(multiSigFacet, initData)

        // 1---- Diamond Cut
        const cut = diamondCut(migrationFacet.address, FacetCutAction.Add, getSelectors(migrationFacet))
        const cutCallData = diamondCutBarz.interface.encodeFunctionData("diamondCut", [cut, AddressZero, "0x00"])
        const cutExecuteCallData = executeCallData(migrationBarz.address, 0, cutCallData)

        const cutUserOp = fillUserOpDefaults({
            sender: barz.address,
            callData: cutExecuteCallData,
            nonce: await accountBarz.getNonce(),
            verificationGasLimit,
            callGasLimit
        })
        const cutOwnerUserOperation = signUserOpK1Curve(cutUserOp, owner, entryPoint.address, chainId)
        const cutSubOwnerUserOperation = signUserOpK1Curve(cutUserOp, subOwner, entryPoint.address, chainId)

        const cutOwnerSignature = removePrefix(owner.address) + signatureType + signatureLength + removePrefix(cutOwnerUserOperation.signature.toString())
        const cutSubOwnerSignature = removePrefix(subOwner.address) + signatureType + signatureLength + removePrefix(cutSubOwnerUserOperation.signature.toString())

        const sigMapping: Record<string, string> = {
            [ownerAddr]: cutOwnerSignature,
            [subOwnerAddr]: cutSubOwnerSignature,
        };

        const cutConcatenatedSignatures = sortSignatures(sigMapping)

        cutUserOp.signature = cutConcatenatedSignatures
        await expect(entryPoint.handleOps([cutUserOp], user1.address)).to.emit(diamondCutBarz, "DiamondCut")

        // 2---- Migrate Signature Scheme
        const migrateSignatureCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [k1Facet.address, owner.publicKey, getSelectors(k1Facet)])

        const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)

        const userOp = fillUserOpDefaults({
            sender: barz.address,
            callData: migrateSignatureCallData,
            nonce: await accountBarz.getNonce(),
            verificationGasLimit,
            callGasLimit
        })
        const ownerUserOperation = signUserOpK1Curve(userOp, owner, entryPoint.address, chainId)
        const subOwnerUserOperation = signUserOpK1Curve(userOp, subOwner, entryPoint.address, chainId)

        const ownerSignature = removePrefix(owner.address) + signatureType + signatureLength + removePrefix(ownerUserOperation.signature.toString())
        const subOwnerSignature = removePrefix(subOwner.address) + signatureType + signatureLength + removePrefix(subOwnerUserOperation.signature.toString())

        const signatureInfo: SignatureInfo[] = [
            { address: ownerAddr, signature: ownerSignature },
            { address: subOwnerAddr, signature: subOwnerSignature },
        ];

        signatureInfo.sort((a, b) => a.address.localeCompare(b.address));

        let concatenatedSignatures: any
        for (let i = 0; i < signatureInfo.length; i++) {
            concatenatedSignatures += signatureInfo[i].signature
        }
        userOp.signature = "0x" + concatenatedSignatures.replace("undefined", "")
        await expect(entryPoint.handleOps([userOp], user1.address)).to.emit(migrationBarz, "SignatureMigrationExecuted")


        // 3---- Finalize Signature Migration
        await increaseBlockTime(migrationPeriod)
        const finalizeMigrateSignatureCall = migrationBarz.interface.encodeFunctionData("finalizeSignatureMigration")

        const finalizeMigrateSignatureCallData = executeCallData(migrationBarz.address, 0, finalizeMigrateSignatureCall)
        const finalizeUserOp = fillUserOpDefaults({
            sender: barz.address,
            callData: finalizeMigrateSignatureCallData,
            nonce: await accountBarz.getNonce(),
            verificationGasLimit,
            callGasLimit
        })
        const finalizeOwnerUserOperation = signUserOpK1Curve(finalizeUserOp, owner, entryPoint.address, chainId)
        const finalizeSubOwnerUserOperation = signUserOpK1Curve(finalizeUserOp, subOwner, entryPoint.address, chainId)

        const finalizeOwnerSignature = removePrefix(owner.address) + signatureType + signatureLength + removePrefix(finalizeOwnerUserOperation.signature.toString())
        const finalizeSubOwnerSignature = removePrefix(subOwner.address) + signatureType + signatureLength + removePrefix(finalizeSubOwnerUserOperation.signature.toString())

        const mapping: Record<string, string> = {
            [ownerAddr]: finalizeOwnerSignature,
            [subOwnerAddr]: finalizeSubOwnerSignature,
        };

        finalizeUserOp.signature = sortSignatures(mapping)
        await expect(entryPoint.handleOps([finalizeUserOp], user1.address)).to.emit(migrationBarz, 'SignatureSchemeMigration')

        await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)

    })
    describe('# migrateSignatureScheme', () => {
        it('Should revert if not caller is not owner', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await expect(migrationBarz.connect(user1).migrateSignatureScheme(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.be.revertedWith("LibDiamond: Caller not self")

            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, "SignatureMigrationExecuted")
        })
        it('Should revert if new public key length is not valid', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()

            await expect(migrationBarz.migrateSignatureScheme(r1Facet.address, publicKeyBytes + "000000", getSelectors(r1Facet))).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InvalidKeyType")
        })
        it('Should revert if guardian exists', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()

            await addGuardian(guardian1)
            await addGuardian(guardian2)

            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.not.emit(migrationBarz, "SignatureMigrationExecuted")
            await addGuardianMock(guardian1, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, migrateSignatureCall)).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InvalidRouteWithGuardian")
        })
        it('Should emit Migration Execution event', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()

            const currentTimestamp = await getBlockTimestamp()
            const expectedTimestamp = currentTimestamp + migrationPeriod + 1
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, "SignatureMigrationExecuted").withArgs(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), expectedTimestamp)
        })
        it('Should increment migration nonce', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.not.reverted
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)
        })
        it('Should revert if new verification facet is unregistered to facet registry', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            const { publicKeyBytes } = generateKeyPair()

            const migrateSignatureCall = migrationFacet.interface.encodeFunctionData('migrateSignatureScheme', [unregisteredR1Facet.address, publicKeyBytes, getSelectors(unregisteredR1Facet)])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, migrateSignatureCall)).to.revertedWithCustomError(mockMigrationBarz, "UnregisteredFacetAndSelectors")
        })
    })
    describe('# migrateSignatureSchemeWithGuardian', () => {
        it('Should revert if new public key length is not valid', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const invalidPublicKeyBytes = publicKeyBytes + "1111"
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [invalidPublicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const guardianSignature = await guardian1.signMessage(arrayify(hash))
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, invalidPublicKeyBytes, getSelectors(r1Facet), [guardian1.address], [guardianSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.not.emit(migrationBarz, 'SignatureMigrationExecuted')

            const mockEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [invalidPublicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', mockMigrationBarz.address, chainId, migrationNonce])
            const mockHash = keccak256(mockEncodedData)
            const mockGuardianSignature = await guardian1.signMessage(arrayify(mockHash))

            await expect(mockMigrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, invalidPublicKeyBytes, getSelectors(r1Facet), [guardian1.address], [mockGuardianSignature])).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InvalidKeyType")
        })
        it('Should revert if guardian does not exists', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address], [signature1]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.not.emit(migrationBarz, "SignatureMigrationExecuted")


            const customMockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            await addFacetSelectors(customMockBarz, guardianFacet, guardianFacetSelectors, mockEntryPoint)
            await addFacetSelectors(customMockBarz, migrationFacet, migrationFacetSelectors, mockEntryPoint)
            const customMigrationBarz = await getFacetBarz("SignatureMigrationFacet", customMockBarz)
            const mockEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', customMigrationBarz.address, chainId, migrationNonce])
            const mockHash = keccak256(mockEncodedData)
            const mockGuardianSignature = await guardian1.signMessage(arrayify(mockHash))
            await expect(customMigrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address], [mockGuardianSignature])).to.be.revertedWithCustomError(customMigrationBarz, 'SignatureMigrationFacet__InvalidRouteWithGuardian')
        })
        it('Should revert if parameter guardian length and signature length differs', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)
            await addGuardianMock(guardian1, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, guardian2.address], [signature1]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.not.emit(migrationBarz, "SignatureMigrationExecuted")

            const mockEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', mockMigrationBarz.address, chainId, migrationNonce])
            const mockHash = keccak256(mockEncodedData)
            const mockGuardianSignature = await guardian1.signMessage(arrayify(mockHash))
            await expect(mockMigrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, guardian2.address], [mockGuardianSignature])).to.be.revertedWithCustomError(mockMigrationBarz, 'SignatureMigrationFacet__InvalidArrayLength')
        })
        it('Should revert if parameter guardian length + approved count < majority of guardians', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address], [signature1]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.not.emit(migrationBarz, "SignatureMigrationExecuted")
            const mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            const mockMigrationBarz = await getFacetBarz("SignatureMigrationFacet", mockBarz)
            await addFacetSelectors(mockBarz, migrationFacet, migrationFacetSelectors, mockEntryPoint)
            await addFacetSelectors(mockBarz, guardianFacet, guardianFacetSelectors, mockEntryPoint)

            const mockEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', mockMigrationBarz.address, chainId, migrationNonce])
            const mockHash = keccak256(mockEncodedData)
            const mockGuardianSignature = await guardian1.signMessage(arrayify(mockHash))
            await addGuardianMock(guardian2, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))
            await expect(mockMigrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address], [mockGuardianSignature])).to.be.revertedWithCustomError(mockMigrationBarz, "SignatureMigrationFacet__InsufficientApprovers")

        })
        it('Should revert if invalid parameter guardian', async () => {
            // Guardian 1 was added but Guardian 2 is given as param
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardianMock(guardian1, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian2.signMessage(arrayify(hash))
            const signerSignature = await owner.signMessage(arrayify(hash))
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian2.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.not.emit(migrationBarz, "SignatureMigrationExecuted")

            const mockEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', mockMigrationBarz.address, chainId, migrationNonce])
            const mockHash = keccak256(mockEncodedData)
            const mockGuardianSignature = await guardian1.signMessage(arrayify(mockHash))
            const mockSignerSignature = await owner.signMessage(arrayify(mockHash))
            // Guardian is added but Guardian 2 was given
            await expect(mockMigrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian2.address, barz.address], [mockGuardianSignature, mockSignerSignature])).to.be.revertedWithCustomError(mockMigrationBarz, "SignatureMigrationFacet__InvalidGuardian")
        })
        it('Should revert if invalid guardian signature', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardianMock(guardian1, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'InvalidSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signerSignature = await owner.signMessage(arrayify(hash))
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.not.emit(migrationBarz, "SignatureMigrationExecuted")

            const mockEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'InvalidSignature', mockMigrationBarz.address, chainId, migrationNonce])
            const mockHash = keccak256(mockEncodedData)
            const guardianSignature = await guardian1.signMessage(arrayify(mockHash))
            const mockSignerSignature = await owner.signMessage(arrayify(mockHash))
            await expect(mockMigrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, mockBarz.address], [guardianSignature, mockSignerSignature])).to.be.revertedWithCustomError(mockMigrationBarz, 'SignatureMigrationFacet__InvalidApproverSignature')
        })
        it('Should revert if duplicate guardian', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)

            await addFacetSelectors(mockBarz, migrationFacet, migrationFacetSelectors, mockEntryPoint)
            await addFacetSelectors(mockBarz, guardianFacet, guardianFacetSelectors, mockEntryPoint)

            const mockMigrationNonce = 0
            const mockEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', mockBarz.address, chainId, mockMigrationNonce])
            const mockHash = keccak256(mockEncodedData)
            const mockSignature1 = await guardian1.signMessage(arrayify(mockHash))
            const mockSignerSignature = await owner.signMessage(arrayify(mockHash))

            const mockAccountBarz = await getFacetBarz("AccountFacet", mockBarz)
            const mockGuardianBarz = await getFacetBarz("GuardianFacet", mockBarz)
            const mockMigrationBarz = await getFacetBarz("SignatureMigrationFacet", mockBarz)
            await addGuardianMock(guardian1, mockGuardianBarz, mockAccountBarz)
            await addGuardianMock(guardian2, mockGuardianBarz, mockAccountBarz)


            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, guardian1.address, barz.address], [mockSignature1, mockSignature1, mockSignerSignature]])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, migrateSignatureCall)).to.be.revertedWithCustomError(mockMigrationBarz, "DuplicateApprover")
        })
        it('Should emit Migration Execution event', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
        })
        it('Should revert if new verification facet is unregistered to facet registry', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardianMock(guardian1, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(unregisteredR1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, unregisteredR1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', mockMigrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [unregisteredR1Facet.address, publicKeyBytes, getSelectors(unregisteredR1Facet), [guardian1.address, mockBarz.address], [signature1, signerSignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, migrateSignatureCall)).to.revertedWithCustomError(mockMigrationBarz, "UnregisteredFacetAndSelectors")
        })
        it('Should migrate signature scheme even when guardian is a SCW with Secp256k1 Verification Facet', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            const guardian = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, guardian1.publicKey)
            await addGuardian(guardian)
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)

            const prefixedHash = getEthSignMessageHash(hash)

            const finalGuardianHash = await getMessageHash(prefixedHash, await getChainId(), guardian.address)
            const guardianSig = ecsign(Buffer.from(ethers.utils.arrayify(finalGuardianHash)), Buffer.from(ethers.utils.arrayify(guardian1.privateKey)))
            const signature1 = toRpcSig(guardianSig.v, guardianSig.r, guardianSig.s)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)
        })
        it('Should migrate signature scheme even when guardian is a SCW with Secp256r1 Verification Facet', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            const { keyPair, publicKeyBytes } = generateKeyPair()
            const guardian = await barzFixture(accountFacet, r1Facet, entryPoint, facetRegistry, defaultFallbackHandler, publicKeyBytes)
            await addGuardian(guardian)
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const ethSignMsgHash = keccak256(Buffer.concat([
                Buffer.from('\x19Ethereum Signed Message:\n32', 'ascii'),
                Buffer.from(ethers.utils.arrayify(hash))
            ]))
            const prefixedHash = getEthSignMessageHash(hash)

            const signature1 = await signMsgOnR1Curve(prefixedHash, keyPair)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)
        })
        it('Should increment migration nonce', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)
        })
        it('Should migration signature with both on-chain and off-chain approval', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            await expect(migrationBarz.connect(guardian2).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApproved")

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)
        })
        it('Should revert when approver approves with on-chain approval and reattempts off-chain approval', async () => {
            await addGuardianMock(guardian1, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))
            await addGuardianMock(guardian2, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))

            const mockMigrationBarz = await getFacetBarz("SignatureMigrationFacet", mockBarz)

            const { publicKeyBytes } = generateKeyPair()

            await expect(mockMigrationBarz.connect(guardian1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(mockMigrationBarz, "SignatureMigrationApproved")

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, migrateSignatureCall)).to.be.revertedWithCustomError(mockMigrationBarz, "SignatureMigrationFacet__DuplicateApproval")
        })
    })
    describe('# approveSignatureSchemeMigration', () => {
        it('Should revert if caller is not guardian/owner', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()

            await expect(migrationBarz.connect(user1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.be.revertedWithCustomError(migrationBarz, "CallerNotGuardianOrOwner")
        })
        it('Should increase migration approval count', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            let approvalCount = 0
            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(approvalCount)

            await expect(migrationBarz.connect(guardian1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApproved")

            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(++approvalCount)
        })
        it('Should migrate signature scheme when owner approves with no guardian in wallet', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            const approvalCount = 0
            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(approvalCount)

            const approveMigrationCall = migrationBarz.interface.encodeFunctionData('approveSignatureSchemeMigration', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const approveMigrationCallData = executeCallData(migrationBarz.address, 0, approveMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, approveMigrationCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')

            expect(await migrationBarz.getMigrationOwnerApprovalWithTimeValidity(signMessageHash)).to.be.true
            expect(await migrationBarz.isMigrationPending()).to.be.true
        })
        it('Should not execute migration if 1 guardian exists and only owner approves', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)

            const approvalCount = 0
            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(approvalCount)

            const approveMigrationCall = migrationBarz.interface.encodeFunctionData('approveSignatureSchemeMigration', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const approveMigrationCallData = executeCallData(migrationBarz.address, 0, approveMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, approveMigrationCallData)).to.not.emit(migrationBarz, 'SignatureMigrationExecuted')
            
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(0)
            expect(await migrationBarz.getMigrationOwnerApprovalWithTimeValidity(signMessageHash)).to.be.true
            expect(await migrationBarz.isMigrationPending()).to.be.false
        })
        it('Should migrate signature schememe when 1 guardian exists and owner + 1 guardian approves', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(0)

            const approveMigrationCall = migrationBarz.interface.encodeFunctionData('approveSignatureSchemeMigration', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const approveMigrationCallData = executeCallData(migrationBarz.address, 0, approveMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, approveMigrationCallData)).to.not.emit(migrationBarz, 'SignatureMigrationExecuted')
            
            await expect(migrationBarz.connect(guardian1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationExecuted")

            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(1)
            expect(await migrationBarz.getMigrationOwnerApprovalWithTimeValidity(signMessageHash)).to.be.true
            expect(await migrationBarz.isMigrationPending()).to.be.true
        })
        it('Should automatically migration signature if majority of guardian + owner approve', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            let approvalMigrationNonce = 0
            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationNonce()).to.equal(approvalMigrationNonce)

            await expect(migrationBarz.connect(guardian1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApproved")
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(1)

            await expect(migrationBarz.connect(guardian2).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApproved")
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(2)

            const approveSignatureSchemeMigrationCall = migrationBarz.interface.encodeFunctionData("approveSignatureSchemeMigration", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const approveSignatureSchemeMigrationCallData = executeCallData(migrationBarz.address, 0, approveSignatureSchemeMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, approveSignatureSchemeMigrationCallData)).to.emit(migrationBarz, "SignatureMigrationExecuted")

            expect(await migrationBarz.getMigrationNonce()).to.equal(++approvalMigrationNonce)
        })
        it('Should deduct approval if approval validation period passes', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(0)

            await expect(migrationBarz.connect(guardian1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApproved")
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(1)
            await increaseBlockTime(approvalValidationPeriod + 1)
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(0)
        })
        it('Should emit Migration Approved event', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            const approvalMigrationNonce = 0
            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            const encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationNonce()).to.equal(approvalMigrationNonce)
            await expect(migrationBarz.connect(guardian1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApproved")
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(1)
        })
        it('Should revert if new verification facet is unregistered to facet registry', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            await expect(migrationBarz.connect(guardian1).approveSignatureSchemeMigration(unregisteredR1Facet.address, publicKeyBytes, getSelectors(unregisteredR1Facet))).to.revertedWithCustomError(migrationBarz, "UnregisteredFacetAndSelectors")
            await expect(migrationBarz.connect(guardian2).approveSignatureSchemeMigration(unregisteredR1Facet.address, publicKeyBytes, getSelectors(unregisteredR1Facet))).to.revertedWithCustomError(migrationBarz, "UnregisteredFacetAndSelectors")
        })
    })
    describe('# revokeSignatureMigrationApproval', () => {
        it('Should revert if caller is not guardian/owner', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            const { publicKeyBytes } = generateKeyPair()

            await expect(migrationBarz.connect(user1).revokeSignatureMigrationApproval(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.be.revertedWithCustomError(migrationBarz, "CallerNotGuardianOrOwner")
        })
        it('Should revert if new public key length is not valid', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await expect(migrationBarz.connect(guardian1).revokeSignatureMigrationApproval(r1Facet.address, publicKeyBytes + "1111", getSelectors(r1Facet))).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InvalidKeyType")
        })
        it('Should revert if approval to revoke was not approved', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await expect(migrationBarz.connect(guardian1).revokeSignatureMigrationApproval(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__CannotRevokeUnapproved")
        })
        it('Should decrease migration approval count', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(0)

            await expect(migrationBarz.connect(guardian1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApproved")
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(1)

            await expect(migrationBarz.connect(guardian1).revokeSignatureMigrationApproval(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApprovalRevoked")
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(0)

        })
        it('Should emit Migration Revoked event', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signMessageHash = getEthSignMessageHash(hash)
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(0)

            await expect(migrationBarz.connect(guardian1).approveSignatureSchemeMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApproved")
            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(1)

            await expect(migrationBarz.connect(guardian1).revokeSignatureMigrationApproval(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationApprovalRevoked")
        })
    })
    describe('# finalizeSignatureMigration', () => {
        it('Should revert if uninitializeSigner() does not exist', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('uninitializeSigner')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const diamondCutCallData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, diamondCutCallData)

            await addGuardian(guardian1)

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)

            await increaseBlockTime(migrationPeriod)
            const finalizeMigrationCall = migrationBarz.interface.encodeFunctionData('finalizeSignatureMigration')
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, finalizeMigrationCall)
        })
        it('Should revert if not pending migration', async () => {
            await setupBarz(k1Facet, owner.publicKey)

            await addFacetsK1()
            const finalizeMigrationCall = migrationBarz.interface.encodeFunctionData('finalizeSignatureMigration')

            await callFromEntryPointOnK1(entryPoint, barz.address, owner, finalizeMigrationCall)
            expect(await migrationBarz.getMigrationNonce()).to.equal(0)

            const customMigrationBarz = await getFacetBarz("SignatureMigrationFacet", mockBarz)
            const customAccountBarz = await getFacetBarz("AccountFacet", mockBarz)
            await expect(customAccountBarz.connect(mockEntryPoint).execute(customAccountBarz.address, 0, finalizeMigrationCall)).to.be.revertedWithCustomError(customMigrationBarz, "SignatureMigrationFacet__NonexistentMigration")
        })
        it('Should revert if migration period not passed', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)

            const accountBarz = await getFacetBarz("AccountFacet", mockBarz)
            const finalizeMigrationCall = migrationFacet.interface.encodeFunctionData('finalizeSignatureMigration')
            await addGuardianMock(guardian1, await getFacetBarz("GuardianFacet", mockBarz), await getFacetBarz("AccountFacet", mockBarz))

            const mockMigrationNonce = 0
            expect(await mockMigrationBarz.getMigrationNonce()).to.equal(mockMigrationNonce)

            const mockHash = await getSignedMigrationHash(r1Facet, publicKeyBytes, mockMigrationBarz, mockMigrationNonce)
            const mockSignature1 = await guardian1.signMessage(arrayify(mockHash))
            const mockPrefixedHash = getEthSignMessageHash(mockHash)

            const mockFinalHash = await getMessageHash(mockPrefixedHash, await getChainId(), mockBarz.address)
            const mockSig = ecsign(Buffer.from(ethers.utils.arrayify(mockFinalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const mockSignerSignature = toRpcSig(mockSig.v, mockSig.r, mockSig.s)
            await mockMigrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, mockBarz.address], [mockSignature1, mockSignerSignature])

            await expect(accountBarz.connect(mockEntryPoint).execute(accountBarz.address, 0, finalizeMigrationCall)).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__MigrationPeriodNotOver")
        })
        it('Should switch owner and signature scheme', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { keyPair, publicKeyBytes, facetOwnerKey } = generateKeyPair()
            await addGuardian(guardian1)
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)

            await increaseBlockTime(migrationPeriod)

            const finalizeMigrationCall = migrationBarz.interface.encodeFunctionData('finalizeSignatureMigration')
            const finalizeMigrationCallData = executeCallData(migrationBarz.address, 0, finalizeMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, finalizeMigrationCallData)).to.emit(migrationBarz, "SignatureSchemeMigration")

            // Check if Owner/Signature is switched
            const r1Barz = await getFacetBarz('Secp256r1VerificationFacet', barz)
            expect(await r1Barz.owner()).to.equal(facetOwnerKey)
            await expect(callFromEntryPointOnR1(entryPoint, barz.address, keyPair, "0x00")).to.emit(accountBarz, "VerificationSuccess")
        })
        it('Should emit Migration event', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            let migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)
            await increaseBlockTime(migrationPeriod)

            const finalizeMigrationCall = migrationBarz.interface.encodeFunctionData('finalizeSignatureMigration')
            const finalizeMigrationCallData = executeCallData(migrationBarz.address, 0, finalizeMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, finalizeMigrationCallData)).to.emit(migrationBarz, "SignatureSchemeMigration")
        })
        it('Should revert if new verification facet is unregistered to facet registry', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            const { publicKeyBytes } = generateKeyPair()
            const migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])

            await mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, migrateSignatureCall)
            await increaseBlockTime(migrationPeriod)

            // Remove from Facet Registry
            await facetRegistry.connect(facetRegistryOwner).removeFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))

            const finalizationCall = migrationFacet.interface.encodeFunctionData('finalizeSignatureMigration')
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockMigrationBarz.address, 0, finalizationCall)).to.revertedWithCustomError(mockMigrationBarz, "UnregisteredFacetAndSelectors")
            
            // Add it back
            await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))
        })
    })
    describe('# approveCancelSignatureMigration', () => {
        it('Should revert if caller is not guardian/owner', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()

            await expect(migrationBarz.connect(user1).approveCancelSignatureMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.be.revertedWithCustomError(migrationBarz, "CallerNotGuardianOrOwner")
        })
        it('Should revert if new public key length is not valid', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)

            await expect(migrationBarz.connect(guardian1).approveCancelSignatureMigration(r1Facet.address, publicKeyBytes + "1111", getSelectors(r1Facet))).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InvalidKeyType")
        })
        it('Should emit Migration Cancellation Approved event', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)

            await expect(migrationBarz.connect(guardian1).approveCancelSignatureMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationCancellationApproved")
                .withArgs(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))
        })
        it('Should cancel signature schememe migration when 1 guardian exists and owner + 1 guardian approves', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            await addGuardian(guardian1)
            const { publicKeyBytes } = generateKeyPair()

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            await expect(migrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature])).to.emit(migrationBarz, "SignatureMigrationExecuted")

            await expect(migrationBarz.connect(guardian1).approveCancelSignatureMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationCancellationApproved")
                .withArgs(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))
            
            const migrationCall = migrationBarz.interface.encodeFunctionData("approveCancelSignatureMigration", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const migrationCallData = executeCallData(migrationBarz.address, 0, migrationCall)

            expect(await migrationBarz.isMigrationPending()).to.be.true

            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrationCallData)).to.emit(migrationBarz, "SignatureMigrationCanceled").withArgs(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))
            
            expect(await migrationBarz.isMigrationPending()).to.be.false
        })
        it('Should not execute migration cancellation if 1 guardian exists and only owner approves', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            await addGuardian(guardian1)
            const { publicKeyBytes } = generateKeyPair()

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            await expect(migrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature])).to.emit(migrationBarz, "SignatureMigrationExecuted")
            
            const migrationCall = migrationBarz.interface.encodeFunctionData("approveCancelSignatureMigration", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const migrationCallData = executeCallData(migrationBarz.address, 0, migrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrationCallData)).to.not.emit(migrationBarz, "SignatureMigrationCanceled")
            expect(await migrationBarz.isMigrationPending()).to.be.true
        })
        it('Should not execute migration cancellation if 1 guardian exists and only guardian approves', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            await addGuardian(guardian1)
            const { publicKeyBytes } = generateKeyPair()

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            await expect(migrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature])).to.emit(migrationBarz, "SignatureMigrationExecuted")
            
            await expect(migrationBarz.connect(guardian1).approveCancelSignatureMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.not.emit(migrationBarz, "SignatureMigrationCanceled")
            expect(await migrationBarz.isMigrationPending()).to.be.true
        })
        it('Should cancel signature scheme migration when owner approves with no guardian in wallet', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            const { publicKeyBytes } = generateKeyPair()

            const migrationCall = migrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const migrationCallData = executeCallData(migrationBarz.address, 0, migrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrationCallData)).to.emit(migrationBarz, "SignatureMigrationExecuted")
            expect(await migrationBarz.isMigrationPending()).to.be.true

            const cancelMigrationCall = migrationBarz.interface.encodeFunctionData("approveCancelSignatureMigration", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const cancelMigrationCallData = executeCallData(migrationBarz.address, 0, cancelMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelMigrationCallData)).to.emit(migrationBarz, "SignatureMigrationCanceled")
            expect(await migrationBarz.isMigrationPending()).to.be.false
        })
        it('Should automatically cancel migration if majority of guardian + owner approve', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const { publicKeyBytes } = generateKeyPair()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            let tmpMigrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(tmpMigrationNonce)

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            await expect(migrationBarz.migrateSignatureSchemeWithGuardian(r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, guardian2.address, barz.address], [signature1, signature2, signerSignature])).to.emit(migrationBarz, "SignatureMigrationExecuted")
            expect(await migrationBarz.getMigrationNonce()).to.equal(++tmpMigrationNonce)

            const cancellationEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', migrationBarz.address, chainId, tmpMigrationNonce])
            const cancelHash = keccak256(cancellationEncodedData)
            const signMessageHash = getEthSignMessageHash(cancelHash)

            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(0)

            await expect(migrationBarz.connect(guardian1).approveCancelSignatureMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationCancellationApproved")
                .withArgs(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))

            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(1)

            await expect(migrationBarz.connect(guardian2).approveCancelSignatureMigration(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationCancellationApproved")
                .withArgs(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))

            expect(await migrationBarz.getMigrationApprovalCountWithTimeValidity(signMessageHash)).to.equal(2)
            expect(await migrationBarz.isMigrationPending()).to.be.true
            const migrationCall = migrationBarz.interface.encodeFunctionData("approveCancelSignatureMigration", [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])

            const migrationCallData = executeCallData(migrationBarz.address, 0, migrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrationCallData)).to.emit(migrationBarz, "SignatureMigrationCanceled").withArgs(r1Facet.address, publicKeyBytes, getSelectors(r1Facet))
            expect(await migrationBarz.isMigrationPending()).to.be.false
        })
    })
    describe('# cancelSignatureMigration', () => {
        let publicKey: any
        let migrationNonce = 0
        let mockBarz: Barz
        let mockAccountBarz: AccountFacet
        let mockGuardianBarz: GuardianFacet
        let mockMigrationBarz: SignatureMigrationFacet

        beforeEach(async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            migrationBarz = await getFacetBarz("SignatureMigrationFacet", barz)
            const { publicKeyBytes } = generateKeyPair()
            publicKey = publicKeyBytes

            await addGuardian(guardian1)
            await addGuardian(guardian2)

            migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, guardian2.address, barz.address], [signature1, signature2, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)

            mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)

            await addFacetSelectors(mockBarz, migrationFacet, migrationFacetSelectors, mockEntryPoint)
            await addFacetSelectors(mockBarz, guardianFacet, guardianFacetSelectors, mockEntryPoint)

            mockAccountBarz = await getFacetBarz("AccountFacet", mockBarz)
            mockGuardianBarz = await getFacetBarz("GuardianFacet", mockBarz)
            mockMigrationBarz = await getFacetBarz("SignatureMigrationFacet", mockBarz)

            const mockMigrationNonce = 0
            expect(await mockMigrationBarz.getMigrationNonce()).to.equal(mockMigrationNonce)
            const mockEncodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'MigrateSignature', mockBarz.address, chainId, mockMigrationNonce])
            const mockHash = keccak256(mockEncodedData)
            const mockSignature1 = await guardian1.signMessage(arrayify(mockHash))
            const mockSignature2 = await guardian2.signMessage(arrayify(mockHash))
            const mockPrefixedHash = getEthSignMessageHash(mockHash)

            const mockFinalHash = await getMessageHash(mockPrefixedHash, await getChainId(), mockMigrationBarz.address)
            const mockSig = ecsign(Buffer.from(ethers.utils.arrayify(mockFinalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const mockSignerSignature = toRpcSig(mockSig.v, mockSig.r, mockSig.s)

            await addGuardianMock(guardian1, mockGuardianBarz, mockAccountBarz)
            await addGuardianMock(guardian2, mockGuardianBarz, mockAccountBarz)
            const mockMigrateSignatureCall = mockMigrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, guardian2.address, mockMigrationBarz.address], [mockSignature1, mockSignature2, mockSignerSignature]])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockMigrationBarz.address, 0, mockMigrateSignatureCall)).to.emit(mockMigrationBarz, 'SignatureMigrationExecuted')
        })
        it('Should revert if owner signature is not included', async () => {
            await addGuardian(guardian3)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            const signature3 = await guardian3.signMessage(arrayify(hash)) // NOTE: should revert because it's guardian3 not owner

            await expect(migrationBarz.cancelSignatureMigration(r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, guardian2.address, guardian3.address], [signature1, signature2, signature3])).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__LackOfOwnerApproval")
        })
        it('Should revert if new public key length is not valid', async () => {
            const invalidKey = publicKey + '1111'
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'uint256', 'uint128'], [invalidKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', chainId, await accountBarz.getNonce()])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, invalidKey, getSelectors(r1Facet), [guardian1.address, guardian2.address], [signature1, signature2]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)).to.not.emit(migrationBarz, "SignatureMigrationCanceled")
            await expect(migrationBarz.cancelSignatureMigration(r1Facet.address, invalidKey, getSelectors(r1Facet), [guardian1.address, guardian2.address], [signature1, signature2])).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InvalidKeyType")
        })
        it('Should revert if parameter guardian length and signature length differs', async () => {
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))

            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, guardian2.address], [signature1]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)).to.not.emit(migrationBarz, "SignatureMigrationCanceled")
            await expect(mockMigrationBarz.cancelSignatureMigration(r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, guardian2.address], [signature1])).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InvalidArrayLength")
        })
        it('Should revert if parameter guardian length + approved count < majority of guardians', async () => {
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature2 = await guardian2.signMessage(arrayify(hash))

            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian2.address], [signature2]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)).to.not.emit(migrationBarz, "SignatureMigrationCanceled")
            await expect(mockMigrationBarz.cancelSignatureMigration(r1Facet.address, publicKey, getSelectors(r1Facet), [guardian2.address], [signature2])).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InsufficientApprovers")
        })
        it('Should revert if invalid parameter guardian', async () => {
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await user1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))

            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [user1.address, guardian2.address, barz.address], [signature1, signature2, signerSignature]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            expect(await migrationBarz.isMigrationPending()).to.be.true
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)).to.not.emit(migrationBarz, "SignatureMigrationCanceled")
            expect(await migrationBarz.isMigrationPending()).to.be.true

            const mockSignerSignature = await owner.signMessage(arrayify(hash))
            await expect(mockMigrationBarz.cancelSignatureMigration(r1Facet.address, publicKey, getSelectors(r1Facet), [user1.address, guardian2.address, mockMigrationBarz.address], [signature1, signature2, mockSignerSignature])).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__NonExistentApprover")

        })
        it('Should revert if invalid guardian signature', async () => {
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'InvalidCancelSignatureMigration', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, guardian2.address, barz.address], [signature1, signature2, signerSignature]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockMigrationBarz.address, 0, cancelSignaterMigrationCall)).to.be.revertedWithCustomError(migrationBarz, "SignatureMigrationFacet__InvalidApproverSignature")
        })
        it('Should revert if duplicate guardian', async () => {
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', mockAccountBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, guardian1.address, barz.address], [signature1, signature1, signerSignature]])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockMigrationBarz.address, 0, cancelSignaterMigrationCall)).to.be.revertedWithCustomError(mockMigrationBarz, "DuplicateApprover")
        })
        it('Should emit Migration Cancellation event', async () => {
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, guardian2.address, barz.address], [signature1, signature2, signerSignature]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)).to.emit(migrationBarz, "SignatureMigrationCanceled").withArgs(r1Facet.address, publicKey, getSelectors(r1Facet))
        })
        it('Should cancel migration without guardian: mock entrypoint', async () => {
            mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)

            await addFacetSelectors(mockBarz, migrationFacet, migrationFacetSelectors, mockEntryPoint)
            await addFacetSelectors(mockBarz, guardianFacet, guardianFacetSelectors, mockEntryPoint)
            mockAccountBarz = await getFacetBarz("AccountFacet", mockBarz)
            mockGuardianBarz = await getFacetBarz("GuardianFacet", mockBarz)
            mockMigrationBarz = await getFacetBarz("SignatureMigrationFacet", mockBarz)

            const migrationSignatureCall = mockMigrationBarz.interface.encodeFunctionData("migrateSignatureScheme", [r1Facet.address, publicKey, getSelectors(r1Facet)])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address,0 , migrationSignatureCall)).to.emit(mockMigrationBarz, "SignatureMigrationExecuted")
        
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', mockMigrationBarz.address, chainId, 1])
            const hash = keccak256(encodedData)
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), mockAccountBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const cancelSignatureMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [mockAccountBarz.address], [signerSignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, cancelSignatureMigrationCall)).to.emit(mockMigrationBarz, "SignatureMigrationCanceled")
        })
        it('Should cancel migration without guardian: real entrypoint', async () => {
            migrationNonce = 0

            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            migrationBarz = await getFacetBarz("SignatureMigrationFacet", barz)
            const { publicKeyBytes } = generateKeyPair()
            publicKey = publicKeyBytes

            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)

            const encodedFuncSelectors = ethers.utils.defaultAbiCoder.encode(['bytes4[]'], [getSelectors(r1Facet)])
            encodedFuncSelectorsHash = keccak256(encodedFuncSelectors)

            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureScheme', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet)])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')

            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKeyBytes, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)

            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const cancelMigrationCall = migrationBarz.interface.encodeFunctionData('cancelSignatureMigration', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [accountBarz.address], [signerSignature]])
            const cancelMigrationCallData = executeCallData(migrationBarz.address, 0, cancelMigrationCall)

            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelMigrationCallData)).to.emit(migrationBarz, 'SignatureMigrationCanceled')

        })
        it('Should increment migration nonce', async () => {
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            expect(await migrationBarz.getMigrationNonce()).to.equal(1)
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, guardian2.address, barz.address], [signature1, signature2, signerSignature]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)).to.emit(migrationBarz, "SignatureMigrationCanceled").withArgs(r1Facet.address, publicKey, getSelectors(r1Facet))
            expect(await migrationBarz.getMigrationNonce()).to.equal(2)
        })
        it('Should cancel migration with on-chain and off-chain approval', async () => {
            await expect(migrationBarz.connect(guardian2).approveCancelSignatureMigration(r1Facet.address, publicKey, getSelectors(r1Facet))).to.emit(migrationBarz, "SignatureMigrationCancellationApproved")

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            expect(await migrationBarz.getMigrationNonce()).to.equal(1)
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)).to.emit(migrationBarz, "SignatureMigrationCanceled").withArgs(r1Facet.address, publicKey, getSelectors(r1Facet))
            expect(await migrationBarz.getMigrationNonce()).to.equal(2)
        })
        it('Should revert if on-chain approver reattempts to approve off-chain', async () => {
            await expect(mockMigrationBarz.connect(guardian1).approveCancelSignatureMigration(r1Facet.address, publicKey, getSelectors(r1Facet))).to.emit(mockMigrationBarz, "SignatureMigrationCancellationApproved")

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', migrationBarz.address, chainId, migrationNonce])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signerSignature = await owner.signMessage(arrayify(hash))
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, barz.address], [signature1, signerSignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, cancelSignaterMigrationCall)).to.be.revertedWithCustomError(mockMigrationBarz, "SignatureMigrationFacet__DuplicateApproval")
        })
        it('Should revert if migration is not pending', async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()

            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'address', 'bytes32', 'string', 'address', 'uint256', 'uint128'], [publicKey, r1Facet.address, encodedFuncSelectorsHash, 'CancelSignatureMigration', migrationBarz.address, chainId, 0])
            const hash = keccak256(encodedData)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            expect(await migrationBarz.getMigrationNonce()).to.equal(0)
            expect(await migrationBarz.isMigrationPending()).to.be.false
            const cancelSignaterMigrationCall = migrationBarz.interface.encodeFunctionData("cancelSignatureMigration", [r1Facet.address, publicKey, getSelectors(r1Facet), [guardian1.address, guardian2.address], [signature1, signature2]])
            const cancelSignaterMigrationCallData = executeCallData(migrationBarz.address, 0, cancelSignaterMigrationCall)
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, cancelSignaterMigrationCallData)
            expect(await migrationBarz.isMigrationPending()).to.be.false
        })
    })
    describe('# getPendingMigration', async () => {
        let encodedFuncSelectorsHash: any
        let migrationNonce = 0

        beforeEach(async () => {
            await setupBarz(k1Facet, owner.publicKey)
            await addFacetsK1()
            migrationBarz = await getFacetBarz("SignatureMigrationFacet", barz)
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            migrationNonce = 0
            expect(await migrationBarz.getMigrationNonce()).to.equal(migrationNonce)
        })
        it('Should return valid migration information', async () => {
            const { publicKeyBytes } = generateKeyPair()

            const hash = await getSignedMigrationHash(r1Facet, publicKeyBytes, migrationBarz, migrationNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), migrationBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const signerSignature = toRpcSig(sig.v, sig.r, sig.s)
            const migrateSignatureCall = migrationBarz.interface.encodeFunctionData('migrateSignatureSchemeWithGuardian', [r1Facet.address, publicKeyBytes, getSelectors(r1Facet), [guardian1.address, guardian2.address, barz.address], [signature1, signature2, signerSignature]])
            const migrateSignatureCallData = executeCallData(migrationBarz.address, 0, migrateSignatureCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, migrateSignatureCallData)).to.emit(migrationBarz, 'SignatureMigrationExecuted')
            expect(await migrationBarz.getMigrationNonce()).to.equal(++migrationNonce)

            const blockTimeStamp = await getBlockTimestamp()
            expect(await migrationBarz.getPendingMigration()).to.deep.equal([publicKeyBytes, r1Facet.address, getSelectors(r1Facet), blockTimeStamp + migrationPeriod])
        })
        it('Should return zero migration information if migration is not pending', async () => {
            expect(await migrationBarz.getPendingMigration()).to.deep.equal(['0x', AddressZero, [], 0])
        })
    })
})