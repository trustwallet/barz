import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, FacetRegistry, LockFacet, GuardianFacet, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler, AccountRecoveryFacet } from '../typechain-types'
import { getChainId, diamondCut, increaseBlockTime, guardianSecurityPeriod, lockPeriod, getEthSignMessageHash, getBlockTimestamp, isUserOperationSuccessful } from './utils/helpers'
import { addFacetSelectorsViaEntryPointOnK1, getAccountBarz, getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { AddressZero, createAccountOwner, fund, callGasLimit, verificationGasLimit, maxFeePerGas, AddressOne, getMessageHash } from './utils/testutils'

const {
    FacetCutAction,
    getSelectors
} = require('./utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { lockFacetFixture } from './fixtures/LockFacetFixture'
import { guardianFacetFixture } from './fixtures/GuardianFacetFixture'
import { callFromEntryPointOnK1, executeCallData, fillUserOpDefaults, getUserOpHash, signUserOpK1Curve } from './utils/UserOp'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { keccak256 } from '@ethersproject/keccak256'
import { arrayify } from 'ethers/lib/utils'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'
import { accountRecoveryFacetFixture } from './fixtures/AccountRecoveryFacetFixture'
import { Account, ecsign, toRpcSig } from 'ethereumjs-util'

describe('Lock Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let diamondCutBarz: DiamondCutFacet
    let securityManager: SecurityManager
    let defaultFallbackHandler: DefaultFallbackHandler
    let facetRegistry: FacetRegistry
    let accountFacet: AccountFacet
    let accountBarz: AccountFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let k1Facet: Secp256k1VerificationFacet
    let k1Barz: Secp256k1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let guardianFacet: GuardianFacet
    let accountRecoveryFacet: AccountRecoveryFacet
    let accountRecoveryBarz: AccountRecoveryFacet
    let guardianBarz: GuardianFacet
    let lockFacet: LockFacet
    let lockBarz: LockFacet
    let entryPoint: EntryPoint
    let guardian: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let owner: Wallet
    let recoveryAddress: Wallet
    let barz: Barz
    let chainId: number
    let guardianFacetSelectors: any
    let accountRecoverySelectors: any
    let testExecData: any

    before(async () => {
        [guardian, securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        owner = createAccountOwner()
        recoveryAddress = createAccountOwner()
        await fund(owner.address)

        testExecData = executeCallData(AddressOne, 10, "0x00")

        chainId = await getChainId()

        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        guardianFacet = await guardianFacetFixture(securityManager)
        accountRecoveryFacet = await accountRecoveryFacetFixture(securityManager)
        lockFacet = await lockFacetFixture(securityManager)
        entryPoint = await entryPointFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, getSelectors(lockFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountRecoveryFacet.address, getSelectors(accountRecoveryFacet))
        guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== diamondCutFacet.interface.getSighash('securityManager'))
        accountRecoverySelectors = getSelectors(accountRecoveryFacet).filter((item: string) => item !== diamondCutFacet.interface.getSighash('securityManager'))
    })
    beforeEach(async () => {
        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
        accountBarz = await getAccountBarz(barz)
        lockBarz = await getFacetBarz('LockFacet', barz)
        guardianBarz = await getFacetBarz('GuardianFacet', barz)
        k1Barz = await getFacetBarz('Secp256k1VerificationFacet', barz)
        accountRecoveryBarz = await getFacetBarz('AccountRecoveryFacet', barz)

        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
        await fund(barz.address)
    })

    const addGuardian = async (newGuardian: SignerWithAddress) => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [newGuardian.address])
        const addGuardianCallData = executeCallData(barz.address, 0, addGuardianCall)
        await callFromEntryPointOnK1(entryPoint, barz.address, owner, addGuardianCallData)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(guardianBarz.confirmGuardianAddition(newGuardian.address)).to.emit(guardianBarz, "GuardianAdded")
        expect(await guardianBarz.isGuardian(newGuardian.address)).to.be.true
    }

    const setupContracts = async () => {
        await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")
        await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, lockFacet, lockFacet, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")
        await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, accountRecoveryFacet, accountRecoverySelectors, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")
    }

    it('Should be able to add Lock Facet to Barz', async () => {
        await setupContracts()
    })
    describe('# lock', () => {
        it('Should revert lock if not guardian or owner', async () => {
            await setupContracts()
            await expect(lockBarz.lock()).to.be.revertedWithCustomError(lockBarz, 'CallerNotGuardianOrOwner')
        })
        it('Should lock account with guardian', async () => {
            await setupContracts()
            await addGuardian(guardian)
            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
        })
        it('Should lock account with owner', async () => {
            await setupContracts()
            await addGuardian(guardian)

            const lockCall = lockFacet.interface.encodeFunctionData("lock")
            const lockCallData = executeCallData(barz.address, 0, lockCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, lockCallData)).to.emit(lockBarz, "Locked")
        })
        it("Should increment nonce", async () => {
            await setupContracts()
            await addGuardian(guardian)
            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            expect(await lockBarz.lockNonce()).to.equal(1)
        })
    })
    describe('# unlock', () => {
        it('Should revert if not locked by lock function', async () => {
            await setupContracts()
            await addGuardian(guardian)
            const recoveryNonce = 0
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'string', 'address', 'uint256', 'uint128'], [recoveryAddress.publicKey, 'ExecuteRecovery', accountRecoveryBarz.address, chainId, recoveryNonce])
            const hash = keccak256(encodedData)
            const signature = await guardian.signMessage(arrayify(hash))
    
            await expect(accountRecoveryBarz.executeRecovery(recoveryAddress.publicKey, [guardian.address], [signature])).to.emit(accountRecoveryBarz, "RecoveryExecuted")

            const unlockEncodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "0"])
            const unlockHash = keccak256(unlockEncodedData)
            const guardianSignature = await guardian.signMessage(arrayify(unlockHash))

            await expect(lockBarz.unlock(guardian.address, guardianSignature)).to.be.revertedWithCustomError(lockBarz, 'LockFacet__CannotUnlock')
        })
        it('Should revert unlock if not guardian or owner', async () => {
            await setupContracts()
            await addGuardian(guardian)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "1"])
            const hash = keccak256(encodedData)
            const guardianSignature = await guardian.signMessage(arrayify(hash))
            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")

            // facetRegistryOwner is not guardian or owner
            await expect(lockBarz.unlock(facetRegistryOwner.address, guardianSignature)).to.be.revertedWithCustomError(lockBarz, 'LockFacet__InvalidApprover')
        })
        it('Should unlock account', async () => {
            await setupContracts()
            await addGuardian(guardian)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "1"])
            const hash = keccak256(encodedData)
            const guardianSignature = await guardian.signMessage(arrayify(hash))

            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            await expect(lockBarz.unlock(guardian.address, guardianSignature)).to.emit(lockBarz, "Unlocked")
        })
        it('Should unlock account with owner signature', async () => {
            await setupContracts()
            await addGuardian(guardian)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "1"])
            const hash = keccak256(encodedData)
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), lockBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const ownerUnlockSignature = toRpcSig(sig.v, sig.r, sig.s)

            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            await expect(lockBarz.unlock(lockBarz.address, ownerUnlockSignature)).to.emit(lockBarz, "Unlocked")
        })
        it('Should unlock account with owner signature -> owner locked', async () => {
            await setupContracts()
            await addGuardian(guardian)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "1"])
            const hash = keccak256(encodedData)
            const prefixedHash = getEthSignMessageHash(hash)

            const finalHash = await getMessageHash(prefixedHash, await getChainId(), lockBarz.address)
            const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

            const ownerUnlockSignature = toRpcSig(sig.v, sig.r, sig.s)

            const lockCall = lockBarz.interface.encodeFunctionData("lock")
            const callData = executeCallData(lockBarz.address, 0, lockCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(lockBarz, "Locked")
            await expect(lockBarz.unlock(lockBarz.address, ownerUnlockSignature)).to.emit(lockBarz, "Unlocked")
        })
        it("Should increment nonce", async () => {
            await setupContracts()
            await addGuardian(guardian)

            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "1"])
            const hash = keccak256(encodedData)
            const guardianSignature = await guardian.signMessage(arrayify(hash))
            expect(await lockBarz.lockNonce()).to.equal(0)

            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            expect(await lockBarz.lockNonce()).to.equal(1)

            await expect(lockBarz.unlock(guardian.address, guardianSignature)).to.emit(lockBarz, "Unlocked")
            expect(await lockBarz.lockNonce()).to.equal(2)
        })
        it("Should revert if invalid signature", async () => {
            await setupContracts()
            await addGuardian(guardian)
            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "1"])
            // Creating an invalid hash
            const hash = keccak256(encodedData + "0000")
            const guardianSignature = await guardian.signMessage(arrayify(hash))
            expect(await lockBarz.lockNonce()).to.equal(0)

            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            expect(await lockBarz.lockNonce()).to.equal(1)

            await expect(lockBarz.connect(guardian).unlock(guardian.address, guardianSignature)).to.be.revertedWithCustomError(lockBarz, "LockFacet__InvalidSignature")
        })
        it("Should revert if invalid nonce", async () => {
            await setupContracts()
            await addGuardian(guardian)
            const invalidNonce = 100;
            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, invalidNonce])
            const hash = keccak256(encodedData)
            const guardianSignature = await guardian.signMessage(arrayify(hash))
            expect(await lockBarz.lockNonce()).to.equal(0)

            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            expect(await lockBarz.lockNonce()).to.equal(1)

            await expect(lockBarz.connect(guardian).unlock(guardian.address, guardianSignature)).to.be.revertedWithCustomError(lockBarz, "LockFacet__InvalidSignature")
        })
    })
    describe('# getUnlockHash', async () => {
        it('Should return valid hash', async () => {
            await setupContracts()
            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "0"])
            const hash = keccak256(encodedData)
            const signEthMsgHash = getEthSignMessageHash(hash)

            expect(await lockBarz.getUnlockHash()).to.equal(signEthMsgHash)
        })
    })
    describe('# getLockPeriod', () => {
        it('Should return valid lock period', async () => {
            await setupContracts()
            expect(await lockBarz.getLockPeriod()).to.equal(lockPeriod)
        })
    })
    describe('# isLocked', async () => {
        it('Should return true when locked', async () => {
            await setupContracts()
            await addGuardian(guardian)
            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            expect(await lockBarz.isLocked()).to.be.true
        })
        it('Should return false when unlocked', async () => {
            await setupContracts()
            await addGuardian(guardian)
            expect(await lockBarz.isLocked()).to.be.false

            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")

            const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'uint128'], ["Unlock", lockBarz.address, chainId, "1"])
            const hash = keccak256(encodedData)
            const guardianSignature = await guardian.signMessage(arrayify(hash))
            await expect(lockBarz.connect(guardian).unlock(guardian.address, guardianSignature)).to.emit(lockBarz, "Unlocked")
            expect(await lockBarz.isLocked()).to.be.false
        })
    })
    describe('# getPendingLock', async () => {
        it('Should return valid lock information', async () => {
            await setupContracts()
            await addGuardian(guardian)
            await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            const blockTimeStamp = await getBlockTimestamp()
            expect(await lockBarz.getPendingLock()).to.deep.equal([blockTimeStamp + lockPeriod, lockBarz.interface.getSighash('lock')])
        })
        it('Should return empty value if wallet is not locked', async () => {
            await setupContracts()
            await addGuardian(guardian)

            expect(await lockBarz.getPendingLock()).to.deep.equal([0, '0x00000000'])
        })
    })

    it('Should revert diamond cut when locked', async () => {
        await setupContracts()
        await addGuardian(guardian)

        await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")

        const accountCut = diamondCut(accountFacet.address, FacetCutAction.Add, accountFacet)
        const cutCall = diamondCutBarz.interface.encodeFunctionData("diamondCut", [accountCut, AddressZero, "0x00"])
        const callData = executeCallData(diamondCutBarz.address, 0, cutCall)
        expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, callData))).to.be.false
    })

    it('Should fail validation when locked', async () => {
        await setupContracts()
        await addGuardian(guardian)
        await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")

        const userOp = signUserOpK1Curve(fillUserOpDefaults({
            sender: barz.address,
            callGasLimit,
            nonce: await accountBarz.getNonce(),
            verificationGasLimit,
            maxFeePerGas,
            callData: testExecData
        }), owner, entryPoint.address, chainId)
        const opHash = getUserOpHash(userOp, entryPoint.address, chainId)

        const isSignatureValid = await k1Barz.validateOwnerSignature(userOp, opHash)
        // 0 equals success, 1 equals SIG_VALIDATION_FAILED
        expect(isSignatureValid).to.equal(0)

        expect(await isUserOperationSuccessful(await entryPoint.handleOps([userOp], barz.address))).to.be.false
    })
})