import { ethers } from "hardhat"
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, SignatureMigrationFacet, Secp256k1VerificationFacet, Secp256r1VerificationFacet, SecurityManager, FacetRegistry, DiamondLoupeFacet, GuardianFacet, LockFacet, RestrictionsFacet, TokenReceiverFacet, DefaultFallbackHandler } from '../typechain-types'
import { facetCutType, getChainId, diamondCut, guardianSecurityPeriod, increaseBlockTime, getEthSignMessageHash, isUserOperationSuccessful } from './utils/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { createAccountOwner, fund, AddressZero, AddressOne, getMessageHash } from './utils/testutils'

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
import { addFacetSelectors, addFacetSelectorsViaEntryPointOnK1, getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { guardianFacetFixture } from './fixtures/GuardianFacetFixture'
import { keccak256 } from '@ethersproject/keccak256'
import { arrayify } from 'ethers/lib/utils'
import { lockFacetFixture } from './fixtures/LockFacetFixture'
import { restrictionsFacetFixture } from './fixtures/RestrictionsFacetFixture'
import { EntryPoint } from "../typechain-types/core"
import { callFromEntryPointOnK1, executeCallData } from "./utils/UserOp"
import { entryPointFixture } from "./fixtures/EntryPointFixture"
import { tokenReceiverFacetFixture } from "./fixtures/TokenReceiverFacetFixture"
import { defaultFallbackHandlerFixture } from "./fixtures/DefaultFallbackHandlerFixture"
import { ecsign, toRpcSig } from "ethereumjs-util"

describe('Diamond Cut Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let diamondCutBarz: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let accountFacet: AccountFacet
    let k1Facet: Secp256k1VerificationFacet
    let r1Facet: Secp256r1VerificationFacet
    let migrationFacet: SignatureMigrationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let diamondLoupeBarz: DiamondLoupeFacet
    let guardianFacet: GuardianFacet
    let guardianBarz: GuardianFacet
    let lockFacet: LockFacet
    let restrictionsFacet: RestrictionsFacet
    let entryPoint: EntryPoint
    let mockEntryPoint: EntryPoint
    let mockDiamondCutBarz: DiamondCutFacet
    let mockAccountBarz: AccountFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let mockGuardianBarz: GuardianFacet
    let user1: SignerWithAddress
    let guardian1: SignerWithAddress
    let guardian2: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let mockBarz: Barz
    let chainId: number
    let cutNonce = 0

    before(async () => {
        [mockEntryPoint, user1, guardian1, guardian2, securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        owner = createAccountOwner()
        await fund(owner.address)

        chainId = await getChainId()
        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        r1Facet = await secp256r1VerificationFacetFixture()
        guardianFacet = await guardianFacetFixture(securityManager)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        migrationFacet = await signatureMigrationFacetFixture(securityManager)
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        lockFacet = await lockFacetFixture(securityManager)
        restrictionsFacet = await restrictionsFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        entryPoint = await entryPointFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(migrationFacet.address, getSelectors(migrationFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, getSelectors(lockFacet))
    })
    beforeEach(async () => {

        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)

        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
        await entryPoint.depositTo(mockBarz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
        await setupBarz()

        await setupMockBarz()
    })
    const setupBarz = async () => {
        cutNonce = 0
        diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
        diamondLoupeBarz = await getFacetBarz('DiamondLoupeFacet', barz)
        guardianBarz = await getFacetBarz('GuardianFacet', barz)
        const guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== guardianFacet.interface.getSighash('securityManager'))
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)
        cutNonce++
        const diamondCutSelectors = getSelectors(diamondCutFacet).filter((item: string) => item !== diamondCutFacet.interface.getSighash('diamondCut'))
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, diamondCutFacet, diamondCutSelectors, entryPoint)
        cutNonce++
        const lockCutSelectors = getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager'))
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, lockFacet, lockCutSelectors, entryPoint)
        cutNonce++
    }

    const setupMockBarz = async () => {
        mockDiamondCutBarz = await getFacetBarz('DiamondCutFacet', mockBarz)
        mockAccountBarz = await getFacetBarz('AccountFacet', mockBarz)
        mockGuardianBarz = await getFacetBarz('GuardianFacet', mockBarz)
        const diamondCutSelectors = getSelectors(diamondCutFacet).filter((item: string) => item !== diamondCutFacet.interface.getSighash('diamondCut'))
        await addFacetSelectors(mockBarz, diamondCutFacet, diamondCutSelectors, mockEntryPoint)
        const guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== guardianFacet.interface.getSighash('securityManager'))
        await addFacetSelectors(mockBarz, guardianFacet, guardianFacetSelectors, mockEntryPoint)
        const lockCutSelectors = getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager'))
        await addFacetSelectors(mockBarz, lockFacet, lockCutSelectors, mockEntryPoint)
    }

    const addGuardian = async (newGuardian: any) => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [newGuardian.address])
        const callData = executeCallData(barz.address, 0, addGuardianCall)
        await callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(guardianBarz.confirmGuardianAddition(newGuardian.address)).to.emit(guardianBarz, "GuardianAdded")
        expect(await guardianBarz.isGuardian(newGuardian.address)).to.be.true
    }

    const addGuardianMock = async (_newGuardian: any) => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [_newGuardian.address])
        await mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, addGuardianCall)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(mockGuardianBarz.confirmGuardianAddition(_newGuardian.address)).to.emit(mockGuardianBarz, "GuardianAdded")
    }

    describe('# diamondCut', () => {
        it('Should revert if caller is not owner', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('uninitializeSigner')])
            await expect(diamondCutBarz.connect(user1).diamondCut(cut, AddressZero, "0x00")).to.be.revertedWith('LibDiamond: Caller not self')
        })
        it('Should revert if guardians exists & owner want to remove facet', async () => {
            await addGuardian(guardian1)
            await addGuardianMock(guardian1)

            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('uninitializeSigner')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.not.emit(diamondCutBarz, "DiamondCut")

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockDiamondCutBarz.address, 0, diamondCutCall)).to.be.revertedWithCustomError(diamondCutBarz, "DiamondCutFacet__InvalidRouteWithGuardian")
        })
        it('Should revert if init address is not zero', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('uninitializeSigner')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressOne, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.not.emit(diamondCutBarz, "DiamondCut")

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockDiamondCutBarz.address, 0, diamondCutCall)).to.be.revertedWithCustomError(diamondCutBarz, "DiamondCutFacet__InvalidInitAddress")
        })
        it('Should revert if guardians exists & owner want to add facet', async () => {
            await addGuardian(guardian1)
            await addGuardianMock(guardian1)

            const cut = diamondCut(diamondCutFacet.address, FacetCutAction.Add, [diamondCutFacet.interface.getSighash('diamondCut')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.not.emit(diamondCutBarz, "DiamondCut")

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockDiamondCutBarz.address, 0, diamondCutCall)).to.be.revertedWithCustomError(diamondCutBarz, "DiamondCutFacet__InvalidRouteWithGuardian")
        })
        it('Should revert if not registered in Facet Registry', async () => {
            const cut = diamondCut(restrictionsFacet.address, FacetCutAction.Add, [restrictionsFacet.interface.getSighash('initializeRestrictions')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.not.emit(diamondCutBarz, "DiamondCut")
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockDiamondCutBarz.address, 0, diamondCutCall)).to.be.revertedWithCustomError(diamondCutFacet, "UnregisteredFacetAndSelectors")
        })
        it('Should add Facet & Selectors to Diamond', async () => {
            const cut = diamondCut(migrationFacet.address, FacetCutAction.Add, [migrationFacet.interface.getSighash('migrateSignatureScheme')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

            const registeredSelectors = await diamondLoupeBarz.facetFunctionSelectors(migrationFacet.address)
            expect(registeredSelectors[0]).to.equal(migrationFacet.interface.getSighash('migrateSignatureScheme'))
        })
        it('Should increment Diamond Cut nonce', async () => {
            const cutNonceBefore = await diamondCutBarz.getDiamondCutNonce()
            const cut = diamondCut(migrationFacet.address, FacetCutAction.Add, [migrationFacet.interface.getSighash('migrateSignatureScheme')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")
            expect(await diamondCutBarz.getDiamondCutNonce()).to.equal(cutNonceBefore.add(1))
        })
        it('Should emit Diamond Cut event', async () => {
            const cut = diamondCut(migrationFacet.address, FacetCutAction.Add, [migrationFacet.interface.getSighash('migrateSignatureScheme')])
            const diamondCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCut', [cut, AddressZero, "0x00"])
            const callData = executeCallData(diamondCutBarz.address, 0, diamondCutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")
        })
    })

    describe('# diamondCutWithGuardian', () => {
        it('Should revert if guardian does not exist', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])

            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)

            const mockEncodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, mockAccountBarz.address, chainId, cutNonce])
            const mockEncodedash = keccak256(arrayify(mockEncodedData))
            const mockGuardiansignature = await guardian1.signMessage(arrayify(mockEncodedash))
            const mockCutCall = diamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, guardian1.address, user1.address], [mockGuardiansignature, mockGuardiansignature, mockGuardiansignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, mockCutCall)).to.be.revertedWithCustomError(mockDiamondCutBarz, 'DiamondCutFacet__InvalidRouteWithGuardian')
        })
        it('Should revert if duplicate guardian', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])

            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            await addGuardianMock(guardian1)
            await addGuardianMock(guardian2)

            const mockEncodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, mockAccountBarz.address, chainId, cutNonce])
            const mockEncodedash = keccak256(arrayify(mockEncodedData))
            const mockGuardiansignature = await guardian1.signMessage(arrayify(mockEncodedash))
            const mockCutCall = diamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, guardian1.address, user1.address], [mockGuardiansignature, mockGuardiansignature, mockGuardiansignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, mockCutCall)).to.be.revertedWithCustomError(mockDiamondCutBarz, 'DuplicateApprover')
        })
        it('Should revert if parameter guardian length and signature length differs', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            cut.push({
                facetAddress: restrictionsFacet.address,
                action: FacetCutAction.Add,
                functionSelectors: getSelectors(restrictionsFacet)
            })
            await addGuardian(guardian1)
            await addGuardianMock(guardian1)
            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            const encodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, barz.address, chainId, cutNonce])
            const Encodedash = keccak256(arrayify(encodedData))
            const guardianSignature = await guardian1.signMessage(arrayify(Encodedash))
            const cutCall = diamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, user1.address], [guardianSignature]])
            const callData = executeCallData(diamondCutBarz.address, 0, cutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.not.emit(diamondCutBarz, "DiamondCut")

            const mockEncodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, mockAccountBarz.address, chainId, cutNonce])
            const mockEncodedash = keccak256(arrayify(mockEncodedData))
            const mockGuardiansignature = await guardian1.signMessage(arrayify(mockEncodedash))
            const mockCutCall = diamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, user1.address], [mockGuardiansignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, mockCutCall)).to.be.revertedWithCustomError(mockDiamondCutBarz, 'DiamondCutFacet__InvalidArrayLength')
        })
        it('Should revert if not registered in Facet Registry', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            cut.push({
                facetAddress: restrictionsFacet.address,
                action: FacetCutAction.Add,
                functionSelectors: getSelectors(restrictionsFacet)
            })
            await addGuardian(guardian1)
            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            const encodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, barz.address, chainId, cutNonce])
            const Encodedash = keccak256(arrayify(encodedData))
            const signature1 = await guardian1.signMessage(arrayify(Encodedash))
            const cutCall = diamondCutFacet.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address], [signature1]])
            const callData = executeCallData(diamondCutBarz.address, 0, cutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.not.emit(diamondCutBarz, "DiamondCut")

            const mockEncodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, mockAccountBarz.address, chainId, cutNonce])
            const mockEncodedash = keccak256(arrayify(mockEncodedData))
            const mockSignature1 = await guardian1.signMessage(arrayify(mockEncodedash))
            const mockCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address], [mockSignature1]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, mockCutCall)).to.be.revertedWithCustomError(mockDiamondCutBarz, 'UnregisteredFacetAndSelectors')
        })
        it('Should revert if invalid guardian', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            await addGuardian(guardian1)
            await addGuardianMock(guardian1)
            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            const encodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, barz.address, chainId, cutNonce])
            const EncodedHash = keccak256(arrayify(encodedData))
            const guardianSignature = await guardian1.signMessage(arrayify(EncodedHash))
            const signerSignature = await owner.signMessage(arrayify(EncodedHash))
            const cutCall = diamondCutFacet.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [user1.address, barz.address], [guardianSignature, signerSignature]])
            const callData = executeCallData(diamondCutBarz.address, 0, cutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.not.emit(diamondCutBarz, "DiamondCut")

            const mockncodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, mockAccountBarz.address, chainId, cutNonce])
            const mockEncodedHash = keccak256(arrayify(mockncodedData))
            const mockGuardianSignature = await guardian1.signMessage(arrayify(mockEncodedHash))
            const mockSignerSignature = await owner.signMessage(arrayify(mockEncodedHash))
            // guardian1 is the guardian but we give user1 as guardian to check if it reverts
            const mockCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [user1.address, barz.address], [mockGuardianSignature, mockSignerSignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, mockCutCall)).to.be.revertedWithCustomError(mockDiamondCutBarz, 'DiamondCutFacet__InvalidApprover')
        })
        it('Should revert if invalid guardian signature', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            await addGuardian(guardian1)
            await addGuardianMock(guardian1)
            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            const invalidNonce = cutNonce + 1
            const encodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, barz.address, chainId, invalidNonce])
            const EncodedHash = keccak256(arrayify(encodedData))
            const guardianSignature = await guardian1.signMessage(arrayify(EncodedHash))
            const signerSignature = await owner.signMessage(arrayify(EncodedHash))
            const cutCall = diamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, barz.address], [guardianSignature, signerSignature]])
            const callData = executeCallData(diamondCutBarz.address, 0, cutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.not.emit(diamondCutBarz, "DiamondCut")

            const mockEncodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, mockAccountBarz.address, chainId, invalidNonce])
            const mockEncodedHash = keccak256(arrayify(mockEncodedData))
            const mockGuardianSignature = await guardian1.signMessage(arrayify(mockEncodedHash))
            const mockSignerSignature = await owner.signMessage(arrayify(mockEncodedHash))
            const mockCutCall = diamondCutFacet.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, mockBarz.address], [mockGuardianSignature, mockSignerSignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, mockCutCall)).to.be.revertedWithCustomError(mockDiamondCutBarz, 'DiamondCutFacet__InvalidApproverSignature')
        })
        it('Should add Facet & Selectors to Diamond', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            await addGuardian(guardian1)
            await addGuardianMock(guardian1)
            const abiCoder = new ethers.utils.AbiCoder()
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            const encodedData = abiCoder.encode(['bytes32', 'address', 'uint256', 'uint128'], [facetCutHash, barz.address, chainId, cutNonce])
            const EncodedHash = keccak256(arrayify(encodedData))
            const guardianSignature = await guardian1.signMessage(arrayify(EncodedHash))
            const prefixedHash = getEthSignMessageHash(EncodedHash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const ownerSignature = toRpcSig(sig.v, sig.r, sig.s)            
            const cutCall = diamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, barz.address], [guardianSignature, ownerSignature]])
            const callData = executeCallData(diamondCutBarz.address, 0, cutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, 'DiamondCut')

            const mockEncodedData = abiCoder.encode(['bytes32',  'address', 'uint256', 'uint128'], [facetCutHash, mockAccountBarz.address, chainId, cutNonce])
            const mockEncodedHash = keccak256(arrayify(mockEncodedData))
            const mockGuardianSignature = await guardian1.signMessage(arrayify(mockEncodedHash))
            const mockPrefixedHash = getEthSignMessageHash(mockEncodedHash)

            const mockFinalHash = await getMessageHash(mockPrefixedHash, await getChainId(), mockAccountBarz.address)
            const mockSig = ecsign(Buffer.from(ethers.utils.arrayify(mockFinalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const mockOwnerSignature = toRpcSig(mockSig.v, mockSig.r, mockSig.s)    
            const mockCutCall = diamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, mockBarz.address], [mockGuardianSignature, mockOwnerSignature]])
            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, mockCutCall)).to.emit(mockDiamondCutBarz, 'DiamondCut')
        })
        it('Should add Facet & Selectors to Diamond(partially with approval)', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            await addGuardian(guardian1)
            await addGuardian(guardian2)
            await diamondCutBarz.connect(guardian2).approveDiamondCut(cut)
            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            const customCutNonce = await diamondCutBarz.getDiamondCutNonce()
            const encodedData = abiCoder.encode(['bytes32',  'address', 'uint256', 'uint128'], [facetCutHash, barz.address, chainId, customCutNonce])
            const EncodedHash = keccak256(arrayify(encodedData))

            const guardianSignature1 = await guardian1.signMessage(arrayify(EncodedHash))
            const prefixedHash = getEthSignMessageHash(EncodedHash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), barz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const ownerSignature = toRpcSig(sig.v, sig.r, sig.s)    
            const cutCall = diamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, barz.address], [guardianSignature1, ownerSignature]])
            const callData = executeCallData(diamondCutBarz.address, 0, cutCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, 'DiamondCut')
        })
        it('Should revert if on-chain approver reattempts to approve with off-chain approval', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            await addGuardianMock(guardian1)
            await addGuardianMock(guardian2)
            await mockDiamondCutBarz.connect(guardian2).approveDiamondCut(cut)
            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            const customCutNonce = await mockDiamondCutBarz.getDiamondCutNonce()
            const encodedData = abiCoder.encode(['bytes32',  'address', 'uint256', 'uint128'], [facetCutHash, barz.address, chainId, customCutNonce])
            const EncodedHash = keccak256(arrayify(encodedData))

            const guardianSignature1 = await guardian1.signMessage(arrayify(EncodedHash))
            const guardianSignature2 = await guardian2.signMessage(arrayify(EncodedHash))
            const ownerSignature = await owner.signMessage(arrayify(EncodedHash))
            const cutCall = mockDiamondCutBarz.interface.encodeFunctionData('diamondCutWithGuardian', [cut, [guardian1.address, guardian2.address, barz.address], [guardianSignature1, guardianSignature2, ownerSignature]])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, cutCall)).to.be.revertedWithCustomError(mockDiamondCutBarz, "DiamondCutFacet__DuplicateApproval")
        })
    })
    describe('# approveDiamondCut', () => {
        it('Should revert if caller is not guardian or owner', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])

            await expect(diamondCutBarz.connect(user1).approveDiamondCut(cut)).to.be.revertedWithCustomError(diamondCutBarz, "CallerNotGuardianOrOwner")
        })
        it('Should revert if not registered in Facet Registry', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            cut.push({
                facetAddress: restrictionsFacet.address,
                action: FacetCutAction.Add,
                functionSelectors: getSelectors(restrictionsFacet)
            })
            await addGuardian(guardian1)
            await expect(diamondCutBarz.connect(guardian1).approveDiamondCut(cut)).to.be.revertedWithCustomError(diamondCutBarz, 'UnregisteredFacetAndSelectors')
        })
        it('Should revert if no guardian exists in Barz', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])
            const approveCutCall = diamondCutBarz.interface.encodeFunctionData("approveDiamondCut", [cut])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, approveCutCall)).to.be.revertedWithCustomError(mockDiamondCutBarz, "DiamondCutFacet__InvalidRouteWithoutGuardian")
            expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, approveCutCall))).to.be.false
        })
        it('Should emit Diamond Cut Approved event', async () => {
            await addGuardian(guardian1)

            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])

            await expect(diamondCutBarz.connect(guardian1).approveDiamondCut(cut)).to.emit(diamondCutBarz, "DiamondCutApproved")
        })
        it('Should automatically cut Diamond if majority of guardian approve + owner approve : Add', async () => {
            // mock entrypoint
            await addGuardianMock(guardian1)
            const mockCut = diamondCut(k1Facet.address, FacetCutAction.Add, [k1Facet.interface.getSighash('initializeSigner')])
            await expect(mockDiamondCutBarz.connect(guardian1).approveDiamondCut(mockCut)).to.emit(mockDiamondCutBarz, "DiamondCutApproved")
            const mockApproveCut = diamondCutBarz.interface.encodeFunctionData('approveDiamondCut', [mockCut])

            await expect(mockAccountBarz.connect(mockEntryPoint).execute(mockAccountBarz.address, 0, mockApproveCut)).to.emit(mockDiamondCutBarz, 'DiamondCut')

            // real entrypoint
            await addGuardian(guardian1)

            const cut = diamondCut(k1Facet.address, FacetCutAction.Add, [k1Facet.interface.getSighash('initializeSigner')])

            await expect(diamondCutBarz.connect(guardian1).approveDiamondCut(cut)).to.emit(diamondCutBarz, "DiamondCutApproved")
            const approveCut = diamondCutBarz.interface.encodeFunctionData('approveDiamondCut', [cut])
            const callData = executeCallData(diamondCutBarz.address, 0, approveCut)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, 'DiamondCut')
        })
        it('Should automatically cut Diamond if majority of guardian approve + owner approve : Remove', async () => {
            await addGuardian(guardian1)

            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])

            await expect(diamondCutBarz.connect(guardian1).approveDiamondCut(cut)).to.emit(diamondCutBarz, "DiamondCutApproved")
            const approveCut = diamondCutBarz.interface.encodeFunctionData('approveDiamondCut', [cut])
            const callData = executeCallData(diamondCutBarz.address, 0, approveCut)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, 'DiamondCut')
        })
    })
    describe('# revokeDiamondCutApproval', () => {
        it('Should revert if call is not guardian or owner', async () => {
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])

            await expect(diamondCutBarz.connect(user1).revokeDiamondCutApproval(cut)).to.be.revertedWithCustomError(diamondCutBarz, "CallerNotGuardianOrOwner")
        })
        it('Should revert if trying to revoke Diamond Cut that was not approved', async () => {
            await addGuardian(guardian1)
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])

            await expect(diamondCutBarz.connect(guardian1).revokeDiamondCutApproval(cut)).to.be.revertedWithCustomError(diamondCutBarz, "DiamondCutFacet__CannotRevokeUnapproved")
        })
        it('Should deduct Diamond Cut approval count', async () => {
            await addGuardian(guardian1)
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('owner')])

            const abiCoder = new ethers.utils.AbiCoder();
            const encodedFacetCuts = abiCoder.encode([facetCutType], [cut])
            const facetCutHash = keccak256(encodedFacetCuts)
            const encodedData = abiCoder.encode(['bytes32',  'address', 'uint256', 'uint128'], [facetCutHash,  barz.address, chainId, cutNonce])
            const encodedHash = keccak256(arrayify(encodedData))
            const signEthMsgHash = getEthSignMessageHash(encodedHash)

            expect(await diamondCutBarz.getDiamondCutApprovalCountWithTimeValidity(signEthMsgHash)).to.equal(0)
            await expect(diamondCutBarz.connect(guardian1).approveDiamondCut(cut)).to.emit(diamondCutBarz, "DiamondCutApproved")
            expect(await diamondCutBarz.getDiamondCutApprovalCountWithTimeValidity(signEthMsgHash)).to.equal(1)

            await diamondCutBarz.connect(guardian1).revokeDiamondCutApproval(cut)
            expect(await diamondCutBarz.getDiamondCutApprovalCountWithTimeValidity(signEthMsgHash)).to.equal(0)
        })
        it('Should emit Approval revoked event', async () => {
            await addGuardian(guardian1)
            const cut = diamondCut(AddressZero, FacetCutAction.Remove, [k1Facet.interface.getSighash('uninitializeSigner')])

            await expect(diamondCutBarz.connect(guardian1).approveDiamondCut(cut)).to.emit(diamondCutBarz, "DiamondCutApproved")

            await expect(diamondCutBarz.connect(guardian1).revokeDiamondCutApproval(cut)).to.emit(diamondCutBarz, "DiamondCutApprovalRevoked")
        })
    })
    describe('# updateSupportsInterface', () => {
        it('Should set supports interface to true', async () => {
            const interfaceId = "0x00000000"
            expect(await diamondLoupeBarz.supportsInterface(interfaceId)).to.be.false

            const approveCut = diamondCutBarz.interface.encodeFunctionData('updateSupportsInterface', ["0x00000000", true])
            const callData = executeCallData(diamondCutBarz.address, 0, approveCut)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, 'SupportsInterfaceUpdated').withArgs(interfaceId, true)
            expect(await diamondLoupeBarz.supportsInterface(interfaceId)).to.be.true
        })
        it('Should set supports interface to false', async () => {
            const interfaceId = "0x00000000"
            expect(await diamondLoupeBarz.supportsInterface(interfaceId)).to.be.false

            const approveCut = diamondCutBarz.interface.encodeFunctionData('updateSupportsInterface', ["0x00000000", true])
            const callData = executeCallData(diamondCutBarz.address, 0, approveCut)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, 'SupportsInterfaceUpdated').withArgs(interfaceId, true)
            expect(await diamondLoupeBarz.supportsInterface(interfaceId)).to.be.true

            const falseApproveCut = diamondCutBarz.interface.encodeFunctionData('updateSupportsInterface', ["0x00000000", false])
            const falseCallData = executeCallData(diamondCutBarz.address, 0, falseApproveCut)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, falseCallData)).to.emit(diamondCutBarz, 'SupportsInterfaceUpdated').withArgs(interfaceId, false)
            expect(await diamondLoupeBarz.supportsInterface(interfaceId)).to.be.false
        })
    })
})