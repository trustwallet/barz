import { ethers } from 'hardhat'
import { Wallet, BigNumber } from 'ethers'
import {
    defaultAbiCoder,
    concat,
    hexZeroPad,
    hexlify,
    sha256,
    toUtf8Bytes
} from 'ethers/lib/utils'
const {
    getSelectors
} = require('./utils/diamond.js')
import { AccountFacet, DiamondCutFacet, Barz, Secp256r1VerificationFacet, SecurityManager, FacetRegistry, DiamondLoupeFacet, TokenReceiverFacet, DefaultFallbackHandler } from '../typechain-types'
import { fillUserOpDefaults, getUserOpHash, signUserOpR1Curve } from './utils/UserOp'
import { getChainId, generateKeyPair, guardianSecurityPeriod, guardianSecurityWindow, recoveryPeriod, lockPeriod, approvalValidationPeriod, migrationPeriod, getEthSignMessageHash } from './utils/helpers'

import { UserOperation } from './utils/UserOperation'
import { diamondCutFacetFixture } from './fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from './fixtures/AccountFacetFixture'
import { secp256r1VerificationFacetFixture } from './fixtures/Secp256r1VerificationFacetFixture'
import { facetRegistryFixture } from './fixtures/FacetRegistryFixture'
import { barzFixture } from './fixtures/BarzFixture'
import { createAccountOwner, fund, verificationGasLimit, maxFeePerGas, generateExampleMsgHash} from './utils/testutils'
import base64url from 'base64url'

import { expect } from "chai"
import { getFacetBarz, setupContracts, addFacetSelectorsViaEntryPointOnR1, setupDefaultSecuritManager } from './utils/setup'
import { EntryPoint } from '../typechain-types/core'
import { entryPointFixture } from './fixtures/EntryPointFixture'
import { diamondLoupeFacetFixture } from './fixtures/DiamondLoupeFacetFixture'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { tokenReceiverFacetFixture } from './fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from './fixtures/DefaultFallbackHandlerFixture'

const callGasLimit = 200000

