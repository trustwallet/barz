import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, TestCounter, FacetRegistry, GuardianFacet, LockFacet, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler, TestInvalidSecp256k1VerificationFacet, Secp256r1VerificationFacet } from '../typechain-types'
import { getChainId, diamondCut, increaseBlockTime, generateKeyPair, guardianSecurityPeriod, isUserOperationSuccessful } from './utils/helpers'
import { addFacetSelectorsViaEntryPointOnK1, addFacetSelectorsViaEntryPointOnR1, getFacetBarz, setupDefaultSecuritManager } from './utils/setup'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { createAccountOwner, fund, callGasLimit, verificationGasLimit, maxFeePerGas, AddressOne } from './utils/testutils'

const {
    FacetCutAction,
    getSelectors
} = require('./utils/diamond.js')

import { expect } from "chai"
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from './fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { testCounterFixture } from './fixtures/TestCounterFixture'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { lockFacetFixture } from './fixtures/LockFacetFixture'
import { guardianFacetFixture } from './fixtures/GuardianFacetFixture'
import { testTokenFixture } from './fixtures/TestTokenFixture'
import { executeBatchCallData, executeCallData, fillUserOpDefaults, getUserOpHash, signUserOpK1Curve, signUserOpR1Curve, callFromEntryPointOnK1, callFromEntryPointOnR1 } from './utils/UserOp'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { secp256r1VerificationFacetFixture } from './fixtures/Secp256r1VerificationFacetFixture'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'
import { testInvalidSecp256k1VerificationFacetFixture } from './fixtures/TestInvalidSecp256k1VerificationFacetFixture'

// TODO: All Test code will be refactored including AccountFacet test

