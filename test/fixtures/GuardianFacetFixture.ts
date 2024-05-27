import { ethers } from 'hardhat'
import { GuardianFacet, SecurityManager } from '../../typechain-types'

export async function guardianFacetFixture(
    securityManager: SecurityManager
): Promise<GuardianFacet> {
    const factory = await ethers.getContractFactory("GuardianFacet")
    return (await factory.deploy(securityManager.address)) as GuardianFacet
}