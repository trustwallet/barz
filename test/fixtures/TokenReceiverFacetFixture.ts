import { ethers } from 'hardhat'
import { TokenReceiverFacet } from '../../typechain-types'

export async function tokenReceiverFacetFixture(): Promise<TokenReceiverFacet> {
    const factory = await ethers.getContractFactory("TokenReceiverFacet")
    return (await factory.deploy()) as TokenReceiverFacet
}