describe('Account Facet', () => {
    let diamondCutFacet: DiamondCutFacet
    let diamondCutBarz: DiamondCutFacet
    let defaultFallbackHandler: DefaultFallbackHandler
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let accountFacet: AccountFacet
    let accountBarz: AccountFacet
    let mockAccountBarz: AccountFacet
    let guardianFacet: GuardianFacet
    let guardianBarz: GuardianFacet
    let k1Facet: Secp256k1VerificationFacet
    let r1Facet: Secp256r1VerificationFacet
    let testInvalidK1Facet: TestInvalidSecp256k1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let lockFacet: LockFacet
    let lockBarz: LockFacet
    let entryPoint: EntryPoint
    let tokenReceiverFacet: TokenReceiverFacet
    let guardian: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let securityManagerOwner: SignerWithAddress
    let mockEntryPoint: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let mockBarz: Barz
    let testCounter: TestCounter
    let incrementCall: any
    let chainId: number
    let testExecData: any
    const value = 0
    let lockFacetSelectors: any
    let guardianFacetSelectors: any

    const addGuardian = async (owner: any, newGuardian: SignerWithAddress, nonce: number, isR1 = false): Promise<number> => {
        const addGuardianCall = guardianFacet.interface.encodeFunctionData("addGuardian", [newGuardian.address])
        const callData = executeCallData(barz.address, 0, addGuardianCall)
        if (isR1)
            await callFromEntryPointOnR1(entryPoint, barz.address, owner, callData)
        else
            await callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)

        await increaseBlockTime(guardianSecurityPeriod)
        await expect(guardianBarz.confirmGuardianAddition(newGuardian.address)).to.emit(guardianBarz, "GuardianAdded")
        expect(await guardianBarz.isGuardian(newGuardian.address)).to.be.true
        return nonce
    }

    before(async () => {
        [facetRegistryOwner, securityManagerOwner, mockEntryPoint, guardian] = await ethers.getSigners()

        chainId = await getChainId()
        testExecData = await executeCallData(AddressOne, 10, "0x00")
        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        r1Facet = await secp256r1VerificationFacetFixture()
        guardianFacet = await guardianFacetFixture(securityManager)
        lockFacet = await lockFacetFixture(securityManager)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        entryPoint = await entryPointFixture()

        testInvalidK1Facet = await testInvalidSecp256k1VerificationFacetFixture()

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, getSelectors(lockFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))

        lockFacetSelectors = getSelectors(lockFacet).filter((item: string) => item !== lockFacet.interface.getSighash('securityManager'))
        guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== guardianFacet.interface.getSighash('securityManager'))

    })

    beforeEach(async () => {
        owner = createAccountOwner()
        await fund(owner.address)

        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
        accountBarz = await getFacetBarz("AccountFacet", barz)

        mockBarz = await barzFixture(accountFacet, k1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        mockAccountBarz = await getFacetBarz('AccountFacet', mockBarz)
    })

    describe('Setup', () => {
        it('Should revert if verification facet do not have initializeSigner', async () => {
            const salt = 1
            const Factory = await ethers.getContractFactory("BarzFactory")
            const factory = await Factory.deploy(accountFacet.address, entryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
            await expect(factory.createAccount(testInvalidK1Facet.address, owner.publicKey, salt)).to.be.reverted
        })
    })

    describe('# entryPoint', () => {
        it('Should return valid EntryPoint address', async () => {
            expect(await accountBarz.entryPoint()).to.equal(entryPoint.address)
        })
    })
    describe('# nonce', () => {
        it('Should return valid nonce', async () => {
            const nonce = await accountBarz.getNonce()

            expect(nonce).to.equal(0)
        })
    })

    describe('# k1 verification scheme', () => {

        beforeEach(async () => {
            testCounter = await testCounterFixture()
            incrementCall = testCounter.interface.encodeFunctionData('incrementCounter')

            barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)
            guardianBarz = await getFacetBarz('GuardianFacet', barz)
            lockBarz = await getFacetBarz('LockFacet', barz)

            await entryPoint.depositTo(barz.address, {
                value: ethers.utils.parseEther('0.5'),
            })
        })

        describe('# execute', () => {
            it('Should revert if caller is not EntryPoint', async () => {
                await expect(accountBarz.connect(owner).execute(testCounter.address, value, incrementCall, { gasPrice: 1000 })).to.be.revertedWith('account: not from EntryPoint')
            })
            it('Should call destination contract through Account', async () => {
                // Generate function call
                const count = await testCounter.getCount()
                expect(count).to.equal(0)

                const callData = executeCallData(testCounter.address, 0, incrementCall)
                await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(entryPoint, "UserOperationEvent")

                const updatedCount = await testCounter.getCount()
                expect(updatedCount).to.equal(1)
            })


        })
        describe('# executeBatch', () => {
            it('Should revert if caller is not EntryPoint', async () => {
                await expect(accountBarz.connect(owner).executeBatch([testCounter.address], [value], [incrementCall], { gasPrice: 1000 })).to.be.revertedWith('account: not from EntryPoint')
            })

            it("Should batch execute if caller is EntryPoint", async () => {
                const count = await testCounter.getCount();
                expect(count).to.equal(0);
                expect(
                    mockAccountBarz
                        .connect(mockEntryPoint)
                        .executeBatch(
                            [testCounter.address, testCounter.address],
                            [value, value],
                            [incrementCall, incrementCall]
                        )
                );

                const updatedCount = await testCounter.getCount();
                expect(updatedCount).to.equal(2);
            });

            it('Should revert if functions length is greater than destinations length', async () => {
                await expect(mockAccountBarz.connect(mockEntryPoint).executeBatch([testCounter.address], [value, value], [incrementCall, incrementCall])).to.be.revertedWithCustomError(mockAccountBarz, 'AccountFacet__InvalidArrayLength')
            })

            it('Should revert if destinations length is greater than functions length', async () => {
                await expect(mockAccountBarz.connect(mockEntryPoint).executeBatch([testCounter.address, owner.address], [value, value], [incrementCall])).to.be.revertedWithCustomError(mockAccountBarz, 'AccountFacet__InvalidArrayLength')
            })

            it('Should revert if value length is differs with functions length', async () => {
                await expect(mockAccountBarz.connect(mockEntryPoint).executeBatch([testCounter.address, owner.address], [value, value], [incrementCall])).to.be.revertedWithCustomError(mockAccountBarz, 'AccountFacet__InvalidArrayLength')
            })

            it('Should batch Tx using Multi-call', async () => {
                let nonce = 0
                const testToken = await testTokenFixture()
                const guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== guardianFacet.interface.getSighash('securityManager'))
                await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)
                await addFacetSelectorsViaEntryPointOnK1(barz, owner, diamondCutFacet, [diamondCutFacet.interface.getSighash("approveDiamondCut")], entryPoint)

                await addGuardian(owner, guardian, nonce++)
                // State Before Multi-call
                const countBefore = await testCounter.getCount()
                expect(countBefore).to.equal(0)
                const balanceBefore = await testToken.balanceOf(owner.address)
                expect(balanceBefore).to.equal(0)
                await expect(lockBarz.lock()).to.be.revertedWith('Barz: Function does not exist')
                // Counter.incrementCounter -> Token.mint -> Token.Transfer -> diamondCut(approve) (eventually doing diamondCut)
                const mintAmount = 10
                const mintCall = testToken.interface.encodeFunctionData('mint', [owner.address, mintAmount])
                const lockCut = diamondCut(lockFacet.address, FacetCutAction.Add, getSelectors(lockFacet))

                const approveDiamondCutCall = diamondCutFacet.interface.encodeFunctionData("approveDiamondCut", [lockCut])
                await diamondCutBarz.connect(guardian).approveDiamondCut(lockCut)

                const callData = executeBatchCallData([testCounter.address, testToken.address, accountBarz.address], [value, value, value], [incrementCall, mintCall, approveDiamondCutCall])
                await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

                // State After Multi-call
                const countAfter = await testCounter.getCount()
                expect(countAfter).to.equal(1)
                const balanceAfter = await testToken.balanceOf(owner.address)
                expect(balanceAfter).to.equal(mintAmount)
                await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            })
        })
        describe('# validateUserOp', () => {
            it('Should revert if caller is not EntryPoint', async () => {
                const userOp = signUserOpK1Curve(fillUserOpDefaults({
                    sender: owner.address,
                    callGasLimit,
                    verificationGasLimit,
                    maxFeePerGas
                }), owner, entryPoint.address, chainId)
                const opHash = getUserOpHash(userOp, entryPoint.address, chainId)
                // Manually set gasPrice to make Coverage to pass
                await expect(accountBarz.connect(owner).validateUserOp(userOp, opHash, 0, { gasPrice: 1000 })).to.be.revertedWith('account: not from EntryPoint')
            })

            it('Should return failure & emit Locked event if Account is Locked', async () => {
                let nonce = 0

                const guardianCutTx = await addFacetSelectorsViaEntryPointOnK1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)
                const guardianCutReceipt = await guardianCutTx.wait()
                expect(guardianCutReceipt.status).to.equal(1)

                const lockCutTx = await addFacetSelectorsViaEntryPointOnK1(barz, owner, lockFacet, lockFacetSelectors, entryPoint)
                const lockCutReceipt = await lockCutTx.wait()
                expect(lockCutReceipt.status).to.equal(1)

                await addGuardian(owner, guardian, nonce++)
                await fund(barz)

                await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
                expect(await isUserOperationSuccessful(await callFromEntryPointOnK1(entryPoint, barz.address, owner, testExecData))).to.be.false
            })
            it('Should emit Success event for valid signature', async () => {
                const userOp = signUserOpK1Curve(fillUserOpDefaults({
                    sender: barz.address,
                    callGasLimit,
                    verificationGasLimit,
                    maxFeePerGas
                }), owner, entryPoint.address, chainId)
                const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

                await expect(entryPoint.handleOps([userOp], barz.address)).to.emit(accountBarz, "VerificationSuccess").withArgs(userOpHash)
            })
            it('Should emit Failure for invalid signature', async () => {
                const userOp = signUserOpK1Curve(fillUserOpDefaults({
                    sender: barz.address,
                    callGasLimit,
                    verificationGasLimit,
                    maxFeePerGas,
                }), owner, entryPoint.address, chainId)
                userOp.signature = ethers.utils.randomBytes(32)

                await expect(entryPoint.handleOps([userOp], barz.address)).to.be.reverted
            })
        })
    })

    describe('# r1 verification scheme', () => {
        let owner: any
        let ownerBytes: any
        let isR1True = true

        beforeEach(async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            owner = keyPair
            ownerBytes = publicKeyBytes
            testCounter = await testCounterFixture()
            incrementCall = testCounter.interface.encodeFunctionData('incrementCounter')

            barz = await barzFixture(accountFacet, r1Facet, entryPoint, facetRegistry, defaultFallbackHandler, ownerBytes)
            diamondCutBarz = await getFacetBarz('DiamondCutFacet', barz)
            accountBarz = await getFacetBarz("AccountFacet", barz)
            guardianBarz = await getFacetBarz('GuardianFacet', barz)
            lockBarz = await getFacetBarz('LockFacet', barz)

            mockBarz = await barzFixture(accountFacet, r1Facet, mockEntryPoint, facetRegistry, defaultFallbackHandler, ownerBytes)
            mockAccountBarz = await getFacetBarz('AccountFacet', mockBarz)

            await fund(barz.address)
        })

        describe('# execute', () => {
            it('Should revert if caller is not EntryPoint', async () => {
                await expect(accountBarz.execute(testCounter.address, value, incrementCall, { gasPrice: 1000 })).to.be.revertedWith('account: not from EntryPoint')
            })
            it('Should call destination contract through Account', async () => {
                // Generate function call
                const count = await testCounter.getCount()
                expect(count).to.equal(0)

                const callData = executeCallData(testCounter.address, 0, incrementCall)
                await expect(callFromEntryPointOnR1(entryPoint, barz.address, owner, callData)).to.emit(entryPoint, "UserOperationEvent")

                const updatedCount = await testCounter.getCount()
                expect(updatedCount).to.equal(1)
            })
        })
        describe('# executeBatch', () => {
            it('Should revert if caller is not EntryPoint', async () => {
                await expect(accountBarz.executeBatch([testCounter.address], [value], [incrementCall], { gasPrice: 1000 })).to.be.revertedWith('account: not from EntryPoint')
            })

            it('Should revert if functions length is greater than destinations length', async () => {
                await expect(mockAccountBarz.connect(mockEntryPoint).executeBatch([testCounter.address], [value, value], [incrementCall, incrementCall])).to.be.revertedWithCustomError(mockAccountBarz, 'AccountFacet__InvalidArrayLength')
            })

            it('Should revert if destinations length is greater than functions length', async () => {
                await expect(mockAccountBarz.connect(mockEntryPoint).executeBatch([testCounter.address, facetRegistryOwner.address], [value, value], [incrementCall])).to.be.revertedWithCustomError(mockAccountBarz, 'AccountFacet__InvalidArrayLength')
            })

            it('Should revert if value length is differs with functions length', async () => {
                await expect(mockAccountBarz.connect(mockEntryPoint).executeBatch([testCounter.address, facetRegistryOwner.address], [value, value], [incrementCall])).to.be.revertedWithCustomError(mockAccountBarz, 'AccountFacet__InvalidArrayLength')
            })

            it('Should batch Tx using Multi-call', async () => {
                let nonce = 0

                const randomAddress = ethers.Wallet.createRandom().address
                const testToken = await testTokenFixture()
                const guardianFacetSelectors = getSelectors(guardianFacet).filter((item: string) => item !== guardianFacet.interface.getSighash('securityManager'))
                await addFacetSelectorsViaEntryPointOnR1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)
                await addFacetSelectorsViaEntryPointOnR1(barz, owner, diamondCutFacet, [diamondCutFacet.interface.getSighash("approveDiamondCut")], entryPoint)

                await addGuardian(owner, guardian, nonce++, isR1True)
                // State Before Multi-call
                const countBefore = await testCounter.getCount()
                expect(countBefore).to.equal(0)
                const balanceBefore = await testToken.balanceOf(randomAddress)
                expect(balanceBefore).to.equal(0)
                await expect(lockBarz.lock()).to.be.revertedWith('Barz: Function does not exist')
                // Counter.incrementCounter -> Token.mint -> Token.Transfer -> diamondCut approval (eventually doing diamondCut)
                const mintAmount = 10
                const mintCall = testToken.interface.encodeFunctionData('mint', [randomAddress, mintAmount])
                const lockCut = diamondCut(lockFacet.address, FacetCutAction.Add, getSelectors(lockFacet))

                const approveDiamondCutCall = diamondCutFacet.interface.encodeFunctionData("approveDiamondCut", [lockCut])
                await diamondCutBarz.connect(guardian).approveDiamondCut(lockCut)

                const callData = executeBatchCallData([testCounter.address, testToken.address, accountBarz.address], [value, value, value], [incrementCall, mintCall, approveDiamondCutCall])
                await expect(callFromEntryPointOnR1(entryPoint, barz.address, owner, callData)).to.emit(diamondCutBarz, "DiamondCut")

                // State Before Multi-call
                const countAfter = await testCounter.getCount()
                expect(countAfter).to.equal(1)
                const balanceAfter = await testToken.balanceOf(randomAddress)
                expect(balanceAfter).to.equal(mintAmount)
                await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
            })
        })
        describe('# validateUserOp', () => {
            it('Should revert if caller is not EntryPoint', async () => {
                const userOp = signUserOpR1Curve(fillUserOpDefaults({
                    sender: owner.address,
                    callGasLimit,
                    verificationGasLimit,
                    maxFeePerGas
                }), owner, entryPoint.address, chainId)
                const opHash = getUserOpHash(userOp, entryPoint.address, chainId)

                await expect(accountBarz.validateUserOp(userOp, opHash, 0, { gasPrice: 17180044 })).to.be.revertedWith('account: not from EntryPoint')
            })

            it('Should return failure & emit Locked event if Account is Locked', async () => {
                let nonce = 0

                const guardianCutTx = await addFacetSelectorsViaEntryPointOnR1(barz, owner, guardianFacet, guardianFacetSelectors, entryPoint)
                const guardianCutReceipt = await guardianCutTx.wait()
                expect(guardianCutReceipt.status).to.equal(1)

                const lockCutTx = await addFacetSelectorsViaEntryPointOnR1(barz, owner, lockFacet, lockFacet, entryPoint)
                const lockCutReceipt = await lockCutTx.wait()
                expect(lockCutReceipt.status).to.equal(1)
                
                await addGuardian(owner, guardian, nonce++, isR1True)
                await fund(barz)
                await expect(lockBarz.connect(guardian).lock()).to.emit(lockBarz, "Locked")
                expect(await isUserOperationSuccessful(await callFromEntryPointOnR1(entryPoint, barz.address, owner, testExecData))).to.be.false
            })
            it('Should emit Success event for valid signature', async () => {
                const verificationGasLimit = 1000000
                const userOp = signUserOpR1Curve(fillUserOpDefaults({
                    sender: barz.address,
                    callGasLimit,
                    verificationGasLimit,
                    maxFeePerGas
                }), owner, entryPoint.address, chainId)
                const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

                await expect(entryPoint.handleOps([userOp], barz.address)).to.emit(accountBarz, "VerificationSuccess").withArgs(userOpHash)
            })
            it('Should emit Failure for invalid signature', async () => {
                const userOp = signUserOpR1Curve(fillUserOpDefaults({
                    sender: barz.address,
                    callGasLimit,
                    verificationGasLimit,
                    maxFeePerGas,
                }), owner, entryPoint.address, chainId)
                userOp.signature = ethers.utils.randomBytes(32)

                await expect(entryPoint.handleOps([userOp], barz.address)).to.be.reverted
            })
        })
    })
})