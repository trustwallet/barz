import { ethers } from 'hardhat'
import { LockFacet, SecurityManager } from '../../typechain-types'

export async function lockFacetFixture(
    securityManager: SecurityManager
): Promise<LockFacet> {
    const factory = await ethers.getContractFactory("LockFacet")
    return (await factory.deploy(securityManager.address)) as LockFacet
}