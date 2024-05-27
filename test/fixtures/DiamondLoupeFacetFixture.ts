import { ethers } from 'hardhat'
import { DiamondLoupeFacet } from '../../typechain-types'

export async function diamondLoupeFacetFixture(): Promise<DiamondLoupeFacet> {
    const factory = await ethers.getContractFactory("DiamondLoupeFacet")
    return (await factory.deploy()) as DiamondLoupeFacet
}