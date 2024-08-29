import { ethers } from 'hardhat'
import { MSCAFacet } from '../../typechain-types'

export async function mscaFacetFixture(): Promise<MSCAFacet> {
    const factory = await ethers.getContractFactory("MSCAFacet")
    return (await factory.deploy()) as MSCAFacet
}