import { ethers } from 'hardhat'
import { AccountFacetV2 } from '../../typechain-types'

export async function accountFacetV2Fixture(): Promise<AccountFacetV2> {
    const factory = await ethers.getContractFactory("AccountFacetV2")
    return (await factory.deploy()) as AccountFacetV2
}