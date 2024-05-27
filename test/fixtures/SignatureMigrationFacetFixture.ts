import { ethers } from 'hardhat'
import { SecurityManager, SignatureMigrationFacet } from '../../typechain-types'

export async function signatureMigrationFacetFixture(
    securityManager: SecurityManager
): Promise<SignatureMigrationFacet> {
    const factory = await ethers.getContractFactory("SignatureMigrationFacet")
    return (await factory.deploy(securityManager.address)) as SignatureMigrationFacet
}