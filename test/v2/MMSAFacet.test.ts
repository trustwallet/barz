import { ethers } from 'hardhat'
import { BytesLike, Wallet } from 'ethers'

import { AccountFacet, DiamondCutFacet, Barz, Secp256k1VerificationFacet, SecurityManager, FacetRegistry, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler, MSCAFacet, TestToken, GuardianFacet, LockFacet, AccountRecoveryFacet, TestMultiOwnerModule, TestTokenReceiverModule, DefaultFallbackHandlerV2, MMSAFacet, AccountFacetV2, Secp256r1VerificationFacetV2, V2MigrationFacet, TestECDSAValidator, TestCounter, TestMMSAExecutor, TestFallbackHandler, TestGasPolicy, TestRateLimitPolicy, TestECDSASigner } from '../../typechain-types'
import { callFromEntryPointOnR1, executeCallData, fillUserOpDefaults, getUserOpHash, signUserOpK1Curve, signUserOpR1Curve } from '../utils/UserOp'
import { facetRegistryFixture } from '../fixtures/FacetRegistryFixture'
import { generateKeyPair, getChainId, getMockEntryPoint } from '../utils/helpers'
import { barzFixture } from '../fixtures/BarzFixture'
import { AddressOne, AddressZero, CALLTYPE_BATCH, CALLTYPE_DELEGATECALL, CALLTYPE_SINGLE, CALLTYPE_STATIC, construct7579Nonce, createAccountOwner, DEFAULT_PAGE_SIZE, DefaultMissingAmount, EIP712_MMSA_MESSAGE_TYPE, ENABLE_USEROP_FLAG, encode7579Execution, encode7579Mode, EXECTYPE_DEFAULT, EXECTYPE_TRY, EXECUTOR_MODULE_TYPE, FALLBACK_MODULE_TYPE, fund, MMSA_PERMISSION_VALIDATION_TYPE, MMSA_UNUSED_NONCE_BYTES, MMSA_VALIDATOR_SYSTEM, MMSA_VALIDATOR_VALIDATION_TYPE, MODE_DEFAULT, POLICY_MODULE_TYPE, SIGNER_MODULE_TYPE, VALIDATOR_MODULE_TYPE } from '../utils/testutils'
const {
    getSelectors
} = require('../utils/diamond.js')
import { expect } from "chai"
import { getFacetBarz, setupDefaultSecuritManager, addFacetSelectorsViaEntryPointOnR1WithCall } from '../utils/setup'
import { diamondCutFacetFixture } from '../fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from '../fixtures/AccountFacetFixture'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from '../fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from '../fixtures/DiamondLoupeFacetFixture'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { tokenReceiverFacetFixture } from '../fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from '../fixtures/DefaultFallbackHandlerFixture'
import { mscaFacetFixture } from '../fixtures/MSCAFacetFixture'
import { testTokenFixture } from '../fixtures/TestTokenFixture'
import { guardianFacetFixture } from '../fixtures/GuardianFacetFixture'
import { accountRecoveryFacetFixture } from '../fixtures/AccountRecoveryFacetFixture'
import { lockFacetFixture } from '../fixtures/LockFacetFixture'
import { testMultiOwnerModuleFixture } from '../fixtures/TestMultiOwnerModuleFixture'
import { testTokenReceiverModuleFixture } from '../fixtures/TestTokenReceiverModuleFixture'
import { accountFacetV2Fixture } from '../fixtures/AccountFacetV2Fixture'
import { mmsaFacetFixture } from '../fixtures/MMSAFacetFixture'
import { defaultFallbackHandlerV2Fixture } from '../fixtures/DefaultFallbackHandlerV2Fixture'
import { v2MigrationFacetFixture } from '../fixtures/V2MigrationFacetFixture'
import { secp256r1VerificationFacetV2Fixture } from '../fixtures/Secp256r1VerificationFacetV2Fixture'
import { Secp256r1VerificationFacet } from '../../typechain-types/contracts/facets/verification/secp256r1/Secp256r1VerificationFacetV2.sol'
import { secp256r1VerificationFacetFixture } from '../fixtures/Secp256r1VerificationFacetFixture'
import { testECDSAValidatorFixture } from '../fixtures/TestECDSAValidatorFixture'
import { testCounterFixture } from '../fixtures/TestCounterFixture'
import { testMMSAExecutorFixture } from '../fixtures/TestMMSAExecutorFixture'
import { testFallbackHandlerFixture } from '../fixtures/TestFallbackHandlerFixture'
import { keccak } from 'ethereumjs-util'
import { AbiCoder, defaultAbiCoder, solidityPack, zeroPad } from 'ethers/lib/utils'
import { zeroAddress } from 'viem'
import { testGasPolicyFixture } from '../fixtures/TestGasPolicyFixture'
import { testRateLimitPolicyFixture } from '../fixtures/TestRateLimitPolicyFixture'
import { testECDSASignerFixture } from '../fixtures/TestECDSASignerFixture'

