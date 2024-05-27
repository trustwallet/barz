import { ethers } from 'hardhat'
import { AccountRecoveryFacet, SecurityManager } from '../../typechain-types'

export async function accountRecoveryFacetFixture(
    securityManager: SecurityManager
): Promise<AccountRecoveryFacet> {
    const factory = await ethers.getContractFactory("AccountRecoveryFacet")
    return (await factory.deploy(securityManager.address)) as AccountRecoveryFacet
}