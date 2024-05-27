import { ethers } from 'hardhat'
import { FacetRegistry } from '../../typechain-types'

export async function facetRegistryFixture(
    owner: string
): Promise<FacetRegistry> {
    const factory = await ethers.getContractFactory("FacetRegistry")
    return (await factory.deploy(owner)) as FacetRegistry
}