import { ethers } from 'hardhat'
import { DiamondCutFacet, SecurityManager } from '../../typechain-types'

export async function diamondCutFacetFixture(
    securityManager: SecurityManager
): Promise<DiamondCutFacet> {
    const factory = await ethers.getContractFactory("DiamondCutFacet")
    return (await factory.deploy(securityManager.address)) as DiamondCutFacet
}