describe('Secp256r1 Verification Facet', () => {
    let signer: Wallet
    let chainId: number
    let entryPoint: EntryPoint
    let defaultFallbackHandler: DefaultFallbackHandler
    let userOp: UserOperation
    let r1Barz: Secp256r1VerificationFacet
    let barz: Barz
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let diamondLoupeFacet: DiamondLoupeFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let accountFacet: AccountFacet
    let diamondCutFacet: DiamondCutFacet
    let secp256r1VerificationFacet: Secp256r1VerificationFacet
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    const clientDataJSONPre = '{"type":"webauthn.get","challenge":"'
    const clientDataJSONPost = '","origin":"https://webauthn.me","crossOrigin":false}'
    const authenticatorData = concat([
        hexZeroPad("0xf95bc73828ee210f9fd3bbe72d97908013b0a3759e9aea3d0ae318766cd2e1ad", 32),
        hexlify("0x0500000000")
    ])

    before(async () => {
        [securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()
        signer = createAccountOwner()
        await fund(signer.address)
        chainId = await getChainId()
        entryPoint = await entryPointFixture()
    })
    const setupR1Barz = async (keyPair: any, publicKeyBytes: any) => {
        securityManager = await setupDefaultSecuritManager(securityManagerOwner)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        accountFacet = await accountFacetFixture()
        secp256r1VerificationFacet = await secp256r1VerificationFacetFixture()
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(secp256r1VerificationFacet.address, getSelectors(secp256r1VerificationFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        barz = await barzFixture(accountFacet, secp256r1VerificationFacet, entryPoint, facetRegistry, defaultFallbackHandler, publicKeyBytes)

        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })

        r1Barz = await getFacetBarz("Secp256r1VerificationFacet", barz)
        await addFacetSelectorsViaEntryPointOnR1(barz, keyPair, secp256r1VerificationFacet, [secp256r1VerificationFacet.interface.getSighash("validateSignature"), secp256r1VerificationFacet.interface.getSighash("isValidKeyType"), secp256r1VerificationFacet.interface.getSighash("validateOwnerSignatureSelector"), secp256r1VerificationFacet.interface.getSighash("initializeSigner"), secp256r1VerificationFacet.interface.getSighash("uninitializeSigner")], entryPoint) // validateSignature()
        return r1Barz
    }
    describe("# initializeSigner", () => {
        it("Should revert if already initialized", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)

            await expect(r1Barz.initializeSigner(publicKeyBytes)).to.be.revertedWithCustomError(r1Barz, "LibAppStorage__SignerMustBeUninitialized")
        })
    })
    describe("# uninitializeSigner", () => {
        it("Should revert uninitialization if not middle of signature migration", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()

            await setupR1Barz(keyPair, publicKeyBytes)
            r1Barz = await getFacetBarz("Secp256r1VerificationFacet", barz)
            await expect(r1Barz.initializeSigner(publicKeyBytes)).to.be.revertedWithCustomError(r1Barz, "LibAppStorage__SignerMustBeUninitialized")
        })
    })
    describe("# validateOwnerSignature", () => {
        it("Should verify valid secp256r1 (passkeys) signature, which is pre-signed using https://webauthn.me", async () => {
            const chainId = 97
            const callGasLimit = 200000
            const verificationGasLimit = 100000
            const maxFeePerGas = 1
            const nonce = 0
            const entryPoint = await ethers.getImpersonatedSigner("0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789")
            const publicKey = ["c1a5218eec6bbdbf32fca43a9dbc4ad4bde65de9b3f20302149e351c7a5405e9", "cdcebc06a30a01550357bea4a5cf4b84e2f6cd9cf8613b61838c7c0a8149432f"]
            const publicKeyBytes = "0x04" + publicKey.join("")
            const { barz } = await setupContracts(facetRegistryOwner, securityManagerOwner, entryPoint, publicKeyBytes, guardianSecurityPeriod, guardianSecurityWindow, recoveryPeriod, lockPeriod, approvalValidationPeriod, migrationPeriod, true)
            r1Barz = await getFacetBarz("Secp256r1VerificationFacet", barz)

            const signature = ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes', 'string', 'string'],
                [
                    ethers.BigNumber.from("0x7f9576ce011a928c5d595b7ad8ce62aed73df49755c24f0d107c0f16988b27c7"),
                    ethers.BigNumber.from("0x9430dd40f06e792938e7c0cbfcaf64101c552923e0cd7a897b4f9e83330bb695"),
                    ethers.utils.concat([
                        ethers.utils.hexZeroPad("0xf95bc73828ee210f9fd3bbe72d97908013b0a3759e9aea3d0ae318766cd2e1ad", 32),
                        ethers.utils.hexlify("0x0500000000")
                    ]),
                    '{"type":"webauthn.get","challenge":"',
                    '","origin":"https://webauthn.me","crossOrigin":false}'
                ]
            )

            userOp = fillUserOpDefaults({
                sender: signer.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas,
                nonce,
                signature
            })

            const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            expect(await r1Barz.validateOwnerSignature(userOp, userOpHash)).to.equal(0)
            expect(await r1Barz.validateOwnerSignature(userOp, userOpHash.slice(0, -6) + '000000')).to.equal(1)
        })

        it("Should verify valid secp256r1 (passkeys) signature, which is generated on fly", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            
            const { barz } = await setupContracts(facetRegistryOwner, securityManagerOwner, entryPoint, publicKeyBytes, guardianSecurityPeriod, guardianSecurityWindow, recoveryPeriod, lockPeriod, approvalValidationPeriod, migrationPeriod, true)
            r1Barz = await getFacetBarz("Secp256r1VerificationFacet", barz)

            const userOp = signUserOpR1Curve(fillUserOpDefaults({
                sender: barz.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas
            }), keyPair, entryPoint.address, chainId)
            const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            expect(await r1Barz.validateOwnerSignature(userOp, userOpHash)).to.equal(0)
            expect(await r1Barz.validateOwnerSignature(userOp, userOpHash.slice(0, -6) + '000000')).to.equal(1)
        })
        it("Should fail r = 0 and s = 0 signature verification from Vitalik's address", async () => {
            const chainId = 31337
            const entryPoint = await ethers.getImpersonatedSigner("0x70997970C51812dc3A010C7d01b50e0d17dc79C8")
            const publicKey = ["a620a8cfc88fd062b11eab31663e56cad95278bef612959be214d98779f645b8", "4e7b905b42917570148b0432f99ba21f2e7eebe018cbf837247e38150a89f771"]
            const publicKeyBytes = "0x04" + publicKey.join("")
            const { barz } = await setupContracts(facetRegistryOwner, securityManagerOwner, entryPoint, publicKeyBytes, guardianSecurityPeriod, guardianSecurityWindow, recoveryPeriod, lockPeriod, approvalValidationPeriod, migrationPeriod, true)
            r1Barz = await getFacetBarz("Secp256r1VerificationFacet", barz)
    
            const signature = ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes', 'string', 'string'],
                [
                    ethers.BigNumber.from("0"),
                    ethers.BigNumber.from("0"),
                    ethers.utils.concat([
                        ethers.utils.hexZeroPad("0xf95bc73828ee210f9fd3bbe72d97908013b0a3759e9aea3d0ae318766cd2e1ad", 32),
                        ethers.utils.hexlify("0x0500000000")
                    ]),
                    '{"type":"webauthn.get","challenge":"',
                    '","origin":"https://webauthn.me","crossOrigin":false}'
                ]
            )
    
            userOp = fillUserOpDefaults({
                sender: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas,
                signature
            })
            const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)
    
            // 0 equals success, 1 equals SIG_VALIDATION_FAILED.
            expect(await r1Barz.validateOwnerSignature(userOp, userOpHash)).to.equal(1)
            expect(await r1Barz.validateOwnerSignature(userOp, userOpHash.slice(0, -6) + '000000')).to.equal(1)
        })
        it("Should fail valid (passkeys) signature validation if public key in not a point in elliptic curve", async () => {
            const chainId = 97
            const callGasLimit = 200000
            const verificationGasLimit = 100000
            const maxFeePerGas = 1
            const nonce = 0
            const entryPoint = await ethers.getImpersonatedSigner("0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789")
            const publicKey = ["c1a5218eec6bbdbf32fca43a9dbc4ad4bde65de9b3f20302149e351c7a540000", "cdcebc06a30a01550357bea4a5cf4b84e2f6cd9cf8613b61838c7c0a8149432f"]
            const publicKeyBytes = "0x04" + publicKey.join("")
            const { barz } = await setupContracts(facetRegistryOwner, securityManagerOwner, entryPoint, publicKeyBytes, guardianSecurityPeriod, guardianSecurityWindow, recoveryPeriod, lockPeriod, approvalValidationPeriod, migrationPeriod, true)
            r1Barz = await getFacetBarz("Secp256r1VerificationFacet", barz)

            const signature = ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes', 'string', 'string'],
                [
                    ethers.BigNumber.from("0x7f9576ce011a928c5d595b7ad8ce62aed73df49755c24f0d107c0f16988b27c7"),
                    ethers.BigNumber.from("0x9430dd40f06e792938e7c0cbfcaf64101c552923e0cd7a897b4f9e83330bb695"),
                    ethers.utils.concat([
                        ethers.utils.hexZeroPad("0xf95bc73828ee210f9fd3bbe72d97908013b0a3759e9aea3d0ae318766cd2e1ad", 32),
                        ethers.utils.hexlify("0x0500000000")
                    ]),
                    '{"type":"webauthn.get","challenge":"',
                    '","origin":"https://webauthn.me","crossOrigin":false}'
                ]
            )

            userOp = fillUserOpDefaults({
                sender: signer.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas,
                nonce,
                signature,
            })
            const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            expect(await r1Barz.validateOwnerSignature(userOp, userOpHash)).to.equal(1)
            expect(await r1Barz.validateOwnerSignature(userOp, userOpHash.slice(0, -6) + '000000')).to.equal(1)
        })
    })

    describe("# validateSignature", async () => {
        it("Should return 0 for a valid signature", async () => {
            const { keyPair, publicKeyBytes, keyX, keyY } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)

            const userOp = signUserOpR1Curve(fillUserOpDefaults({
                sender: barz.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas
            }), keyPair, entryPoint.address, chainId)
            const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            expect(await r1Barz.validateSignature(userOp, userOpHash, [BigNumber.from("0x" + keyX.toString('hex')), BigNumber.from("0x" + keyY.toString('hex'))])).to.equal(0)
        })
        it("Should return 1 for an invalid signature", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            const invalidKey = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)

            const userOp = signUserOpR1Curve(fillUserOpDefaults({
                sender: barz.address,
                callGasLimit,
                verificationGasLimit,
                maxFeePerGas
            }), keyPair, entryPoint.address, chainId)
            const userOpHash = getUserOpHash(userOp, entryPoint.address, chainId)

            // 0 equals success, 1 equals SIG_VALIDATION_FAILED
            expect(await r1Barz.validateSignature(userOp, userOpHash, [BigNumber.from("0x" + invalidKey.keyX.toString('hex')), BigNumber.from("0x" + invalidKey.keyY.toString('hex'))])).to.equal(1)
        })
    })
    describe("# isValidKeyType", async () => {
        it("Should return true for a valid key length", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)
            expect(await r1Barz.isValidKeyType(publicKeyBytes)).to.equal(true)
        })
        it("Should return false for an invalid key length", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)
            expect(await r1Barz.isValidKeyType(publicKeyBytes.slice(0, 6))).to.equal(false)
        })

        it("Should return false for an invalid key type", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)
            expect(await r1Barz.isValidKeyType("0x02" + publicKeyBytes.substring(4))).to.equal(false)
        })
    })
    describe("# owner", async () => {
        it("Should return valid owner public key", async () => {
            const { keyPair, publicKeyBytes, facetOwnerKey } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)
            const owner = await r1Barz.owner()
            expect(owner).to.equal(facetOwnerKey)
        })
    })
    describe("# validateOwnerSignatureSelector", async () => {
        it("Should return valid selector", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)
            expect(await r1Barz.validateOwnerSignatureSelector()).to.equal(r1Barz.interface.getSighash('validateOwnerSignature'))
        })
    })
    describe("EIP-1271 # isValidSignature", async () => {
        it("Should return EIP-1271 magic value if signature is valid(signMessage)", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)

            const msgHash = generateExampleMsgHash()
            const ethSignMsgHash = getEthSignMessageHash(msgHash)
            
            const opHashBase64 = base64url.encode(concat([ethSignMsgHash]))
            const clientDataJSON = clientDataJSONPre + opHashBase64 + clientDataJSONPost

            const clientHash = sha256(toUtf8Bytes(clientDataJSON)).toString()
            const authenticatorDataHEX = hexlify(authenticatorData)
            const sigHash = sha256(concat([authenticatorDataHEX, clientHash])).slice(2)
            const signature = keyPair.sign(sigHash)
            const signedMessage = defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes', 'string', 'string'],
                [
                    BigNumber.from("0x" + signature.r.toString('hex')),
                    BigNumber.from("0x" + signature.s.toString('hex')),
                    authenticatorData,
                    clientDataJSONPre,
                    clientDataJSONPost
                ]
            )

            expect(await r1Barz.isValidSignature(ethSignMsgHash, signedMessage)).to.equal("0x1626ba7e")
        })
        it("Should return EIP-1271 magic value if signature is valid(rawHash)", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)

            const msgHash = generateExampleMsgHash()
            
            const opHashBase64 = base64url.encode(concat([msgHash]))
            const clientDataJSON = clientDataJSONPre + opHashBase64 + clientDataJSONPost

            const clientHash = sha256(toUtf8Bytes(clientDataJSON)).toString()
            const authenticatorDataHEX = hexlify(authenticatorData)
            const sigHash = sha256(concat([authenticatorDataHEX, clientHash])).slice(2)
            const signature = keyPair.sign(sigHash)
            const signedMessage = defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes', 'string', 'string'],
                [
                    BigNumber.from("0x" + signature.r.toString('hex')),
                    BigNumber.from("0x" + signature.s.toString('hex')),
                    authenticatorData,
                    clientDataJSONPre,
                    clientDataJSONPost
                ]
            )

            expect(await r1Barz.isValidSignature(msgHash, signedMessage)).to.equal("0x1626ba7e")
        })
        it("Should return dummy value when signature is invalid", async () => {
            const { keyPair, publicKeyBytes } = generateKeyPair()
            const invalidKey = generateKeyPair()
            await setupR1Barz(keyPair, publicKeyBytes)

            const msgHash = generateExampleMsgHash()
            const ethSignMsgHash = getEthSignMessageHash(msgHash)

            const opHashBase64 = base64url.encode(concat([ethSignMsgHash]))
            const clientDataJSON = clientDataJSONPre + opHashBase64 + clientDataJSONPost

            const clientHash = sha256(toUtf8Bytes(clientDataJSON)).toString()
            const authenticatorDataHEX = hexlify(authenticatorData)
            const sigHash = sha256(concat([authenticatorDataHEX, clientHash])).slice(2)
            // Signing with invalid key pair
            const signature = invalidKey.keyPair.sign(sigHash)
            const signedMessage = defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes', 'string', 'string'],
                [
                    BigNumber.from("0x" + signature.r.toString('hex')),
                    BigNumber.from("0x" + signature.s.toString('hex')),
                    authenticatorData,
                    clientDataJSONPre,
                    clientDataJSONPost
                ]
            )

            expect(await r1Barz.isValidSignature(ethSignMsgHash, signedMessage)).to.equal("0xffffffff")
        })
    })
})