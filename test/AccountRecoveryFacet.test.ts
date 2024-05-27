import { ethers } from 'hardhat'
import { BigNumber, Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, GuardianFacet, FacetRegistry, AccountRecoveryFacet, DiamondLoupeFacet, TokenReceiverFacet, LockFacet, DefaultFallbackHandler } from '../typechain-types'
import { getChainId, increaseBlockTime, guardianSecurityPeriod, recoveryPeriod, getBlockTimestamp, isUserOperationSuccessful, getEthSignMessageHash } from './utils/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { AddressOne, createAccountOwner, fund, getMessageHash } from './utils/testutils'
import { keccak256 } from "@ethersproject/keccak256";

const {
    getSelectors
} = require('./utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { addFacetSelectorsViaEntryPointOnK1, getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { guardianFacetFixture } from './fixtures/GuardianFacetFixture'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { accountRecoveryFacetFixture } from './fixtures/AccountRecoveryFacetFixture'
import { arrayify } from 'ethers/lib/utils'
import { EntryPoint } from '../typechain-types/core'
import { callFromEntryPointOnK1, executeCallData } from './utils/UserOp'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { lockFacetFixture } from './fixtures/LockFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'
import { ecsign, toRpcSig } from 'ethereumjs-util'

describe('Account Recovery Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let diamondCutBarz: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let accountFacet: AccountFacet
    let accountBarz: AccountFacet
    let k1Facet: Secp256k1VerificationFacet
    let k1Barz: Secp256k1VerificationFacet
    let accountRecoveryFacet: AccountRecoveryFacet
    let accountRecoveryBarz: AccountRecoveryFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let lockBarz: LockFacet
    let lockFacet: LockFacet
    let entryPoint: EntryPoint
    let guardian1: SignerWithAddress
    let guardian2: SignerWithAddress
    let recoveryOwner: Wallet
    let user1: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let guardianFacet: GuardianFacet
    let guardianBarz: GuardianFacet
    let chainId: number
    const recoveryNonce = 0
    let ownerSeed = 0
    let testExecData: any
    before(async () => {
        [guardian1, guardian2, securityManagerOwner, facetRegistryOwner, user1] = await ethers.getSigners()
        owner = createAccountOwner(ownerSeed++)
        recoveryOwner = createAccountOwner(ownerSeed++)
        await fund(owner.address)

        testExecData = executeCallData(AddressOne, 10, "0x00")

        chainId = await getChainId()

        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        guardianFacet = await guardianFacetFixture(securityManager)
        accountRecoveryFacet = await accountRecoveryFacetFixture(securityManager)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        entryPoint = await entryPointFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        lockFacet = await lockFacetFixture(securityManager)
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountRecoveryFacet.address, getSelectors(accountRecoveryFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, getSelectors(lockFacet))

        expect(await facetRegistry.owner()).to.equal(facetRegistryOwner.address)
    })
    beforeEach(async () => {
        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        accountBarz = await getFacetBarz('AccountFacet', barz)
        guardianBarz = await getFacetBarz('GuardianFacet', barz)
        diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
        accountRecoveryBarz = await getFacetBarz('AccountRecoveryFacet', barz)
        k1Barz = await getFacetBarz('Secp256k1VerificationFacet', barz)
        lockBarz = await getFacetBarz('LockFacet', barz)
        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
        await fund(barz)
    })
    const setupAccountRecoveryBarz = async () => {
        const verificationFacetSelector = [k1Facet.interface.getSighash('isValidKeyType'), k1Facet.interface.getSighash('initializeSigner'), k1Facet.interface.getSighash('uninitializeSigner')]
        await expect(addFacetSelectorsViaEntryPointOnK1(barz, owner, k1Facet, verificationFacetSelector, entryPoint)).to.emit(diamondCutBarz, "DiamondCut")

        const lockFacetSelectors = getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager'))
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, lockFacet, lockFacetSelectors, entryPoint)

        const guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== guardianFacet.interface.getSighash('securityManager'))
        await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint);

        const accountRecoveryFacetSelectors = getSelectors(accountRecoveryFacet).filter((item: string) => item !== accountRecoveryFacet.interface.getSighash('securityManager'))
        const accountRecoveryCutTx = await addFacetSelectorsViaEntryPointOnK1(barz, owner, accountRecoveryFacet, accountRecoveryFacetSelectors, entryPoint);
        const accountRecoveryCutReceipt = await accountRecoveryCutTx.wait()

        expect(accountRecoveryCutReceipt.status).to.equal(1)
    }
    const addGuardian = async (newGuardian: SignerWithAddress) => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [newGuardian.address])
        const callData = executeCallData(barz.address, 0, addGuardianCall)
        await callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(guardianBarz.confirmGuardianAddition(newGuardian.address)).to.emit(guardianBarz, "GuardianAdded")

        expect(await guardianBarz.isGuardian(newGuardian.address)).to.be.true
    }
    const getExecuteRecoveryHash = (recoveryOwner: Wallet, accountRecoveryBarz: AccountRecoveryFacet, recoveryNonce: number | BigNumber) => {
        const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'string', 'address', 'uint256', 'uint128'], [recoveryOwner.publicKey, 'ExecuteRecovery', accountRecoveryBarz.address, chainId, recoveryNonce])
        return keccak256(encodedData)
    }
    const getCancelRecoveryHash = (recoveryOwner: Wallet, accountRecoveryBarz: AccountRecoveryFacet, cancelRecoveryNonce: number | BigNumber) => {
        const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'string', 'address', 'uint256', 'uint128'], [recoveryOwner.publicKey, 'CancelRecovery', accountRecoveryBarz.address, chainId, cancelRecoveryNonce])
        return keccak256(encodedData)
    } 

    it("Should add Account Recovery Facet to wallet", async () => {
        const accountRecoveryFacetSelectors = getSelectors(accountRecoveryFacet).filter((item: string) => item !== accountRecoveryFacet.interface.getSighash('securityManager'))
        const accountRecoveryCutTx = await addFacetSelectorsViaEntryPointOnK1(barz, owner, accountRecoveryFacet, accountRecoveryFacetSelectors, entryPoint);
        const accountRecoveryCutReceipt = await accountRecoveryCutTx.wait()
        expect(accountRecoveryCutReceipt.status).to.equal(1)
    })
    describe("# executeRecovery", () => {
        it("Should revert if guardian doesn't exist", async () => {
            await setupAccountRecoveryBarz()
    
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address], ["0x00"])).to.be.revertedWithCustomError(accountRecoveryBarz, "AccountRecoveryFacet__InvalidGuardian")
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [], [])).to.be.revertedWithCustomError(accountRecoveryBarz, "ZeroApproverLength")
        })
        it("Should execute recovery with Guardian signature", async () => {
            await setupAccountRecoveryBarz()
            await addGuardian(guardian1)
    
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'string', 'address', 'uint256', 'uint128'], [recoveryOwner.publicKey, 'ExecuteRecovery', accountRecoveryBarz.address, chainId, recoveryNonce])
            const hash = keccak256(encodedData)
            const signature = await guardian1.signMessage(arrayify(hash))
    
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address], [signature])).to.emit(accountRecoveryBarz, "RecoveryExecuted")
        })
        it("Should revert if duplicate guardian executing recovery", async () => {
            await setupAccountRecoveryBarz()
    
            await addGuardian(guardian1)
            await addGuardian(guardian2)
            const hash = getExecuteRecoveryHash(recoveryOwner, accountRecoveryBarz, recoveryNonce)
            const signature = await guardian1.signMessage(arrayify(hash))
    
            expect(await k1Barz.owner()).to.equal(owner.address.toLowerCase())
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address, guardian1.address], [signature, signature])).to.be.revertedWithCustomError(accountRecoveryBarz, "DuplicateApprover")
        })
        it("Should revert if invalid signature in recovery with Guardian", async () => {
            await setupAccountRecoveryBarz()
            const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'string', 'address', 'uint256', 'uint128'], [recoveryOwner.publicKey, 'InvalidSignature', accountRecoveryBarz.address, chainId, recoveryNonce])
            const hash = keccak256(encodedData)
            await addGuardian(guardian1)
            const signature = await guardian1.signMessage(arrayify(hash))
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address], [signature])).to.be.revertedWithCustomError(accountRecoveryBarz, "AccountRecoveryFacet__InvalidGuardianSignature")
        })
        it("Should execute recovery with on-chain approvals", async () => {
            await setupAccountRecoveryBarz()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            await accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)
            await expect(accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryExecuted")
        })
        it("Should execute recovery with both on-chain and off-chain approvals", async () => {
            await setupAccountRecoveryBarz()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            await accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)

            const hash = getExecuteRecoveryHash(recoveryOwner, accountRecoveryBarz, recoveryNonce)
            const signature = await guardian1.signMessage(arrayify(hash))
    
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address], [signature])).to.emit(accountRecoveryBarz, "RecoveryExecuted")
        })
        it("Should revert if on-chain approver reattempts to approve off-chain", async () => {
            await setupAccountRecoveryBarz()
            await addGuardian(guardian1)
            await addGuardian(guardian2)

            // NOTE: Guardian 1 already approved but wants to approve again with off-chain signature
            await accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)

            const hash = getExecuteRecoveryHash(recoveryOwner, accountRecoveryBarz, recoveryNonce)
            const signature1 = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))

            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian2.address, guardian1.address], [signature2, signature1])).to.be.revertedWithCustomError(accountRecoveryBarz, "AccountRecoveryFacet__DuplicateApproval")
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address], [signature1])).to.be.revertedWithCustomError(accountRecoveryBarz, "AccountRecoveryFacet__DuplicateApproval")
        })
    })
    describe("# cancelRecovery", ()=> {
        it("Should revert if duplicate guardian canceling recovery", async () => {
            await setupAccountRecoveryBarz()
    
            await addGuardian(guardian1)
            await addGuardian(guardian2)
            const hash = getExecuteRecoveryHash(recoveryOwner, accountRecoveryBarz, recoveryNonce)
            const signature = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            expect(await k1Barz.owner()).to.equal(owner.address.toLowerCase())
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address, guardian2.address], [signature, signature2])).to.emit(accountRecoveryBarz, "RecoveryExecuted")
    
            const cancelRecoveryNonce = await accountRecoveryBarz.getRecoveryNonce()
            const cancelHash = getCancelRecoveryHash(recoveryOwner, accountRecoveryBarz, cancelRecoveryNonce)

            const cancelSignature1 = await guardian1.signMessage(arrayify(cancelHash))
    
            await expect(accountRecoveryBarz.cancelRecovery(recoveryOwner.publicKey, [guardian1.address, guardian1.address], [cancelSignature1, cancelSignature1])).to.be.revertedWithCustomError(accountRecoveryBarz, "DuplicateApprover")
        })
        it("Should cancel recovery with both on-chain and off-chain approvals", async () => {
            await setupAccountRecoveryBarz()
    
            await addGuardian(guardian1)
            await addGuardian(guardian2)
            const hash = getExecuteRecoveryHash(recoveryOwner, accountRecoveryBarz, recoveryNonce)
            const signature = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            expect(await k1Barz.owner()).to.equal(owner.address.toLowerCase())
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address, guardian2.address], [signature, signature2])).to.emit(accountRecoveryBarz, "RecoveryExecuted")
            
            await accountRecoveryBarz.connect(guardian2).approveCancelRecovery(recoveryOwner.publicKey)

            const cancelRecoveryNonce = await accountRecoveryBarz.getRecoveryNonce()
            const cancelHash = getCancelRecoveryHash(recoveryOwner, accountRecoveryBarz, cancelRecoveryNonce)

            const cancelSignature1 = await guardian1.signMessage(arrayify(cancelHash))
            await expect(accountRecoveryBarz.cancelRecovery(recoveryOwner.publicKey, [guardian1.address], [cancelSignature1])).to.emit(accountRecoveryBarz, "RecoveryCanceled")
        })
        it("Should revert if on-chain approver reattempts to approve off-chain", async () => {
            await setupAccountRecoveryBarz()
    
            await addGuardian(guardian1)
            await addGuardian(guardian2)
            const hash = getExecuteRecoveryHash(recoveryOwner, accountRecoveryBarz, recoveryNonce)
            const signature = await guardian1.signMessage(arrayify(hash))
            const signature2 = await guardian2.signMessage(arrayify(hash))
            expect(await k1Barz.owner()).to.equal(owner.address.toLowerCase())
            await expect(accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address, guardian2.address], [signature, signature2])).to.emit(accountRecoveryBarz, "RecoveryExecuted")
            
            // NOTE: Guardian1 approved and tries again with off-chain approval
            await accountRecoveryBarz.connect(guardian1).approveCancelRecovery(recoveryOwner.publicKey)

            const cancelRecoveryNonce = await accountRecoveryBarz.getRecoveryNonce()
            const cancelHash = getCancelRecoveryHash(recoveryOwner, accountRecoveryBarz, cancelRecoveryNonce)

            const cancelSignature1 = await guardian1.signMessage(arrayify(cancelHash))
            await expect(accountRecoveryBarz.cancelRecovery(recoveryOwner.publicKey, [guardian1.address], [cancelSignature1])).to.be.revertedWithCustomError(accountRecoveryBarz, "AccountRecoveryFacet__DuplicateApproval")
        })
    })

    it("Should recover account if recovery is finalized", async () => {
        await setupAccountRecoveryBarz()
        await addGuardian(guardian1)
        const hash = getExecuteRecoveryHash(recoveryOwner, accountRecoveryBarz, recoveryNonce)
        const signature = await guardian1.signMessage(arrayify(hash))

        expect(await k1Barz.owner()).to.equal(owner.address.toLowerCase())
        await accountRecoveryBarz.executeRecovery(recoveryOwner.publicKey, [guardian1.address], [signature])

        expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, testExecData))).to.equal(false);

        await increaseBlockTime(recoveryPeriod)

        await expect(accountRecoveryBarz.finalizeRecovery()).to.emit(accountRecoveryBarz, "RecoveryFinalized")
        expect(await k1Barz.owner()).to.equal(recoveryOwner.address.toLowerCase())
    })
    it("Should revert if non-guardian attempts to approve recovery", async () => {
        await setupAccountRecoveryBarz()

        await addGuardian(guardian1)
        await expect(accountRecoveryBarz.connect(user1).approveAccountRecovery(recoveryOwner.publicKey)).to.be.revertedWithCustomError(accountRecoveryBarz, "CallerNotGuardian")
    })
    it("Should execute recovery with direct call from Guardian", async () => {
        await setupAccountRecoveryBarz()

        await addGuardian(guardian1)
        await addGuardian(guardian2)

        await expect(accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApproved")
        await expect(accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryExecuted")

        expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, testExecData))).to.be.false
        await expect(accountBarz.execute(accountBarz.address, 0, "0x00")).to.be.revertedWith("Account Locked")
    })
    it("Should revoke recovery approval if majority of guardians agree", async () => {
        await setupAccountRecoveryBarz()

        await addGuardian(guardian1)
        await addGuardian(guardian2)
        await expect(accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApproved")

        await expect(accountRecoveryBarz.connect(guardian1).revokeAccountRecoveryApproval(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApprovalRevoked")

        await expect(accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApproved")
        expect(await k1Barz.owner()).to.equal(owner.address.toLowerCase())
    })
    it("Should revert if recovery is not pending for finalization", async () => {
        await setupAccountRecoveryBarz()
        await expect(accountRecoveryBarz.finalizeRecovery()).to.be.revertedWithCustomError(accountRecoveryBarz, "AccountRecoveryFacet__NonexistentRecovery")
    })
    it("Should cancel pending recovery if majority of guardians agree with signature", async () => {
        await setupAccountRecoveryBarz()
        await addGuardian(guardian1)
        await addGuardian(guardian2)

        await expect(accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApproved")

        await expect(accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryExecuted")

        expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, testExecData))).to.be.false
        await expect(accountBarz.execute(accountBarz.address, 0, "0x00")).to.be.revertedWith("Account Locked")

        const recoveryNonce = await accountRecoveryBarz.getRecoveryNonce()
        const encodedData = ethers.utils.defaultAbiCoder.encode(['bytes', 'string', 'address', 'uint256', 'uint128'], [recoveryOwner.publicKey, 'CancelRecovery', accountRecoveryBarz.address, chainId, recoveryNonce])

        const hash = keccak256(encodedData)
        const signature1 = await guardian1.signMessage(arrayify(hash))
        const signature2 = await guardian2.signMessage(arrayify(hash))

        await expect(accountRecoveryBarz.cancelRecovery(recoveryOwner.publicKey, [guardian1.address, guardian2.address], [signature1, signature2])).to.emit(accountRecoveryBarz, "RecoveryCanceled")
    })
    it("Should cancel pending recovery if majority of guardians agree with direct call", async () => {
        await setupAccountRecoveryBarz()

        await addGuardian(guardian1)
        await addGuardian(guardian2)

        await expect(accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApproved")
        await expect(accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryExecuted")
        expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, testExecData))).to.be.false
        await expect(accountBarz.execute(accountBarz.address, 0, "0x00")).to.be.revertedWith("Account Locked")

        await expect(accountRecoveryBarz.connect(guardian1).approveCancelRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryCancellationApproved")
        await expect(accountRecoveryBarz.connect(guardian2).approveCancelRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryCanceled")

        await expect(accountRecoveryBarz.finalizeRecovery()).to.be.revertedWithCustomError(accountRecoveryBarz, "AccountRecoveryFacet__NonexistentRecovery")
    })
    it("Should hardstop recovery if owner approves", async () => {
        await setupAccountRecoveryBarz()

        await addGuardian(guardian1)
        await addGuardian(guardian2)

        await expect(accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApproved")
        await expect(accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryExecuted")

        expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, testExecData))).to.be.false
        await expect(accountBarz.execute(accountBarz.address, 0, "0x00")).to.be.revertedWith("Account Locked")
        
        const recoveryNonce = await accountRecoveryBarz.getRecoveryNonce()
        const encodedData = ethers.utils.defaultAbiCoder.encode(['string', 'string', 'address', 'uint256', 'uint128'], ['0', 'HardstopRecovery', accountRecoveryBarz.address, chainId, recoveryNonce])

        const hash = keccak256(encodedData)
        const prefixedHash = getEthSignMessageHash(hash)

        const finalHash = await getMessageHash(prefixedHash, await getChainId(), lockBarz.address)
        const sig = ecsign(Buffer.from(ethers.utils.arrayify(finalHash)), Buffer.from(ethers.utils.arrayify(owner.privateKey)))

        const ownerHardstopSignature = toRpcSig(sig.v, sig.r, sig.s)
        await expect(accountRecoveryBarz.hardstopRecovery(ownerHardstopSignature)).to.emit(accountRecoveryBarz, "RecoveryHardstopped")
        expect(await lockBarz.isLocked()).to.be.false

    })
    it("Should return valid recovery nonce", async () => {
        await setupAccountRecoveryBarz()

        await addGuardian(guardian1)
        await addGuardian(guardian2)

        expect(await accountRecoveryBarz.getRecoveryNonce()).to.equal(0)

        await expect(accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApproved")
        await expect(accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryExecuted")

        expect(await accountRecoveryBarz.getRecoveryNonce()).to.equal(1)
    })
    it("Should revert if revoking non-existent recovery approval", async () => {
        await setupAccountRecoveryBarz()

        await addGuardian(guardian1)
        await addGuardian(guardian2)

        expect(await accountRecoveryBarz.getRecoveryNonce()).to.equal(0)

        await expect(accountRecoveryBarz.connect(guardian1).revokeAccountRecoveryApproval(recoveryOwner.publicKey)).to.be.revertedWithCustomError(accountRecoveryBarz, "AccountRecoveryFacet__NonExistentApproval")
    })
    it('Should return valid pending recovery', async () => {
        await setupAccountRecoveryBarz()

        await addGuardian(guardian1)
        await addGuardian(guardian2)

        expect(await accountRecoveryBarz.getRecoveryNonce()).to.equal(0)

        await expect(accountRecoveryBarz.connect(guardian1).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryApproved")
        await expect(accountRecoveryBarz.connect(guardian2).approveAccountRecovery(recoveryOwner.publicKey)).to.emit(accountRecoveryBarz, "RecoveryExecuted")
        
        expect(await accountRecoveryBarz.getRecoveryNonce()).to.equal(1)
        const blockTimeStamp = await getBlockTimestamp()

        expect(await accountRecoveryBarz.getPendingRecovery()).to.deep.equal([recoveryOwner.publicKey, blockTimeStamp + recoveryPeriod])
        
        await expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, testExecData))).to.be.false
        await expect(accountBarz.execute(accountBarz.address, 0, "0x00")).to.be.revertedWith("Account Locked")
    })
    it('Should return zero value if recovery is not pending', async () => {
        await setupAccountRecoveryBarz()
        
        expect(await accountRecoveryBarz.getRecoveryNonce()).to.equal(0)
    
        expect(await accountRecoveryBarz.getPendingRecovery()).to.deep.equal(['0x', '0'])
    })
})