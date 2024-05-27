import { ethers } from 'hardhat'
import { FacetRegistry } from '../../typechain-types'
import elliptic from 'elliptic'
import { keccak256 } from '@ethersproject/keccak256'

const {
    getSelectors,
    FacetCutAction
} = require('./diamond.js')

export const getChainId = async () => {
    return await ethers.provider.getNetwork().then(net => net.chainId)
}

export const addressToBytes = (address: string) => {
    return ethers.utils.hexZeroPad(address, 20)
}

export const deployAndDiamondCut = async (facetNames: Array<string>, facetRegistry: FacetRegistry) => {
    const cut = []
    for (const FacetName of facetNames) {
        const Facet = await ethers.getContractFactory(FacetName)
        const facet = await Facet.deploy()
        await facet.deployed()
        await facetRegistry.registerFacetFunctionSelectors(facet.address, getSelectors(facet))
        cut.push({
            facetAddress: facet.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(facet)
        })
    }
    return cut
}

export const diamondCut = (facetAddress: string, action: any, selectors: any) => {
    const diamondCut = []
    diamondCut.push({
        facetAddress: facetAddress,
        action: action,
        functionSelectors: Array.isArray(selectors) ? selectors : getSelectors(selectors)
    })
    return diamondCut
}

export const increaseBlockTime = async (seconds: number) => {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    await ethers.provider.send("evm_mine", [blockBefore.timestamp + seconds]) 
}
export const guardianSecurityPeriod = 60 * 60 * 24 * 3 // 3 day
export const minGuardianSecurityPeriod = guardianSecurityPeriod / 2
export const maxGuardianSecurityPeriod = guardianSecurityPeriod * 2
export const guardianSecurityWindow = 60 * 60 * 24 // 1 day
export const minGuardianSecurityWindow = guardianSecurityWindow / 2
export const maxGuardianSecurityWindow = guardianSecurityWindow * 2
export const recoveryPeriod = 60 * 60 * 24 * 8.5 // 5 day
export const minRecoveryPeriod = recoveryPeriod / 2
export const maxRecoveryPeriod = recoveryPeriod * 2
export const lockPeriod = 60 * 60 * 24 * 18 // 18 day
export const minLockPeriod = lockPeriod / 2
export const maxLockPeriod = lockPeriod * 2
export const approvalValidationPeriod = 60 * 60 * 24 // 1 day
export const minApprovalValidationPeriod = approvalValidationPeriod / 2
export const maxApprovalValidationPeriod = approvalValidationPeriod * 2
export const migrationPeriod = 60 * 60 * 3 // 3 hours
export const minMigrationPeriod = migrationPeriod / 2
export const maxMigrationPeriod = migrationPeriod * 2
export const chainId = 3604

export enum FacetCutActionEnum {
  Add,
  Replace,
  Remove
}

export interface FacetCut {
  facetAddress: string;
  action: FacetCutActionEnum;
  functionSelectors: string[];
}

export const facetCutType = `tuple(address facetAddress, uint8 action, bytes4[] functionSelectors)[]`;

export const getBlockTimestamp = async () => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    const timestamp = block.timestamp;
    return timestamp
}

export const getEthSignMessageHash = (hash: string) => {
    const prefix = `\x19Ethereum Signed Message:\n32`;
    const messageHash = keccak256(ethers.utils.solidityPack(['string', 'bytes32'], [prefix, hash]));
    return messageHash
}

export type generatedKey = {
    keyPair: any,
    publicKeyBytes: any,
    keyX: any,
    keyY: any,
    facetOwnerKey: any
}

export function generateKeyPair (): generatedKey {
    const ec = new elliptic.ec('p256')
    let keyPair = ec.genKeyPair()
    let publicKeyBytes: string = "0x04" + keyPair.getPublic().getX().toString('hex')+ keyPair.getPublic().getY().toString('hex')
    for (let i = 0; publicKeyBytes.length % 2 !== 0; i++) {
        keyPair = ec.genKeyPair()
        publicKeyBytes = "0x04" + keyPair.getPublic().getX().toString('hex')+ keyPair.getPublic().getY().toString('hex')
    }
    const keyX = keyPair.getPublic().getX()
    const keyY = keyPair.getPublic().getY()
    const facetOwnerKey = "0x" + keyX.toString('hex') + keyY.toString('hex')
    
    return {
        keyPair,
        publicKeyBytes,
        keyX,
        keyY,
        facetOwnerKey
    }
}

export const isUserOperationSuccessful = async (tx: any) => {
    const receipt = await tx.wait()
    const event = receipt.events?.filter((e:any) => e.event === "UserOperationEvent")[0];
    return event?.args?.success
}