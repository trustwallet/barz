import { ethers } from 'hardhat'
import { MultiSigFacet } from '../../typechain-types'

export async function multiSigFacetFixture(): Promise<MultiSigFacet> {
    const factory = await ethers.getContractFactory("MultiSigFacet")
    return (await factory.deploy()) as MultiSigFacet
}