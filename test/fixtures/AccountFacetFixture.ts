import { ethers } from 'hardhat'
import { AccountFacet } from '../../typechain-types'

export async function accountFacetFixture(): Promise<AccountFacet> {
    const factory = await ethers.getContractFactory("AccountFacet")
    return (await factory.deploy()) as AccountFacet
}