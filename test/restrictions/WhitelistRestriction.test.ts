import { ethers } from 'hardhat'
import { Contract, Wallet } from 'ethers'

import { AccountFacet, Barz, DefaultFallbackHandler, DiamondCutFacet, DiamondLoupeFacet, FacetRegistry, GuardianFacet, Secp256k1VerificationFacet, SecurityManager, TokenReceiverFacet, WhitelistRestriction, WhitelistStorage } from '../../typechain-types'
import { guardianSecurityPeriod, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityWindow, minGuardianSecurityWindow, maxGuardianSecurityWindow, recoveryPeriod, minRecoveryPeriod, maxRecoveryPeriod, lockPeriod, minLockPeriod, maxLockPeriod, approvalValidationPeriod, minApprovalValidationPeriod, maxApprovalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod } from '../utils/helpers'
import { whitelistRestrictionFixture } from '../fixtures/WhitelistRestrictionFixture'
import { AddressZero, createAccountOwner, fund } from '../utils/testutils'
import { expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { IERC1155__factory, IERC20__factory, IERC721__factory } from '../../typechain-types/factories/contracts/interfaces/ERC/Tokens'
import { whitelistStorageFixture } from '../fixtures/WhitelistStorageFixture'

const {
    getSelectors
} = require('../utils/diamond.js')

import { diamondCutFacetFixture } from '../fixtures/DiamondCutFacetFixture'
import { accountFacetFixture } from '../fixtures/AccountFacetFixture'
import { secp256k1VerificationFacetFixture } from '../fixtures/Secp256k1VerificationFacetFixture'
import { barzFixture } from '../fixtures/BarzFixture'
import { setupSecurityManager } from '../utils/setup'
import { facetRegistryFixture } from '../fixtures/FacetRegistryFixture'
import { diamondLoupeFacetFixture } from '../fixtures/DiamondLoupeFacetFixture'
import { guardianFacetFixture } from '../fixtures/GuardianFacetFixture'
import { EntryPoint } from "../../typechain-types/core"
import { callFromEntryPointOnK1, executeCallData } from "../utils/UserOp"
import { entryPointFixture } from "../fixtures/EntryPointFixture"
import { tokenReceiverFacetFixture } from '../fixtures/TokenReceiverFacetFixture'
import { defaultFallbackHandlerFixture } from '../fixtures/DefaultFallbackHandlerFixture'

describe('Whitelist Restriction', () => {
    let wallet: SignerWithAddress
    let whitelistRestriction: WhitelistRestriction
    let whitelistStorage: WhitelistStorage

    let erc20: Contract
    let erc721: Contract
    let erc1155: Contract

    let tokenAddress: string
    let spenderAddress: string

    let defaultFallbackHandler: DefaultFallbackHandler
    let diamondCutFacet: DiamondCutFacet
    let securityManager: SecurityManager
    let facetRegistry: FacetRegistry
    let accountFacet: AccountFacet
    let k1Facet: Secp256k1VerificationFacet
    let diamondLoupeFacet: DiamondLoupeFacet
    let guardianFacet: GuardianFacet
    let tokenReceiverFacet: TokenReceiverFacet
    let entryPoint: EntryPoint
    let securityManagerOwner: SignerWithAddress
    let facetRegistryOwner: SignerWithAddress
    let owner: Wallet
    let barz: Barz
    let nonce = 0

    before(async () => {
        [wallet, securityManagerOwner, facetRegistryOwner] = await ethers.getSigners()

        whitelistStorage = await whitelistStorageFixture()
        whitelistRestriction = await whitelistRestrictionFixture(whitelistStorage)
        tokenAddress = ethers.Wallet.createRandom().address
        spenderAddress = ethers.Wallet.createRandom().address
        erc20 = new ethers.Contract(tokenAddress, IERC20__factory.abi, ethers.provider);
        erc721 = new ethers.Contract(tokenAddress, IERC721__factory.abi, ethers.provider);
        erc1155 = new ethers.Contract(tokenAddress, IERC1155__factory.abi, ethers.provider);

        owner = createAccountOwner()
        await fund(owner.address)

        securityManager = await setupSecurityManager(securityManagerOwner, minGuardianSecurityPeriod, maxGuardianSecurityPeriod, guardianSecurityPeriod,
            minGuardianSecurityWindow, maxGuardianSecurityWindow, guardianSecurityWindow,
            minRecoveryPeriod, maxRecoveryPeriod, recoveryPeriod,
            minLockPeriod, maxLockPeriod, lockPeriod,
            minApprovalValidationPeriod, maxApprovalValidationPeriod, approvalValidationPeriod, minMigrationPeriod, maxMigrationPeriod, migrationPeriod)
        facetRegistry = await facetRegistryFixture(facetRegistryOwner.address)
        accountFacet = await accountFacetFixture()
        k1Facet = await secp256k1VerificationFacetFixture()
        guardianFacet = await guardianFacetFixture(securityManager)
        diamondCutFacet = await diamondCutFacetFixture(securityManager)
        diamondLoupeFacet = await diamondLoupeFacetFixture()
        tokenReceiverFacet = await tokenReceiverFacetFixture()
        entryPoint = await entryPointFixture()
        defaultFallbackHandler = await defaultFallbackHandlerFixture(diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet)

        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(accountFacet.address, getSelectors(accountFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondCutFacet.address, getSelectors(diamondCutFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(diamondLoupeFacet.address, getSelectors(diamondLoupeFacet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(k1Facet.address, getSelectors(k1Facet))
        await facetRegistry.connect(facetRegistryOwner).registerFacetFunctionSelectors(guardianFacet.address, getSelectors(guardianFacet))

        barz = await barzFixture(accountFacet, k1Facet, entryPoint, facetRegistry, defaultFallbackHandler, owner.publicKey)
        await entryPoint.depositTo(barz.address, {
            value: ethers.utils.parseEther('0.5'),
        })
    })

    describe("# constructor", () => {
        it("Should deploy Whitelist Restriction", async () => {
            const whitelistRestriction = await whitelistRestrictionFixture(await whitelistStorageFixture())
            expect(whitelistRestriction.address).to.not.equal(AddressZero)
        })
    })

    describe("# check", () => {
        it("Should reject any address for an empty whitelist", async () => {
            expect(await whitelistRestriction.check(wallet.address, spenderAddress, 1, "0x00")).to.equal(false)
        })

        it("Should accept own address", async () => {
            expect(await whitelistRestriction.connect(wallet).check(wallet.address, wallet.address, 0, "0x00")).to.equal(true)
        })

        it("Should accept whitelisted address", async () => {
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, spenderAddress])
            let callData = executeCallData(whitelistStorage.address, 0, whitelistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(whitelistStorage, "Added").withArgs(spenderAddress)
            expect(await whitelistRestriction.check(barz.address, spenderAddress, 0, "0x00")).to.equal(true)
            const blackListCall = whitelistStorage.interface.encodeFunctionData('blacklistAddress', [barz.address, spenderAddress])
            callData = executeCallData(whitelistStorage.address, 0, blackListCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(whitelistStorage, "Removed").withArgs(spenderAddress)
        })

        it("Should accept transfers to whitelisted address", async () => {
            const whitelistCall = whitelistStorage.interface.encodeFunctionData('whitelistAddress', [barz.address, spenderAddress])
            let callData = executeCallData(whitelistStorage.address, 0, whitelistCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(whitelistStorage, "Added").withArgs(spenderAddress)
            // Regular transfer
            expect(await whitelistRestriction.check(barz.address, spenderAddress, 0, "0x00")).to.equal(true)
            // Regular transfer with a random payload
            expect(await whitelistRestriction.check(barz.address, spenderAddress, 0, ethers.utils.randomBytes(32))).to.equal(true)
            // ERC20 transfer
            const erc20Transfer = erc20.interface.encodeFunctionData("transfer", [spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc20Transfer)).to.equal(true)
            // ERC20 approve
            const erc20Approve = erc20.interface.encodeFunctionData("approve", [spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc20Approve)).to.equal(true)
            // ERC20 increaseAllowance
            const erc20IncreaseAllowance = erc20.interface.encodeFunctionData("increaseAllowance", [spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc20IncreaseAllowance)).to.equal(true)
            // ERC20 decreaseAllowance
            const erc20DecreaseAllowance = erc20.interface.encodeFunctionData("decreaseAllowance", [spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc20DecreaseAllowance)).to.equal(true)
            // ERC721 setApprovalForAll
            const erc721SetApprovalForAll = erc721.interface.encodeFunctionData("setApprovalForAll", [spenderAddress, true]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc721SetApprovalForAll)).to.equal(true)
            // ERC721 transferFrom
            const erc721TransferFrom = erc721.interface.encodeFunctionData("transferFrom", [wallet.address, spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc721TransferFrom)).to.equal(true)
            // ERC721 safeTransferFrom
            const erc721SafeTransferFrom = erc721.interface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [wallet.address, spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc721SafeTransferFrom)).to.equal(true)
            // ERC721 safeTransferFrom (bytes)
            const erc721SafeTransferFromBytes = erc721.interface.encodeFunctionData("safeTransferFrom(address,address,uint256,bytes)", [wallet.address, spenderAddress, 1, "0x00"]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc721SafeTransferFromBytes)).to.equal(true)
            // ERC1155 safeTransferFrom
            const erc1155SafeTransferFrom = erc1155.interface.encodeFunctionData("safeTransferFrom", [wallet.address, spenderAddress, 1, 1, "0x00"]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc1155SafeTransferFrom)).to.equal(true)
            // ERC1155 safeBatchTransferFrom
            const erc1155SafeBatchTransferFrom = erc1155.interface.encodeFunctionData("safeBatchTransferFrom", [wallet.address, spenderAddress, [1], [2], "0x00"])
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc1155SafeBatchTransferFrom)).to.equal(true)

            const blackListCall = whitelistStorage.interface.encodeFunctionData('blacklistAddress', [barz.address, spenderAddress])
            callData = executeCallData(whitelistStorage.address, 0, blackListCall)
            await expect(callFromEntryPointOnK1(entryPoint, barz.address, owner, callData)).to.emit(whitelistStorage, "Removed").withArgs(spenderAddress)
        })

        it("Should reject transfers to non-whitelisted address", async () => {
            // Regular transfer
            expect(await whitelistRestriction.check(barz.address, spenderAddress, 0, "0x00")).to.equal(false)
            // Regular transfer with a random payload
            expect(await whitelistRestriction.check(barz.address, spenderAddress, 0, ethers.utils.randomBytes(32))).to.equal(false)
            // ERC20 transfer
            const erc20Transfer = erc20.interface.encodeFunctionData("transfer", [spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc20Transfer)).to.equal(false)
            // ERC20 approve
            const erc20Approve = erc20.interface.encodeFunctionData("approve", [spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc20Approve)).to.equal(false)
            // ERC20 increaseAllowance
            const erc20IncreaseAllowance = erc20.interface.encodeFunctionData("increaseAllowance", [spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc20IncreaseAllowance)).to.equal(false)
            // ERC20 decreaseAllowance
            const erc20DecreaseAllowance = erc20.interface.encodeFunctionData("decreaseAllowance", [spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc20DecreaseAllowance)).to.equal(false)
            // ERC721 setApprovalForAll
            const erc721SetApprovalForAll = erc721.interface.encodeFunctionData("setApprovalForAll", [spenderAddress, true]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc721SetApprovalForAll)).to.equal(false)
            // ERC721 transferFrom
            const erc721TransferFrom = erc721.interface.encodeFunctionData("transferFrom", [barz.address, spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc721TransferFrom)).to.equal(false)
            // ERC721 safeTransferFrom
            const erc721SafeTransferFrom = erc721.interface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [barz.address, spenderAddress, 1]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc721SafeTransferFrom)).to.equal(false)
            // ERC721 safeTransferFrom (bytes)
            const erc721SafeTransferFromBytes = erc721.interface.encodeFunctionData("safeTransferFrom(address,address,uint256,bytes)", [barz.address, spenderAddress, 1, "0x00"]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc721SafeTransferFromBytes)).to.equal(false)
            // ERC1155 safeTransferFrom
            const erc1155SafeTransferFrom = erc1155.interface.encodeFunctionData("safeTransferFrom", [barz.address, spenderAddress, 1, 1, "0x00"]);
            expect(await whitelistRestriction.check(barz.address, tokenAddress, 0, erc1155SafeTransferFrom)).to.equal(false)
        })
    })

    describe("# _recoverSpender", () => {
        it("Should recover the spender for a regular transfer", async () => {
            const spender = await whitelistRestriction.recoverSpender(spenderAddress, "0x00");
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for a regular transfer with custom payload", async () => {
            const spender = await whitelistRestriction.recoverSpender(spenderAddress, ethers.utils.randomBytes(32));
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC20 transfer", async () => {
            const call = erc20.interface.encodeFunctionData("transfer", [spenderAddress, 1]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC20 approve", async () => {
            const call = erc20.interface.encodeFunctionData("approve", [spenderAddress, 1]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC20 increaseAllowance", async () => {
            const call = erc20.interface.encodeFunctionData("increaseAllowance", [spenderAddress, 1]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC20 decreaseAllowance", async () => {
            const call = erc20.interface.encodeFunctionData("decreaseAllowance", [spenderAddress, 1]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC721 setApprovalForAll", async () => {
            const call = erc721.interface.encodeFunctionData("setApprovalForAll", [spenderAddress, true]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC721 transferFrom", async () => {
            const call = erc721.interface.encodeFunctionData("transferFrom", [wallet.address, spenderAddress, 1]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC721 safeTransferFrom", async () => {
            const call = erc721.interface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [wallet.address, spenderAddress, 1]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC721 safeTransferFrom (bytes)", async () => {
            const call = erc721.interface.encodeFunctionData("safeTransferFrom(address,address,uint256,bytes)", [wallet.address, spenderAddress, 1, "0x00"]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC1155 safeTransferFrom", async () => {
            const call = erc1155.interface.encodeFunctionData("safeTransferFrom", [wallet.address, spenderAddress, 1, 1, "0x00"]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

        it("Should recover the spender for ERC1155 safeBatchTransferFrom", async () => {
            const call = erc1155.interface.encodeFunctionData("safeBatchTransferFrom", [wallet.address, spenderAddress, [1], [1], "0x00"]);
            const spender = await whitelistRestriction.recoverSpender(tokenAddress, call);
            expect(spender).to.be.equal(spenderAddress)
        })

    })
})