describe('MMSA Facet - ERC 7579', () => {
    let diamondCutFacet: DiamondCutFacet
    let diamondLoupeBarz: DiamondLoupeFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let defaultFallbackHandler: DefaultFallbackHandler
    let defaultFallbackHandlerV2: DefaultFallbackHandlerV2
    let accountFacet: AccountFacet
    let accountFacetV2: AccountFacetV2
    let accountBarz: AccountFacet
    let accountBarzV2: AccountFacetV2
    let k1Facet: Secp256k1VerificationFacet
    let r1Facet: Secp256r1VerificationFacet
    let r1FacetV2: Secp256r1VerificationFacetV2
    let accountRecoveryFacet: AccountRecoveryFacet
    let accountRecoveryBarz: AccountRecoveryFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let v2MigrationFacet: V2MigrationFacet
    let v2MigrationBarz: V2MigrationFacet
    let lockBarz: LockFacet
    let lockFacet: LockFacet
    let entryPoint: EntryPoint
    let ModuleOwner: Wallet
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let mockEntryPoint: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let guardianFacet: GuardianFacet
    let guardianBarz: GuardianFacet
    let testECDSAValidator: TestECDSAValidator
    let testECDSASigner: TestECDSASigner
    let testCounter: TestCounter
    let testMMSAExecutor: TestMMSAExecutor
    let testFallbackHandler: TestFallbackHandler
    let testGasPolicy: TestGasPolicy
    let testRateLimitPolicy: TestRateLimitPolicy
    let chainId: number
    const recoveryNonce = 0
    let ownerSeed = 0
    let mscaFacet: MSCAFacet
    let testToken: TestToken
    let testMultiOwnerModule: TestMultiOwnerModule
    let testTokenReceiverModule: TestTokenReceiverModule
    let mscaBarz: MSCAFacet
    let mmsaFacet: MMSAFacet
    let mmsaBarz: MMSAFacet
    let r1KeyPair: any
    let r1PublicKeyBytes: any

    const verificationGasLimit = 1000000
    const callGasLimit = 2000000

    before(async () => {
        [securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        mscaFacet = await mscaFacetFixture()
        testToken = await testTokenFixture()
        testMultiOwnerModule = await testMultiOwnerModuleFixture()
        testTokenReceiverModule = await testTokenReceiverModuleFixture()

        const { keyPair, publicKeyBytes } = generateKeyPair()
        r1KeyPair = keyPair
        r1PublicKeyBytes = publicKeyBytes

        mockEntryPoint = await getMockEntryPoint()
        owner = createAccountOwner(ownerSeed++)
        ModuleOwner = createAccountOwner(ownerSeed++)
        await fund(owner.address)
        await fund(ModuleOwner.address)
        await fund(mockEntryPoint.address)

        chainId = await getChainId()

        testECDSAValidator = await testECDSAValidatorFixture()
        testECDSASigner = await testECDSASignerFixture()
        testFallbackHandler = await testFallbackHandlerFixture()
        testGasPolicy = await testGasPolicyFixture()
        testRateLimitPolicy = await testRateLimitPolicyFixture()

        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        accountFacetV2 = await accountFacetV2Fixture()
        r1Facet = await secp256r1VerificationFacetFixture()
        r1FacetV2 = await secp256r1VerificationFacetV2Fixture()
        guardianFacet = await guardianFacetFixture(securityManager)
        accountRecoveryFacet = await accountRecoveryFacetFixture(securityManager)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        entryPoint = await entryPointFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        lockFacet = await lockFacetFixture(securityManager)
        mmsaFacet = await mmsaFacetFixture()
        mscaFacet = await mscaFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)
        defaultFallbackHandlerV2 = await defaultFallbackHandlerV2Fixture(diamondCutFacet, accountFacetV2, tokenReceiverFacet, diamondLoupeFacet, mmsaFacet, mscaFacet)
        v2MigrationFacet = await v2MigrationFacetFixture(defaultFallbackHandlerV2, r1FacetV2)


        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1Facet.address, getSelectors(r1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(r1FacetV2.address, getSelectors(r1FacetV2))

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountRecoveryFacet.address, getSelectors(accountRecoveryFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(lockFacet.address, getSelectors(lockFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(mmsaFacet.address, getSelectors(mmsaFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(mscaFacet.address, getSelectors(mscaFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(v2MigrationFacet.address, getSelectors(v2MigrationFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(v2MigrationFacet.address, ["0x474e4af5"])

        expect(await facetRegistry.owner()).to.equal(facetRegistryOwner.address)
    })
    beforeEach(async () => {
        barz = await barzFixture(accountFacet, r1Facet, entryPoint, facetRegistry, defaultFallbackHandler, r1PublicKeyBytes)
        accountBarz = await getFacetBarz('AccountFacet', barz)
        accountBarzV2 = await getFacetBarz('AccountFacetV2', barz)
        mmsaBarz = await getFacetBarz('MMSAFacet', barz)
        guardianBarz = await getFacetBarz('GuardianFacet', barz)
        diamondLoupeBarz = await getFacetBarz("DiamondLoupeFacet", barz)
        accountRecoveryBarz = await getFacetBarz('AccountRecoveryFacet', barz)
        mscaBarz = await getFacetBarz("MSCAFacet", barz)
        lockBarz = await getFacetBarz('LockFacet', barz)
        v2MigrationBarz = await getFacetBarz('V2MigrationFacet', barz)
        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
        await fund(barz)
        await addFacetSelectorsViaEntryPointOnR1WithCall(barz, r1KeyPair, v2MigrationFacet, getSelectors(v2MigrationFacet), entryPoint, await accountBarz.getNonce(), barz.address, 0, v2MigrationFacet.interface.encodeFunctionData("migrateToV2"))
        testCounter = await testCounterFixture()
        testMMSAExecutor = await testMMSAExecutorFixture()
    })

    const addMMSAValidatorSystem = async () => {
        const funcCallData = await accountFacetV2.interface.encodeFunctionData("addValidatorSystem", ["0x7579", mmsaFacet.address])
        const callData = executeCallData(barz.address, 0, funcCallData)
        const nonce = await accountBarzV2.nonce(0x00)
        await expect(callFromEntryPointOnR1(entryPoint, barz.address, r1KeyPair, callData, nonce)).to.emit(accountBarzV2, "ValidatorSystemAdded")
    }

    const get7579ModulePrevEntry = async (moduleType: any, mmsaBarz: MMSAFacet, validator: string) => {
        const moduleList = await mmsaBarz.getModulesPaginated(moduleType, AddressOne, DEFAULT_PAGE_SIZE)
        if (moduleList.moduleList.length == 0) {
            return AddressZero
        }
        else if (moduleList.moduleList.length == 1) {
            return AddressOne
        } else {
            for (let i = 0; i < moduleList.moduleList.length; i++) {
                if (moduleList.moduleList[i] == validator)
                    return moduleList.moduleList[i - 1];
            }
        }
    }

    const installMMSAModule = async (mmsaBarz: MMSAFacet, moduleType: number, module: string, initdata: string) => {
        const funcCallData = await mmsaFacet.interface.encodeFunctionData("installModule",[moduleType, module, initdata])
        const callData = executeCallData(barz.address, 0, funcCallData)
        const nonce = await (await ethers.getContractAt("AccountFacetV2", mmsaBarz.address)).nonce(0x00)
        await expect(await callFromEntryPointOnR1(entryPoint, mmsaBarz.address, r1KeyPair, callData, nonce)).to.emit(mmsaBarz, "ModuleInstalled")

        expect(await mmsaBarz.isModuleInstalled(moduleType, module, initdata)).to.be.true
    }

    describe('# addValidatorSystem', () => {
        it("Should add MMSA(ERC-7579) Validator System", async () => {
            const funcCallData = await accountFacetV2.interface.encodeFunctionData("addValidatorSystem", ["0x7579", mmsaFacet.address])
            const callData = executeCallData(barz.address, 0, funcCallData)
            const nonce = await accountBarzV2.nonce(0x00)
            await expect(callFromEntryPointOnR1(entryPoint, barz.address, r1KeyPair, callData, nonce)).to.emit(accountBarzV2, "ValidatorSystemAdded")
        })
    })
    describe('# installModule', () => {
        it("Should install module", async () => {
            await addMMSAValidatorSystem()
    
            const funcCallData = await mmsaFacet.interface.encodeFunctionData("installModule",[VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address])
            const callData = executeCallData(barz.address, 0, funcCallData)
            const nonce = await accountBarzV2.nonce(0x00)
            await expect(await callFromEntryPointOnR1(entryPoint, barz.address, r1KeyPair, callData, nonce)).to.emit(mmsaBarz, "ModuleInstalled")
    
            expect(await mmsaBarz.isModuleInstalled(VALIDATOR_MODULE_TYPE, testECDSAValidator.address, "0x00")).to.be.true
        })
        it.skip("Should revert if locked", async () => {

        })
    })
    describe('# uninstallModule', () => {
        it("Should uninstall module", async () => {
            await addMMSAValidatorSystem()
    
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)

            const preEntry = await get7579ModulePrevEntry(VALIDATOR_MODULE_TYPE, mmsaBarz, testECDSAValidator.address)
            const unInitData = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [preEntry, ethers.utils.hexlify(ethers.utils.toUtf8Bytes(""))])
            const unInstallFuncCallData = await mmsaFacet.interface.encodeFunctionData("uninstallModule",[VALIDATOR_MODULE_TYPE, testECDSAValidator.address, unInitData])
            const unInstallCallData = executeCallData(barz.address, 0, unInstallFuncCallData)
            const nonce = await accountBarzV2.nonce(0x00)
            await expect(await callFromEntryPointOnR1(entryPoint, barz.address, r1KeyPair, unInstallCallData, nonce)).to.emit(mmsaBarz, "ModuleUninstalled")
    
            expect(await mmsaBarz.isModuleInstalled(VALIDATOR_MODULE_TYPE, testECDSAValidator.address, "0x00")).to.be.false
            expect(await testECDSAValidator.isInitialized(barz.address)).to.be.false
        })
        it.skip("Should revert if locked", async () => {

        })
    })
    describe('# validateUserOp', () => {
        it("Should route validation call to 7579 sub-validator system", async () => {
            await addMMSAValidatorSystem()
    
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)

            expect(await mmsaBarz.isModuleInstalled(VALIDATOR_MODULE_TYPE, testECDSAValidator.address, "0x00")).to.be.true
            const mmsaNonceCounter = "0x00"
            const mmsaNonce = construct7579Nonce(MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address, MMSA_VALIDATOR_SYSTEM, mmsaNonceCounter)
            const mmsaFuncCall = testCounter.interface.encodeFunctionData("incrementCounter")
            const mmsaCallData = executeCallData(testCounter.address, 0, mmsaFuncCall)

            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: mmsaNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)

            expect(await testCounter.getCount()).to.equal(0)

            await expect(await entryPoint.handleOps([userOp], AddressOne)).to.emit(testCounter, "CounterIncremented")

            expect(await testCounter.getCount()).to.equal(1)
        })
        it("Should revert if sub-validatory system is non-existent", async () => {
            // Did not add MMSA Validator System. So it reverts.
            // Note that installationof MMSA Module works separately of MMSAValidatorSystem being added.
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)

            const mmsaNonceCounter = "0x00"
            const mmsaNonce = construct7579Nonce(MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address, MMSA_VALIDATOR_SYSTEM, mmsaNonceCounter)
            const mmsaFuncCall = testCounter.interface.encodeFunctionData("incrementCounter")
            const mmsaCallData = executeCallData(testCounter.address, 0, mmsaFuncCall)

            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: mmsaNonce,
                sender: barz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, mockEntryPoint.address, chainId)
            const userOpHash = await getUserOpHash(userOp, entryPoint.address, chainId)

            // Note: entryPoint and mockEntryPoint shares the same address.
            // - entryPoint is the EntryPoint smart contract.
            // - mockEntryPoint is an EOA.
            await expect(accountBarzV2.connect(mockEntryPoint).validateUserOp(userOp, userOpHash, DefaultMissingAmount)).to.revertedWithCustomError(accountBarzV2, "AccountFacetV2__NonExistentValidatorSystem")
        })
        it.skip("Should revert if locked", async () => {

        })
    })
    describe('# execute', () => {
        it("Should execute basic execution", async () => {
            await addMMSAValidatorSystem()
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)

            const mmsaNonceCounter = "0x00"
            const mmsaFuncCall = testCounter.interface.encodeFunctionData("incrementCounter")
            const mmsaNonce = construct7579Nonce(MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address, MMSA_VALIDATOR_SYSTEM, mmsaNonceCounter)
            const execution = [{
                target: testCounter.address,
                value: 0,
                callData: mmsaFuncCall
            }]
            const isBatch = false
            const mmsaCallData = encode7579Execution(isBatch, CALLTYPE_SINGLE, EXECTYPE_DEFAULT, execution)

            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: mmsaNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)

            expect(await testCounter.getCount()).to.equal(0)
            await expect(entryPoint.handleOps([userOp], AddressOne)).to.emit(testCounter, "CounterIncremented")
            expect(await testCounter.getCount()).to.equal(1)
        })
        it("Should execute with try/catch", async () => {
            await addMMSAValidatorSystem()
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)

            const mmsaNonceCounter = "0x00"
            const mmsaFuncCall = testCounter.interface.encodeFunctionData("incrementWithRevert")
            const mmsaNonce = construct7579Nonce(MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address, MMSA_VALIDATOR_SYSTEM, mmsaNonceCounter)
            const execution = [{
                target: testCounter.address,
                value: 0,
                callData: mmsaFuncCall
            }]
            const isBatch = false
            const mmsaCallData = encode7579Execution(isBatch, CALLTYPE_SINGLE, EXECTYPE_TRY, execution)

            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: mmsaNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)

            expect(await testCounter.getCount()).to.equal(0)
            await expect(entryPoint.handleOps([userOp], AddressOne)).to.not.emit(entryPoint, "UserOperationRevertReason")
        })
        it("Should not be able to call Self", async () => {
            await addMMSAValidatorSystem()
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)

            const mmsaNonceCounter = "0x00"
            const mmsaFuncCall = tokenReceiverFacet.interface.encodeFunctionData("onERC721Received", [AddressZero, AddressZero, 1, "0x00"])
            const mmsaNonce = construct7579Nonce(MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address, MMSA_VALIDATOR_SYSTEM, mmsaNonceCounter)
            const execution = [{
                target: mmsaBarz.address,
                value: 0,
                callData: mmsaFuncCall
            }]
            const isBatch = false
            const mmsaCallData = encode7579Execution(isBatch, CALLTYPE_SINGLE, EXECTYPE_DEFAULT, execution)

            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: mmsaNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)

            expect(await testCounter.getCount()).to.equal(0)
            await expect(entryPoint.handleOps([userOp], AddressOne)).to.emit(entryPoint, "UserOperationRevertReason")
        })
        it.skip("Should revert if locked", async () => {

        })
    })
    describe('# mmsaIsValidSignature', () => { 
        it("Should return magic value for valid signature", async () => {
            await addMMSAValidatorSystem()
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)

            const msgHash = keccak(Buffer.from("hello world"))

            const sig = await owner._signTypedData(
                {verifyingContract: barz.address, chainId: await getChainId() },
                EIP712_MMSA_MESSAGE_TYPE,
                {message: msgHash}
            )

            expect(await mmsaBarz.mmsaIsValidSignature(msgHash, testECDSAValidator.address + sig.replace("0x", ""))).to.equal("0x1626ba7e")
        })
        it("Should return dummy value is signature is invalid", async () => {
            await addMMSAValidatorSystem()
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)

            const msgHash = keccak(Buffer.from("hello world"))

            const invalidChainId = 9999123
            const sig = await owner._signTypedData(
                {verifyingContract: barz.address, chainId: invalidChainId },
                EIP712_MMSA_MESSAGE_TYPE,
                {message: msgHash}
            )

            expect(await mmsaBarz.mmsaIsValidSignature(msgHash, testECDSAValidator.address + sig.replace("0x", ""))).to.equal("0xffffffff")
        })
    })
    describe('# executeFromExecutor', () => {
        it("Should execute calldata from executor", async () => {
            await addMMSAValidatorSystem()
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)
            await installMMSAModule(mmsaBarz, EXECUTOR_MODULE_TYPE, testMMSAExecutor.address, "0x00")

            const mmsaNonceCounter = "0x00"
            const mmsaFuncCall = testMMSAExecutor.interface.encodeFunctionData("triggerCounter", [testCounter.address])
            const mmsaNonce = construct7579Nonce(MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address, MMSA_VALIDATOR_SYSTEM, mmsaNonceCounter)
            const execution = [{
                target: testMMSAExecutor.address,
                value: 0,
                callData: mmsaFuncCall
            }]
            const isBatch = false
            const mmsaCallData = encode7579Execution(isBatch, CALLTYPE_SINGLE, EXECTYPE_DEFAULT, execution)

            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: mmsaNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)

            expect(await testCounter.getCount()).to.equal(0)
            await expect(entryPoint.handleOps([userOp], AddressOne)).to.not.emit(entryPoint, "UserOperationRevertReason")
            expect(await testCounter.getCount()).to.equal(1)
        })
        it("Should not be able to call Self", async () => {
            await addMMSAValidatorSystem()
            await installMMSAModule(mmsaBarz, VALIDATOR_MODULE_TYPE, testECDSAValidator.address, owner.address)
            await installMMSAModule(mmsaBarz, EXECUTOR_MODULE_TYPE, testMMSAExecutor.address, "0x00")

            const mmsaNonceCounter = "0x00"
            const mmsaFuncCall = testMMSAExecutor.interface.encodeFunctionData("triggerSelf")
            const mmsaNonce = construct7579Nonce(MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address, MMSA_VALIDATOR_SYSTEM, mmsaNonceCounter)
            const execution = [{
                target: testMMSAExecutor.address,
                value: 0,
                callData: mmsaFuncCall
            }]
            const isBatch = false
            const mmsaCallData = encode7579Execution(isBatch, CALLTYPE_SINGLE, EXECTYPE_DEFAULT, execution)

            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: mmsaNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)

            await expect(entryPoint.handleOps([userOp], AddressOne)).to.emit(entryPoint, "UserOperationRevertReason")
        })
        it.skip("Should revert if locked", async () => {

        })
    })
    describe('# supportsExecutionMode', () => {
        it("Should return valid value", async () => {
            let mode
            // Should be true
            mode = encode7579Mode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT)
            expect(await mmsaBarz.supportsExecutionMode(mode)).to.be.true

            mode = encode7579Mode(CALLTYPE_BATCH, EXECTYPE_DEFAULT)
            expect(await mmsaBarz.supportsExecutionMode(mode)).to.be.true

            mode = encode7579Mode(CALLTYPE_SINGLE, EXECTYPE_TRY)
            expect(await mmsaBarz.supportsExecutionMode(mode)).to.be.true

            mode = encode7579Mode(CALLTYPE_BATCH, EXECTYPE_TRY)
            expect(await mmsaBarz.supportsExecutionMode(mode)).to.be.true

            // Should be false
            mode = encode7579Mode(CALLTYPE_STATIC, EXECTYPE_DEFAULT)
            expect(await mmsaBarz.supportsExecutionMode(mode)).to.be.false

            mode = encode7579Mode(CALLTYPE_DELEGATECALL, EXECTYPE_DEFAULT)
            expect(await mmsaBarz.supportsExecutionMode(mode)).to.be.false

            mode = encode7579Mode(CALLTYPE_STATIC, EXECTYPE_TRY)
            expect(await mmsaBarz.supportsExecutionMode(mode)).to.be.false

            mode = encode7579Mode(CALLTYPE_DELEGATECALL, EXECTYPE_TRY)
            expect(await mmsaBarz.supportsExecutionMode(mode)).to.be.false
        })
    })
    describe('# mmsaFallback', () => {
        it("Should execute fallback handler", async () => {
            const fallbackSelector = testFallbackHandler.interface.getSighash("onGenericFallback")
            await installMMSAModule(mmsaBarz, FALLBACK_MODULE_TYPE, testFallbackHandler.address, fallbackSelector + CALLTYPE_SINGLE.replace("0x", ""))

            expect(await mmsaBarz.isModuleInstalled(FALLBACK_MODULE_TYPE, testFallbackHandler.address, fallbackSelector)).to.be.true

            const fallbackCalldata = testFallbackHandler.interface.encodeFunctionData("onGenericFallback", [mmsaBarz.address, 0, "0x00"])
            expect(await mmsaBarz.mmsaFallback(fallbackCalldata)).to.emit(testFallbackHandler, "GenericFallbackCalled").withArgs(mmsaBarz.address, 0, "0x00")
        })
        it("Should return valid data", async () => {
            const fallbackSelector = testFallbackHandler.interface.getSighash("longReturnFunction")
            await installMMSAModule(mmsaBarz, FALLBACK_MODULE_TYPE, testFallbackHandler.address, fallbackSelector + CALLTYPE_STATIC.replace("0x", ""))

            expect(await mmsaBarz.isModuleInstalled(FALLBACK_MODULE_TYPE, testFallbackHandler.address, fallbackSelector)).to.be.true

            const fallbackCalldata = testFallbackHandler.interface.encodeFunctionData("longReturnFunction")
            const expectedResult = testFallbackHandler.interface.encodeFunctionData("onGenericFallback", [AddressOne, 1111, "0x1234"])
            expect(await mmsaBarz.mmsaStaticFallback(fallbackCalldata)).to.equal(expectedResult)
        })
    })
    describe('# installValidations', () => {
        it("Should install validator + execute", async () => {
            await addMMSAValidatorSystem()

            const validationId = solidityPack(["bytes1", "bytes20"], [MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address])
            const validationData = solidityPack(["bytes"], [owner.address])
            const callData = mmsaBarz.interface.encodeFunctionData("installValidations", [[validationId], [validationData]])

            const nonce = await accountBarzV2.nonce(0x00)
            // Should install Module from installValidations
            await expect(await callFromEntryPointOnR1(entryPoint, mmsaBarz.address, r1KeyPair, callData, nonce)).to.emit(mmsaBarz, "ModuleInstalled")

            // Execute using the validator installed from installValidations()
            expect(await mmsaBarz.isModuleInstalled(VALIDATOR_MODULE_TYPE, testECDSAValidator.address, "0x00")).to.be.true
            const mmsaNonceCounter = "0x00"
            const mmsaNonce = construct7579Nonce(MMSA_VALIDATOR_VALIDATION_TYPE, testECDSAValidator.address, MMSA_VALIDATOR_SYSTEM, mmsaNonceCounter)
            const mmsaFuncCall = testCounter.interface.encodeFunctionData("incrementCounter")
            const mmsaCallData = executeCallData(testCounter.address, 0, mmsaFuncCall)

            const userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: mmsaNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)

            expect(await testCounter.getCount()).to.equal(0)

            await expect(await entryPoint.handleOps([userOp], AddressOne)).to.emit(testCounter, "CounterIncremented")

            expect(await testCounter.getCount()).to.equal(1)
        })
        it("Should install permission + execute", async () => {
            await addMMSAValidatorSystem()

            const testPermissionId = "0x12345678"
            // validationId = 21 bytes
            const validationId = solidityPack(["bytes1", "bytes4", "bytes16"], [MMSA_PERMISSION_VALIDATION_TYPE, testPermissionId, MMSA_UNUSED_NONCE_BYTES])

            const allowedGasAmount = 1000000000000
            const gasPolicyData = defaultAbiCoder.encode(["uint256", "bool", "address"], [allowedGasAmount, false, zeroAddress])
            const gasPolicyValidationData = solidityPack(["bytes"], [gasPolicyData])

            const gasPermissionData = solidityPack(["bytes2", "address", "bytes"], [ENABLE_USEROP_FLAG, testGasPolicy.address, gasPolicyValidationData])
            const delay = zeroPad("0x10", 6)
            const count = zeroPad("0x01", 6)
            const startAt = zeroPad("0x00", 6)
            const rateLimitPolicyData = solidityPack(["bytes6", "bytes6", "bytes6"], [delay, count, startAt])
            const rateLimitPolicyValidationData = solidityPack(["bytes"], [rateLimitPolicyData])
            const rateLimitPermissionData = solidityPack(["bytes2", "address", "bytes"], [ENABLE_USEROP_FLAG, testRateLimitPolicy.address, rateLimitPolicyValidationData])
            
            const initData = owner.address
            const ecdsaSignerValidationData = solidityPack(["address"], [initData])
            const ecdsaSignerPermissionData = solidityPack(["bytes2", "address", "bytes"], [ENABLE_USEROP_FLAG, testECDSASigner.address, ecdsaSignerValidationData])

            const concatenatedData = defaultAbiCoder.encode(["bytes[]"], [[gasPermissionData, rateLimitPermissionData, ecdsaSignerPermissionData]])

            const callData = mmsaBarz.interface.encodeFunctionData("installValidations", [[validationId], [concatenatedData]])

            const nonce = await accountBarzV2.nonce(0x00)
            // Should install Module from installValidations
            const installTx = await callFromEntryPointOnR1(entryPoint, mmsaBarz.address, r1KeyPair, callData, nonce)
            await expect(installTx).to.emit(mmsaBarz, "ModuleInstalled").withArgs(POLICY_MODULE_TYPE, testGasPolicy.address)
            await expect(installTx).to.emit(mmsaBarz, "ModuleInstalled").withArgs(POLICY_MODULE_TYPE, testRateLimitPolicy.address)
            await expect(installTx).to.emit(mmsaBarz, "ModuleInstalled").withArgs(SIGNER_MODULE_TYPE, testECDSASigner.address)

            const mmsaFuncCall = testCounter.interface.encodeFunctionData("incrementCounter")
            const mmsaCallData = executeCallData(testCounter.address, 0, mmsaFuncCall)

            const permissionNonce = construct7579Nonce(MMSA_PERMISSION_VALIDATION_TYPE, testPermissionId, MMSA_VALIDATOR_SYSTEM)
            let userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: permissionNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)
            
            expect(await testCounter.getCount()).to.equal(0)
            await entryPoint.handleOps([userOp], AddressOne)
            expect(await testCounter.getCount()).to.equal(1)

            const secondPermissionNonce = construct7579Nonce(MMSA_PERMISSION_VALIDATION_TYPE, testPermissionId, MMSA_VALIDATOR_SYSTEM, "0x02")
            userOp = signUserOpK1Curve(fillUserOpDefaults({
                nonce: secondPermissionNonce,
                sender: mmsaBarz.address,
                callData: mmsaCallData,
                callGasLimit,
                verificationGasLimit
            }), owner, entryPoint.address, chainId)

            // Policy should fail with RateLimitPolicy, because the rate was set to be 1.
            // Which means that it will revert after 1 successful UserOp.
            // Internally, it reverts with ValidationManager__PolicyFailed(RateLimitPolicy.address)
            await expect(entryPoint.handleOps([userOp], AddressOne)).to.be.reverted
        })
    })
})