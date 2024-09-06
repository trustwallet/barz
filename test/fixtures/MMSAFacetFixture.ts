import { ethers } from 'hardhat'
import { MMSAFacet } from '../../typechain-types'

export async function mmsaFacetFixture(): Promise<MMSAFacet> {
    const factory = await ethers.getContractFactory("MMSAFacet")
    return (await factory.deploy()) as MMSAFacet
}